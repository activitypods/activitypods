import { ServiceSchema } from 'moleculer';

const TimerSchema = {
  name: 'timer' as const,
  actions: {
    get: {
      async handler(ctx) {
        const { key } = ctx.params;

        const job = await this.getJob(key);

        if (job) {
          return job.data;
        } else {
          return false;
        }
      }
    },

    set: {
      async handler(ctx) {
        const { key, time, actionName, params, repeat } = ctx.params;

        // Delete any existing timer with the same key
        await this.actions.delete({ key }, { parentCtx: ctx });

        this.createJob(
          'timeout',
          this.serializeKey(key),
          { actionName, params, time },
          {
            // @ts-expect-error TS(2362): The left-hand side of an arithmetic operation must... Remove this comment to see the full error message
            delay: new Date(time) - Date.now(),
            // Try again after 3 minutes and until 12 hours later
            attempts: 8,
            backoff: { type: 'exponential', delay: '180000' },
            repeat: repeat && { every: repeat }
          }
        );
      }
    },

    delete: {
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { key } = ctx.params;

        const job = await this.getJob(key);

        if (job) {
          this.logger.info(`Removing job ${job.name}...`);
          try {
            await job.remove();
          } catch (e) {
            this.logger.warn(`Failed removing job ${job.name}...`);
          }
        }
      }
    }
  },
  methods: {
    async getJob(key) {
      key = this.serializeKey(key);

      const jobs = await this.getQueue('timeout').getJobs('delayed');

      for (const job of jobs) {
        if (job.name === key) {
          return job;
        }
      }

      // No matching job found
      return false;
    },
    serializeKey(key) {
      if (Array.isArray(key)) {
        return key.join('|');
      } else {
        return key;
      }
    }
  },
  queues: {
    timeout: {
      name: '*',
      // @ts-expect-error TS(7023): 'process' implicitly has return type 'any' because... Remove this comment to see the full error message
      async process(job: any) {
        const { actionName, params } = job.data;
        job.progress(0);
        // @ts-expect-error TS(7022): 'result' implicitly has type 'any' because it does... Remove this comment to see the full error message
        const result = await this.broker.call(actionName, params);
        job.progress(100);
        return result;
      }
    }
  }
} satisfies ServiceSchema;

export default TimerSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [TimerSchema.name]: typeof TimerSchema;
    }
  }
}
