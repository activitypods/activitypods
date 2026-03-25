const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'account-provisioning-state',

  created() {
    this.states = new Map();
  },

  actions: {
    begin: {
      params: {
        username: 'string|min:1'
      },
      handler(ctx) {
        const provisioningId = `prov-${crypto.randomUUID()}`;
        const now = new Date().toISOString();

        this.states.set(provisioningId, {
          provisioningId,
          username: ctx.params.username,
          state: 'started',
          createdAt: now,
          updatedAt: now,
          phases: {}
        });

        return { provisioningId };
      }
    },

    markPhase: {
      params: {
        provisioningId: 'string|min:1',
        phase: 'string|min:1',
        status: { type: 'enum', values: ['started', 'completed', 'failed'] },
        detail: { type: 'string', optional: true }
      },
      handler(ctx) {
        const { provisioningId, phase, status, detail } = ctx.params;
        const entry = this.states.get(provisioningId);

        if (!entry) {
          throw new MoleculerError('Provisioning state not found', 404, 'PROVISIONING_NOT_FOUND');
        }

        const now = new Date().toISOString();
        entry.phases[phase] = {
          phase,
          status,
          detail: detail || null,
          updatedAt: now
        };
        entry.updatedAt = now;

        this.states.set(provisioningId, entry);
        return { ok: true };
      }
    },

    finalize: {
      params: {
        provisioningId: 'string|min:1',
        state: { type: 'enum', values: ['completed', 'failed'] }
      },
      handler(ctx) {
        const { provisioningId, state } = ctx.params;
        const entry = this.states.get(provisioningId);

        if (!entry) {
          throw new MoleculerError('Provisioning state not found', 404, 'PROVISIONING_NOT_FOUND');
        }

        entry.state = state;
        entry.updatedAt = new Date().toISOString();
        this.states.set(provisioningId, entry);

        return { ok: true };
      }
    },

    get: {
      params: {
        provisioningId: 'string|min:1'
      },
      handler(ctx) {
        return this.states.get(ctx.params.provisioningId) || null;
      }
    }
  }
};
