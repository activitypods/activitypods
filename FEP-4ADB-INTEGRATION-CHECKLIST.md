# FEP-4adb Integration Checklist

This checklist guides integration of the four FEP-4adb services into ActivityPods backend.

## File Locations

Create/verify these four service files exist in `/pod-provider/backend/services/core/`:

- [ ] `fep-4adb-dereferencer.js` (406 lines)
- [ ] `fep-4adb-webfinger.js` (134 lines)
- [ ] `fep-4adb-processor.js` (360 lines)
- [ ] `fep-4adb-outbound.js` (340 lines)

## Step 1: Register Services with Broker

**File**: `pod-provider/backend/index.js` or equivalent broker initialization

```javascript
// Add to the service loader
const broker = new ServiceBroker({...});

// Load all core services including FEP-4adb
broker.loadService('./services/core/fep-4adb-dereferencer.js');
broker.loadService('./services/core/fep-4adb-webfinger.js');
broker.loadService('./services/core/fep-4adb-processor.js');
broker.loadService('./services/core/fep-4adb-outbound.js');

// Or use glob pattern if available:
broker.loadService('./services/core/**/*.js');
```

**Verification**:

```bash
# After broker starts, check logs for:
# INFO Loaded service: fep-4adb-dereferencer
# INFO Loaded service: fep-4adb-webfinger
# INFO Loaded service: fep-4adb-processor
# INFO Loaded service: fep-4adb-outbound
```

## Step 2: Integrate with ActivityPub Actor Service

**File**: `services/activitypub/actor.js` (or mixin if separate)

**Task**: Add enrichment hook when actors created/updated

```javascript
// In the actor service definition:

module.exports = {
  name: 'activitypub.actor',

  // ... existing settings ...

  hooks: {
    after: {
      create: 'enrichActorWithFEP4adbContext',
      update: 'enrichActorWithFEP4adbContext'
    }
  },

  actions: {
    // ... existing actions ...
  },

  methods: {
    // New method to enrich actor with FEP-4adb context
    async enrichActorWithFEP4adbContext(ctx) {
      // ctx.result is the created/updated actor
      if (!ctx.result.id) {
        return;
      }

      try {
        // Ensure actor has FEP-4adb context if it has aliases
        if (ctx.result.alsoKnownAs && Array.isArray(ctx.result.alsoKnownAs)) {
          // Enrich with @context
          if (!ctx.result['@context']) {
            ctx.result['@context'] = ['https://www.w3.org/ns/activitystreams'];
          } else if (typeof ctx.result['@context'] === 'string') {
            ctx.result['@context'] = [ctx.result['@context']];
          }

          // Add xrd:Alias context if not present
          if (!ctx.result['@context'].includes('https://oasis-open.github.io/xrd/ns/')) {
            ctx.result['@context'].push('https://oasis-open.github.io/xrd/ns/');
          }
        }
      } catch (err) {
        this.logger.warn(`Error enriching actor with FEP-4adb context: ${err.message}`);
      }
    }
  }
};
```

**Verification**:

```bash
# Create an actor with aliases and check it has the FEP-4adb context
curl -H "Accept: application/activity+json" \
  https://your-pod.com/users/alice | jq '.["@context"]'
# Should include: "https://oasis-open.github.io/xrd/ns/"
```

## Step 3: Integrate with ActivityPub Inbox Service

**File**: `services/activitypub/inbox.js`

**Task**: Process incoming activities for alternative identifiers

```javascript
// In the inbox/activity processing service:

module.exports = {
  name: 'activitypub.inbox',

  dependencies: ['fep-4adb-processor', 'fep-4adb-dereferencer'],

  actions: {
    // Before processing activity, dereference identifiers
    async 'process': {
      async handler(ctx) {
        const { activity, actorId } = ctx.params;

        // Get the pod domain for identifier context
        const podDomain = this.getPodDomain(actorId);

        // Process the activity to dereference alternative identifiers
        try {
          const processed = await ctx.call('fep-4adb-processor.processObject', {
            object: activity,
            contextDomain: podDomain
          });

          // Continue with normal processing using dereferenced activity
          return this.processActivity(ctx, processed);
        } catch (err) {
          this.logger.warn(`Failed to dereference activity: ${err.message}`);
          // Continue with original activity on error
          return this.processActivity(ctx, activity);
        }
      }
    }
  },

  methods: {
    getPodDomain(actorId) {
      try {
        return new URL(actorId).hostname;
      } catch (err) {
        return null;
      }
    },

    async processActivity(ctx, activity) {
      // Original activity processing logic
      // Now with dereferenced identifiers
    }
  }
};
```

