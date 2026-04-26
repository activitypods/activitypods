# FEP-4adb Implementation Guide

## Overview

This implementation provides complete support for FEP-4adb (Dereferencing identifiers with webfinger) in ActivityPods. It consists of four integrated services:

1. **fep-4adb-dereferencer** - Core identifier dereferencing logic
2. **fep-4adb-webfinger** - Webfinger integration for alias management
3. **fep-4adb-processor** - Object processing and validation
4. **fep-4adb-outbound** - Outbound activity creation and sending

## Supported Identifier Schemes

- `acct:` - Traditional Mastodon-style (acct:user@domain)
- `did:` - Decentralized Identifiers
- `mailto:` - Email-style URIs
- `http://` / `https://` - Direct HTTP(S) URLs

## Service Architecture

```
┌─────────────────────────────────────────┐
│  ActivityPub Incoming/Outgoing Flow     │
└────────────┬────────────────────────────┘
             │
    ┌────────┴────────────────┬──────────────────┐
    ▼                         ▼                  ▼
┌──────────────┐  ┌──────────────────┐  ┌──────────────┐
│ Processor    │  │ Outbound Flow    │  │ Webfinger    │
│ (incoming)   │  │ (actor actions)  │  │ Integration  │
└──────┬───────┘  └────────┬─────────┘  └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌──────▼──────────┐
                    │ Dereferencer    │
                    │ (core logic)    │
                    └────────────────┘
```

## Core Workflows

### 1. Identifier Dereferencing (Incoming)

When processing an incoming ActivityPub object that references an alternative identifier:

```javascript
// Example: Processing an activity from acct:alice@example.org
const activity = {
  type: 'Create',
  actor: 'acct:alice@example.org',  // Alternative identifier
  object: { ... }
};

// Dereference the identifier
const actor = await ctx.call('fep-4adb-processor.processObject', {
  object: activity,
  contextDomain: 'some-domain.com'
});

// Result: activity.actor is now the full HTTP(S) actor URL
```

**Key Points:**

- Extracts domain from identifier scheme
- Performs webfinger lookup
- Returns the ActivityPub actor object
- Falls back gracefully if dereferencing fails

### 2. Alias Registration (Actor Setup)

When an actor declares alternative identifiers:

```javascript
// Add alias to actor
await ctx.call('fep-4adb-dereferencer.addAlias', {
  actorId: 'https://domain.com/users/alice',
  alias: 'acct:alice@another-domain.com'
});

// This:
// 1. Updates the actor's alsoKnownAs
// 2. Enriches with xrd:Alias JSON-LD context
// 3. Registers with webfinger service
// 4. Makes the alias discoverable via /.well-known/webfinger
```

### 3. Outbound Activities with Aliases

When the actor sends activities:

```javascript
// Prepare activity for sending
const activity = {
  type: 'Create',
  object: { ... }
};

const prepared = await ctx.call('fep-4adb-outbound.prepareOutboundActivity', {
  activity,
  actorId: 'https://domain.com/users/alice'
});

// Result includes:
// - activity.alsoKnownAs with all the actor's aliases
// - All recipients resolved (acct: → http(s):)
// - Full FEP-4adb compatibility
```

### 4. Identifier Verification (FEP-c390)

Validate that a claimed identifier belongs to its actor:

```javascript
// Verify an identifier resolves to the expected actor
const isValid = await ctx.call('fep-4adb-processor.validateIdentifierOwnership', {
  identifier: 'acct:alice@example.org',
  expectedActorId: 'https://domain.com/users/alice',
  contextDomain: 'domain.com'
});

// This ensures the identifier chain:
// acct:alice@example.org
//   → webfinger lookup at example.org
//   → application/activity+json link href
//   → fetched actor object
//   → compare ID matches expectedActorId
```

## Integration Points

### With ActivityPub Actor Service

The dereferencer should be integrated into the actor creation/update workflow:

```javascript
// In activitypub.actor service (mixin or hook)
{
  name: 'activitypub.actor',

  hooks: {
    after: {
      // After actor is created or updated
      'create': async (ctx) => {
        if (ctx.result.alsoKnownAs) {
          // Enrich with FEP-4adb support
          await ctx.call('fep-4adb-dereferencer.enrichActorWithAliases', {
            actor: ctx.result
          });
        }
      }
    }
  }
}
```

### With Webfinger Service

The webfinger endpoint automatically serves aliases:

```javascript
// GET /.well-known/webfinger?resource=acct:user@domain
// Response includes:
{
  "subject": "acct:user@domain",
  "aliases": [
    "acct:user@other-domain.com",
    "did:web:user.example.com"
  ],
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://domain.com/users/user"
    }
  ]
}
```

### With Incoming Activity Processing

Should integrate into the activity validation pipeline:

```javascript
// In activitypub.inbox or activity processing
const processed = await ctx.call('fep-4adb-processor.processObject', {
  object: incomingActivity,
  contextDomain: inboxDomain
});

// Now all actor references are dereferenced
// and can be compared against known identities
```

## Configuration

### Service Settings

```javascript
// In each service definition

// fep-4adb-dereferencer
{
  settings: {
    webfingerTimeout: 5000,        // Timeout for webfinger requests
    maxRedirects: 5,               // HTTP redirect limit
    cacheAliases: true,            // Cache dereferenced identifiers
    cacheTTL: 3600000              // Cache TTL in milliseconds
  }
}

// fep-4adb-processor
{
  settings: {
    identifierProperties: [
      'actor', 'attributedTo', 'to', 'cc', 'bcc', 'attachment',
      'inReplyTo', 'object', 'origin', 'target'
    ]
  }
}

// fep-4adb-outbound
{
  settings: {
    includeAliasesInActivities: true,      // Add alsoKnownAs to outbound activities
    supportAlternativeSignatures: false    // (Future) Sign with alternative creds
  }
}
```

## Usage Examples

### Example 1: Federate with Alternative Identifiers

```javascript
// Message came in from acct:bob@other-federation.com
const incomingCreate = {
  type: 'Create',
  actor: 'acct:bob@other-federation.com',
  object: { content: 'Hello!' }
};

// Process it
const processed = await ctx.call('fep-4adb-processor.processObject', {
  object: incomingCreate,
  contextDomain: 'my-pod.com'
});

// Now actor is fully dereferenced
// → webfinger query at other-federation.com
// → finds link to Bob's actual actor: https://other-federation.com/users/bob
// → loads actor object with alsoKnownAs: ['acct:bob@other-federation.com']
```

### Example 2: Create Multi-Identity Actor

```javascript
// Alice creates identities on multiple servers
const alice = {
  id: 'https://server1.com/users/alice',
  name: 'Alice',
  alsoKnownAs: ['acct:alice@server2.com', 'did:web:alice.example.com', 'mailto:alice@example.org']
};

// Register each alias
for (const alias of alice.alsoKnownAs) {
  await ctx.call('fep-4adb-dereferencer.addAlias', {
    actorId: alice.id,
    alias
  });
}

// Now any of these identifiers will dereference to Alice's profile
```

### Example 3: Send Activity to Alternative Identifier

```javascript
// Send Create activity addressing alternative identifiers
const recipients = [
  'acct:followers@mastodon.social', // Can use acct:
  'did:web:some-instance.com', // DID format
  'https://instance.com/users/bob' // Traditional HTTP
];

const result = await ctx.call('fep-4adb-outbound.sendActivityToRecipients', {
  activity: {
    type: 'Create',
    object: { content: 'Hi everyone!' }
  },
  recipients
});

// All recipient identifiers are dereferenced to their inboxes
// Activity delivered to all three resolved endpoints
```

### Example 4: Verify Identity Claim

```javascript
// Validate that a signature came from the claimed actor
const isAuthentic = await ctx.call('fep-4adb-processor.validateIdentifierOwnership', {
  identifier: 'acct:claimed@example.org',
  expectedActorId: 'https://example.org/users/claimed',
  contextDomain: 'my-pod.com'
});

if (isAuthentic) {
  // Activity is from the claimed actor
  processActivity(activity);
} else {
  // Someone is spoofing an alternate identity
  reject(activity, 'Identity verification failed');
}
```

