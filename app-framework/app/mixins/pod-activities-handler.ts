// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema } from 'moleculer';

const Schema = {
  dependencies: ['pod-activities-watcher'],
  async started() {
    // @ts-expect-error TS(2339): Property 'schema' does not exist on type 'void'.
    if (!this.schema.activities) throw new Error(`No activities defined for service ${this.name}`);

    // @ts-expect-error TS(2339): Property 'schema' does not exist on type 'void'.
    for (const [key, activityHandler] of Object.entries(this.schema.activities)) {
      const boxTypes = [];
      // @ts-expect-error TS(18046): 'activityHandler' is of type 'unknown'.
      if (activityHandler.onReceive) boxTypes.push('inbox');
      // @ts-expect-error TS(18046): 'activityHandler' is of type 'unknown'.
      if (activityHandler.onEmit) boxTypes.push('outbox');

      // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
      await this.broker.call('pod-activities-watcher.watch', {
        // @ts-expect-error TS(18046): 'activityHandler' is of type 'unknown'.
        matcher: typeof activityHandler.match === 'function' ? activityHandler.match.bind(this) : activityHandler.match,
        // @ts-expect-error TS(2339): Property 'name' does not exist on type 'void'.
        actionName: this.name + '.processActivity',
        boxTypes,
        key
      });
    }
  },
  actions: {
    processActivity: {
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { key, boxType, dereferencedActivity, actorUri } = ctx.params;

        const activityHandler = this.schema.activities[key];

        if (!activityHandler) {
          this.logger.warn(`Cannot process activity because no handler with key ${key} found`);
          return dereferencedActivity;
        }

        if (boxType === 'inbox' && activityHandler.onReceive) {
          return await activityHandler.onReceive.bind(this)(ctx, dereferencedActivity, actorUri);
        } else if (boxType === 'outbox' && activityHandler.onEmit) {
          return await activityHandler.onEmit.bind(this)(ctx, dereferencedActivity, actorUri);
        } else {
          this.logger.warn(
            `Cannot process activity because no onReceive or onEmit methods are associated with with key ${key}`
          );
          return dereferencedActivity;
        }
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