**Verification**:

```bash
# Send an activity with an acct: actor and verify it's dereferenced
# Check logs for FEP-4adb dereferencer calls
# Verify actor property is resolved to HTTP(S) URL
```

## Step 4: Integrate with ActivityPub Outbox Service

**File**: `services/activitypub/outbox.js`

**Task**: Prepare outbound activities with FEP-4adb support

```javascript
// In the outbox service:

module.exports = {
  name: 'activitypub.outbox',

  dependencies: ['fep-4adb-outbound', 'fep-4adb-dereferencer'],

  actions: {
    // Before sending activity, prepare with FEP-4adb support
    async 'create': {
      async handler(ctx) {
        const { activity, actorId } = ctx.params;

        // Prepare activity with aliases and resolved recipients
        try {
          const prepared = await ctx.call('fep-4adb-outbound.prepareOutboundActivity', {
            activity,
            actorId
          });

          // Send the prepared activity
          return this.sendActivity(ctx, prepared);
        } catch (err) {
          this.logger.warn(`Error preparing activity for FEP-4adb: ${err.message}`);
          // Send original activity on error
          return this.sendActivity(ctx, activity);
        }
      }
    }
  },

  methods: {
    async sendActivity(ctx, activity) {
      // Original activity sending logic
      // Activity now includes alternatives and resolved recipients
    }
  }
};
```

**Verification**:

```bash
# Create an activity with the actor
# Check that outbound activity includes alsoKnownAs
# Verify recipients like "acct:" are resolved to HTTP(S) URLs
```

## Step 5: Configure Webfinger Integration

**File**: Configuration for webfinger service integration

Verify that the webfinger service is loaded and the FEP-4adb webfinger service can communicate with it:

```javascript
// Check if webfinger service is available
broker.has('webfinger'); // Should return true

// The fep-4adb-webfinger service will automatically:
// 1. Register aliases when actors are created
// 2. Enhance webfinger responses with aliases
// 3. Gracefully degrade if webfinger service not available
```

**Manual Test** (if webfinger service available):

```bash
# Webfinger lookup should include aliases
curl -s "https://your-pod.com/.well-known/webfinger?resource=acct:alice@your-pod.com" | jq '.aliases'
# Should return array of alternative identifiers
```

## Step 6: Add Helper Methods to Core Services

**File**: `services/core/common.js` or utility module

Optional: Add helpers for common FEP-4adb operations:

```javascript
// Export common FEP-4adb operations
module.exports = {
  async dereferenceActor(ctx, actorId, contextDomain) {
    if (actorId.startsWith('acct:') || actorId.startsWith('did:')) {
      return await ctx.call('fep-4adb-processor.resolveIdentifier', {
        identifier: actorId,
        contextDomain
      });
    }
    return actorId;
  },

  async verifyActorIdentity(ctx, identifier, expectedActorId, contextDomain) {
    return await ctx.call('fep-4adb-processor.validateIdentifierOwnership', {
      identifier,
      expectedActorId,
      contextDomain
    });
  },

  async addActorAlias(ctx, actorId, alias) {
    return await ctx.call('fep-4adb-dereferencer.addAlias', {
      actorId,
      alias
    });
  }
};
```

## Step 7: Testing

### Unit Tests

Create test files: `tests/fep-4adb-*.test.js`

```javascript
describe('FEP-4adb Integration', () => {
  let broker, ctx;

  beforeAll(async () => {
    broker = new ServiceBroker();
    // Load services...
    await broker.start();
    ctx = broker.cacher;
  });

  test('should dereference acct: identifier in incoming activity', async () => {
    const activity = {
      type: 'Create',
      actor: 'acct:alice@example.org'
    };

    const processed = await broker.call('fep-4adb-processor.processObject', {
      object: activity,
      contextDomain: 'example.org'
    });

    expect(processed.actor).toMatch(/^https?:\/\//);
  });

  test('should add actor alias', async () => {
    await broker.call('fep-4adb-dereferencer.addAlias', {
      actorId: 'https://our-pod.com/users/alice',
      alias: 'acct:alice@other.com'
    });

    const aliases = await broker.call('fep-4adb-dereferencer.listAliases', {
      actorId: 'https://our-pod.com/users/alice'
    });

    expect(aliases).toContain('acct:alice@other.com');
  });

  test('should prepare outbound activity with aliases', async () => {
    const activity = {
      type: 'Note',
      content: 'Hello'
    };

    const prepared = await broker.call('fep-4adb-outbound.prepareOutboundActivity', {
      activity,
      actorId: 'https://our-pod.com/users/alice'
    });

    expect(prepared.alsoKnownAs).toBeDefined();
  });
});
```