## Error Handling

All services provide graceful degradation:

### Webfinger Lookup Failure

```javascript
// If webfinger fails, dereferencer falls back to HTTP
try {
  const actor = await ctx.call('fep-4adb-dereferencer.dereferenceIdentifier', {
    identifier: 'acct:alice@example.org'
  });
  // Uses fallback paths if webfinger times out
} catch (err) {
  // Returns original identifier if all resolution attempts fail
  return identifier;
}
```

### Property Processing Failure

```javascript
const processed = await ctx.call('fep-4adb-processor.processObject', {
  object: activity,
  contextDomain
});

// If a property can't be dereferenced, the original value is preserved
// No errors thrown - graceful degradation
```

### Recipient Resolution Failure

```javascript
const { sent, failed } = await ctx.call('fep-4adb-outbound.sendActivityToRecipients', { activity, recipients });

// sent = successfully delivered
// failed = list of failed recipients with error details
// Can retry or alert about delivery failures
```

## Performance Considerations

1. **Caching**: Dereferencer caches resolved identifiers to avoid repeated webfinger queries
2. **Timeout Handling**: 5-second timeout on webfinger to prevent stalls
3. **Parallel Processing**: Actor enrichment happens concurrently with webfinger calls
4. **JSON-LD Context**: Contexts are cached at service startup

## Security Considerations

1. **Identifier Spoofing**: Always verify identifier ownership before trusting claims
2. **Domain Validation**: Webfinger lookups only trust `application/activity+json` links
3. **JSON-LD Injection**: Context enrichment validates against known @context sources
4. **Redirect Following**: Limited to 5 redirects to prevent redirect loops

## Future Enhancements

1. **Signature Verification**: Sign outbound activities with alternative identity credentials
2. **Batch Dereferencing**: Process multiple identifiers in parallel
3. **Cross-Protocol Support**: did:web, did:stellar, did:key formats
4. **Zero-Knowledge Proofs**: Prove ownership without public dereference
5. **Caching Service**: Redis-backed identifier cache for high-volume instances

## Debugging

Enable debug logging:

```javascript
// In broker configuration
{
  logLevel: 'debug',
  namespace: 'fep-4adb-*'  // Debug only FEP-4adb services
}
```

Common issues and solutions:

| Issue                    | Cause                     | Solution                                        |
| ------------------------ | ------------------------- | ----------------------------------------------- |
| Identifier not resolving | Webfinger domain wrong    | Check contextDomain parameter                   |
| Slow activity processing | Many derefs per activity  | Enable caching                                  |
| Redirect loops           | Webfinger redirects       | Check domain configuration                      |
| Missing aliases          | alias addAlias not called | Call addAlias during actor setup                |
| Verification fails       | Domain mismatch           | Verify expectedActorId matches webfinger lookup |

## Testing

### Unit Test Example

```javascript
describe('FEP-4adb Dereferencer', () => {
  it('should dereference acct: identifier', async () => {
    const result = await broker.call('fep-4adb-dereferencer.dereferenceIdentifier', {
      identifier: 'acct:alice@example.org',
      contextDomain: 'my-domain.com'
    });

    expect(result.id).toBe('https://example.org/users/alice');
    expect(result.alsoKnownAs).toContain('acct:alice@example.org');
  });

  it('should validate identifier ownership', async () => {
    const isValid = await broker.call('fep-4adb-processor.validateIdentifierOwnership', {
      identifier: 'acct:alice@example.org',
      expectedActorId: 'https://example.org/users/alice',
      contextDomain: 'my-domain.com'
    });

    expect(isValid).toBe(true);
  });
});
```

## Specification References

- **FEP-4adb**: https://gitea.activitypods.org/ActivityPods/ActivityPods/-/issues/200
- **FEP-c390**: Verifiable Identity Statement (used for proof verification)
- **WebFinger**: RFC 7033
- **Linked Data**: JSON-LD 1.1 W3C Specification
- **ActivityPub**: W3C Social Web Working Group
