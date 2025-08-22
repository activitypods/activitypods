import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import Handlebars from 'handlebars';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'sani... Remove this comment to see the full error message
import sanitizeHtml from 'sanitize-html';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'mole... Remove this comment to see the full error message
import MailService from 'moleculer-mail';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'mole... Remove this comment to see the full error message
import QueueService from 'moleculer-bull';
import { ActivitiesHandlerMixin } from '@semapps/activitypub';
import { arrayOf, isObject } from '@semapps/ldp';
import * as CONFIG from '../config/config.ts';
import transport from '../config/transport.ts';
import { ServiceSchema } from 'moleculer';

const MailNotificationsSchema = {
  name: 'mail-notifications' as const,
  mixins: [MailService, ActivitiesHandlerMixin, QueueService(CONFIG.QUEUE_SERVICE_URL)],
  settings: {
    frontendUrl: CONFIG.FRONTEND_URL,
    handlebars: {
      helpers: {
        encodeUri: (uri: any) => encodeURIComponent(uri),
        removeHtmlTags: (text: any) => sanitizeHtml(text, { allowedTags: [] }).trim()
      }
    },
    // See moleculer-mail doc https://github.com/moleculerjs/moleculer-addons/tree/master/packages/moleculer-mail
    templateFolder: path.join(__dirname, '../templates'),
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport,
    data: {
      color: CONFIG.COLOR_PRIMARY
    }
  },
  async started() {
    for (const [name, fn] of Object.entries(this.settings.handlebars.helpers)) {
      this.logger.info(`Registering handlebars helper ${name}`);
      // @ts-expect-error TS(2345): Argument of type 'unknown' is not assignable to pa... Remove this comment to see the full error message
      Handlebars.registerHelper(name, fn);
    }
  },
  actions: {
    notify: {
      // Allow local service to send directly notifications without sending a apods:Notification activity
      async handler(ctx) {
        const { template, recipientUri, activity, context, ...rest } = ctx.params;

        const account = await ctx.call('auth.account.findByWebId', { webId: recipientUri });
        const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });
        const locale = recipient['schema:knowsLanguage'] || 'en';

        const emitter = await ctx.call('activitypub.actor.get', { actorUri: activity.actor, webId: recipientUri });

        let emitterProfile = {};
        try {
          // @ts-expect-error TS(2339): Property 'url' does not exist on type 'never'.
          emitterProfile = emitter.url
            ? await ctx.call('activitypub.actor.getProfile', { actorUri: activity.actor, webId: recipientUri })
            : {};
        } catch (e) {
          this.logger.warn(`Could not get profile of actor ${activity.actor}`);
        }

        const templateParams = { activity, emitter, emitterProfile, ...rest };

        const values = this.parseTemplate(template, templateParams, locale);

        return await this.queueMail(ctx, values.title, {
          // @ts-expect-error TS(2339): Property 'email' does not exist on type 'never'.
          to: account.email,
          data: {
            title: values.title,
            content: values.content,
            contentWithBr: values.content ? values.content.replace(/\r\n|\r|\n/g, '<br />') : undefined,
            actions: arrayOf(values.actions).map(action => ({
              caption: action.caption,
              link: action.link.startsWith('http') ? action.link : urlJoin(this.settings.frontendUrl, action.link)
            })),
            ...this.settings.data
          }
        });
      }
    }
  },
  activities: {
    appNotification: {
      match: {
        type: 'apods:Notification'
      },
      async onReceive(ctx: any, activity: any, recipientUri: any) {
        // TODO Allow to user to disable notifications from given applications
        // if (!(await ctx.call('app-registrations.isRegistered', { agentUri: activity.actor, podOwner: recipientUri }))) {
        //   this.logger.warn(`Application ${activity.actor} is not registered by ${recipientUri}`);
        //   return;
        // }

        const account = await ctx.call('auth.account.findByWebId', { webId: recipientUri });

        // @ts-expect-error TS(2339): Property 'queueMail' does not exist on type '{ mat... Remove this comment to see the full error message
        await this.queueMail(ctx, activity.name, {
          to: account.email,
          data: {
            title: activity.name,
            content: activity.content,
            contentWithBr: activity.content ? activity.content.replace(/\r\n|\r|\n/g, '<br />') : undefined,
            actions: arrayOf(activity.url).map(url => ({ caption: url.name, link: url.href })),
            // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ matc... Remove this comment to see the full error message
            ...this.settings.data
          }
        });
      }
    }
  },
  methods: {
    async queueMail(ctx, title, payload) {
      payload.template = 'single-mail';
      if (this.createJob) {
        return this.createJob('sendMail', title, payload);
      }
      return await this.actions.send(payload, { parentCtx: ctx });
    },
    parseTemplate(template, params, locale) {
      return (
        template &&
        Object.fromEntries(
          // @ts-expect-error TS(2769): No overload matches this call.
          Object.entries(template).map(([key, value]) => {
            if (typeof value === 'string') {
              const compiledValue = Handlebars.compile(value);
              return [key, compiledValue(params)];
            } else if (isObject(value)) {
              // If we have an object with locales mapping, look for the right locale
              // @ts-expect-error TS(18046): 'value' is of type 'unknown'.
              if (value[locale]) {
                // @ts-expect-error TS(18046): 'value' is of type 'unknown'.
                const compiledValue = Handlebars.compile(value[locale]);
                return [key, compiledValue(params)];
              } else {
                throw new Error(`No ${locale} locale found for key ${key}`);
              }
            } else if (Array.isArray(value)) {
              return [key, value.map(v => this.parseTemplate(v, params, locale))];
            }
          })
        )
      );
    }
  },
  queues: {
    sendMail: {
      name: '*',
      // @ts-expect-error TS(7023): 'process' implicitly has return type 'any' because... Remove this comment to see the full error message
      async process(job: any) {
        job.progress(0);
        // @ts-expect-error TS(7022): 'result' implicitly has type 'any' because it does... Remove this comment to see the full error message
        const result = await this.actions.send(job.data);
        job.progress(100);
        return result;
      }
    }
  }
} satisfies ServiceSchema;

export default MailNotificationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [MailNotificationsSchema.name]: typeof MailNotificationsSchema;
    }
  }
}
