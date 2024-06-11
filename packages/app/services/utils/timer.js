module.exports = {
  name: 'timer',
  actions: {
    async set(ctx) {
      const { key, time, actionName, params } = ctx.params;

      // Delete any existing timer with the same key
      await this.actions.delete({ key }, { parentCtx: ctx });

      this.createJob(
        'timeout',
        this.serializeKey(key),
        { actionName, params, time },
        {
          delay: new Date(time) - Date.now()
        }
      );
    },
    async delete(ctx) {
      let { key } = ctx.params;
      key = this.serializeKey(key);

      const jobs = await this.getQueue('timeout').getJobs('delayed');

      // TODO find how to delete a job by key
      console.log('jobs', jobs);

      for (const job of jobs) {
        if (job.name === key) {
          this.logger.info(`Removing job ${job.id}...`);
          await job.remove();
        }
      }
    }
  },
  methods: {
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