const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'moderation-summary-scheduler',
  dependencies: ['user-settings-api', 'auth.account'],

  settings: {
    enabled: String(process.env.MODERATION_MONTHLY_SUMMARY_ENABLED || 'true').toLowerCase() !== 'false',
    checkIntervalMs: Number(process.env.MODERATION_MONTHLY_SUMMARY_CHECK_INTERVAL_MS) || 10 * 60 * 1000,
    scheduleDayOfMonthUtc: Number(process.env.MODERATION_MONTHLY_SUMMARY_DAY_UTC) || 1,
    scheduleHourUtc: Number(process.env.MODERATION_MONTHLY_SUMMARY_HOUR_UTC) || 9,
    stateDir: process.env.PROVIDER_DATA_DIR || path.resolve('./data/provider'),
    stateFileName: 'moderation-summary-schedule-state.json'
  },

  created() {
    this._timer = null;
    this._running = false;
    this._state = {
      lastRunPeriod: null,
      lastRunAt: null,
      deliveredCount: 0,
      skippedCount: 0,
      failedCount: 0
    };
  },

  async started() {
    if (!this.settings.enabled) {
      this.logger.info('[ModerationSummaryScheduler] Disabled by configuration');
      return;
    }

    this._state = await this.loadState();

    this._timer = setInterval(
      () => {
        this.runScheduledDispatch().catch(error => {
          this.logger.warn('[ModerationSummaryScheduler] Scheduled dispatch failed', {
            error: error?.message
          });
        });
      },
      Math.max(60 * 1000, this.settings.checkIntervalMs)
    );

    this.runScheduledDispatch().catch(error => {
      this.logger.warn('[ModerationSummaryScheduler] Initial dispatch check failed', {
        error: error?.message
      });
    });
  },

  async stopped() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  actions: {
    async runNow(ctx) {
      const force = Boolean(ctx.params?.force);
      return this.runScheduledDispatch({ force });
    },

    async status() {
      return {
        enabled: this.settings.enabled,
        running: this._running,
        schedule: {
          dayOfMonthUtc: this.settings.scheduleDayOfMonthUtc,
          hourUtc: this.settings.scheduleHourUtc
        },
        state: this._state
      };
    }
  },

  methods: {
    stateFilePath() {
      return path.join(this.settings.stateDir, this.settings.stateFileName);
    },

    currentPeriodKey(now = new Date()) {
      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    },

    isInScheduleWindow(now = new Date()) {
      return (
        now.getUTCDate() === this.settings.scheduleDayOfMonthUtc && now.getUTCHours() === this.settings.scheduleHourUtc
      );
    },

    async loadState() {
      try {
        const content = await fs.promises.readFile(this.stateFilePath(), 'utf8');
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object') {
          return {
            ...this._state,
            ...parsed
          };
        }
      } catch {
        // Ignore missing state and start fresh.
      }

      return { ...this._state };
    },

    async saveState() {
      await fs.promises.mkdir(this.settings.stateDir, { recursive: true });
      await fs.promises.writeFile(this.stateFilePath(), JSON.stringify(this._state, null, 2), 'utf8');
    },

    async runScheduledDispatch({ force = false } = {}) {
      if (!this.settings.enabled) {
        return { skipped: true, reason: 'disabled' };
      }

      if (this._running) {
        return { skipped: true, reason: 'already_running' };
      }

      const now = new Date();
      const periodKey = this.currentPeriodKey(now);
      const inWindow = this.isInScheduleWindow(now);

      if (!force && !inWindow) {
        return { skipped: true, reason: 'outside_schedule_window' };
      }

      if (!force && this._state.lastRunPeriod === periodKey) {
        return { skipped: true, reason: 'already_dispatched_for_period' };
      }

      this._running = true;
      let deliveredCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      try {
        const accounts = await this.broker.call('auth.account.find');

        for (const account of accounts) {
          const webId = account?.webId;
          if (!webId) continue;

          try {
            const result = await this.broker.call('user-settings-api.dispatchMonthlyModerationSummary', {
              webId,
              force,
              reason: force ? 'manual-scheduler' : 'scheduled'
            });

            if (result?.delivered) deliveredCount += 1;
            else if (result?.skipped) skippedCount += 1;
            else failedCount += 1;
          } catch (error) {
            failedCount += 1;
            this.logger.warn('[ModerationSummaryScheduler] Per-user delivery failed', {
              webId,
              error: error?.message
            });
          }
        }

        this._state = {
          ...this._state,
          lastRunPeriod: periodKey,
          lastRunAt: new Date().toISOString(),
          deliveredCount,
          skippedCount,
          failedCount
        };

        await this.saveState();

        this.logger.info('[ModerationSummaryScheduler] Monthly moderation summary dispatch complete', {
          periodKey,
          deliveredCount,
          skippedCount,
          failedCount
        });

        return {
          skipped: false,
          periodKey,
          deliveredCount,
          skippedCount,
          failedCount
        };
      } finally {
        this._running = false;
      }
    }
  }
};
