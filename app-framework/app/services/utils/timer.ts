const TimerSchema = {
  name: 'timer',
  actions: {
    async get(ctx) {
      const { key } = ctx.params;

      const job = await this.getJob(key);

      if (job) {
        return job.data;
      } else {
        return false;
      }
    },
    async set(ctx) {
      const { key, time, actionName, params, repeat } = ctx.params;

      // Delete any existing timer with the same key
      await this.actions.delete({ key }, { parentCtx: ctx });

      this.createJob(
        'timeout',
        this.serializeKey(key),
        { actionName, params, time },
        {
          delay: new Date(time) - Date.now(),
          // Try again after 3 minutes and until 12 hours later
          attempts: 8,
          backoff: { type: 'exponential', delay: '180000' },
          repeat: repeat && { every: repeat }
        }
      );
    },
    async delete(ctx) {
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
      async process(job) {
        const { actionName, params } = job.data;
        job.progress(0);
        const result = await this.broker.call(actionName, params);
        job.progress(100);
        return result;
      }
    }
  }
};

export default TimerSchema;