### Integration Test

```bash
# 1. Start the backend with FEP-4adb services
npm start

# 2. Create an actor with alias
curl -X POST https://your-pod.com/api/actors \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","preferredUsername":"alice","alsoKnownAs":["acct:alice@other.com"]}'

# 3. Verify alias was registered
curl https://your-pod.com/.well-known/webfinger?resource=acct:alice@your-pod.com

# 4. Create activity from that actor
curl -X POST https://your-pod.com/alice/outbox \
  -H "Content-Type: application/json" \
  -d '{"type":"Note","content":"Hello","to":["Public"]}'

# 5. Verify outbound activity includes alsoKnownAs
# Check federation logs for verification
```

## Step 8: Monitoring & Debugging

### Enable Debug Logging

```javascript
// In broker config:
{
  logger: true,
  logLevel: 'debug',
  logFilter: ['fep-4adb*'] // Only FEP-4adb services
}
```

### Common Issues & Solutions

| Issue                                     | Diagnosis                                | Solution                                          |
| ----------------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Services not loading                      | Check logs for service load errors       | Verify file paths in broker config                |
| Aliases not showing in webfinger          | Webfinger service might not be loaded    | Load webfinger before fep-4adb-webfinger          |
| Dereferencing returns original identifier | Webfinger lookup failed                  | Check domain/DNS resolution, enable debug logging |
| Outbound activities missing alsoKnownAs   | prepareOutboundActivity not called       | Verify outbox hook is registered                  |
| Actor enrichment not working              | enrichActorWithFEP4adbContext not called | Check actor service hooks configuration           |

### Health Check Endpoint

Optional: Add a health endpoint to verify FEP-4adb is working:

```javascript
{
  name: 'api.health',
  actions: {
    'fep-4adb-ready': {
      async handler(ctx) {
        const ready = {
          dereferencer: await ctx.broker.has('fep-4adb-dereferencer'),
          webfinger: await ctx.broker.has('fep-4adb-webfinger'),
          processor: await ctx.broker.has('fep-4adb-processor'),
          outbound: await ctx.broker.has('fep-4adb-outbound'),
          webfingerService: await ctx.broker.has('webfinger')
        };
        return ready;
      }
    }
  }
}
```

## Deployment Checklist

- [ ] All 4 service files created and verified
- [ ] Services loaded in broker configuration
- [ ] Actor service enrichment hook added
- [ ] Inbox service integration tested
- [ ] Outbox service integration tested
- [ ] Webfinger configuration verified
- [ ] Unit tests written and passing
- [ ] Integration tests performed
- [ ] Debug logging verified
- [ ] Monitoring/health checks in place
- [ ] Documentation updated with FEP-4adb endpoints
- [ ] Federation partners notified of FEP-4adb support

## Rollback Plan

If issues occur:

1. **Stop the broker**: `npm stop`
2. **Remove service imports** from broker config
3. **Remove integration hooks** from related services
4. **Restart broker**: `npm start`
5. **Verify normal operation** without FEP-4adb
6. **Debug**: Check logs, review integration points
7. **Redeploy**: Address issues and reintegrate

## Validation

After full integration, these should work:

```javascript
// 1. Dereference acct: identifier
await broker.call('fep-4adb-processor.resolveIdentifier', {
  identifier: 'acct:alice@example.org',
  contextDomain: 'example.org'
});

// 2. Add alias to actor
await broker.call('fep-4adb-dereferencer.addAlias', {
  actorId: 'https://your-pod.com/users/alice',
  alias: 'acct:alice@other.com'
});

// 3. Process incoming activity
await broker.call('fep-4adb-processor.processObject', {
  object: { type: 'Create', actor: 'acct:alice@example.org' },
  contextDomain: 'your-pod.com'
});

// 4. Prepare outbound activity
await broker.call('fep-4adb-outbound.prepareOutboundActivity', {
  activity: { type: 'Note', content: 'Hello' },
  actorId: 'https://your-pod.com/users/alice'
});
```

All four should execute without errors and return complete results.
