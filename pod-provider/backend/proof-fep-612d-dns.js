'use strict';

/**
 * Proof: FEP-612d – Identifying ActivityPub Objects through DNS
 *
 * Verifies the core behaviours of:
 *   fep-612d-dns-resolver  (DNS TXT lookup + alsoKnownAs helpers)
 *   fep-4adb-dereferencer  (bare-domain routing)
 *   fep-4adb-processor     (bare-domain identifier resolution & validation)
 *
 * All tests run in-process without a live DNS server or HTTP stack.
 * The dns module and fetch are monkey-patched per test.
 */

const assert = require('assert');
const dns = require('dns').promises;

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function ok(label, fn) {
  try {
    await fn();
    console.log(`  [ok] ${label}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${label}`);
    console.error(`         ${err.message}`);
    failed++;
  }
}

// ─── module under test ──────────────────────────────────────────────────────

// We require the module fresh for each test group so that mocks apply cleanly.
function loadResolver() {
  // Bust the require cache so we can swap dns/fetch mocks
  delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
  return require('./services/core/fep-612d-dns-resolver');
}

// Build a minimal Moleculer-like service instance from a module definition.
function instantiate(mod, broker) {
  const svc = {
    ...mod,
    settings: { ...mod.settings },
    logger: {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: () => {}
    },
    broker
  };
  // Bind all methods
  if (mod.methods) {
    for (const [name, fn] of Object.entries(mod.methods)) {
      svc[name] = fn.bind(svc);
    }
  }
  return svc;
}

// Wrap an action handler so it looks like a ctx.call target
function makeCtx(broker, params = {}) {
  const call = broker && typeof broker.call === 'function'
    ? broker.call.bind(broker)
    : async () => { throw new Error('No broker provided'); };
  return { params, call, meta: {} };
}

// ─── §1  isBaredomain predicate ─────────────────────────────────────────────

(async () => {
  console.log('\n§ 1  isBaredomain predicate');

  const { isBaredomain } = loadResolver();

  await ok('accepts a simple domain', () => {
    assert.strictEqual(isBaredomain('mymath.rocks'), true);
  });

  await ok('accepts a subdomain', () => {
    assert.strictEqual(isBaredomain('sub.example.co.uk'), true);
  });

  await ok('rejects an acct: URI', () => {
    assert.strictEqual(isBaredomain('acct:user@example.com'), false);
  });

  await ok('rejects an http URL', () => {
    assert.strictEqual(isBaredomain('https://example.com/users/alice'), false);
  });

  await ok('rejects a plain hostname without TLD', () => {
    assert.strictEqual(isBaredomain('localhost'), false);
  });

  await ok('rejects an empty string', () => {
    assert.strictEqual(isBaredomain(''), false);
  });

// ─── §2  DNS TXT lookup ──────────────────────────────────────────────────────

  console.log('\n§ 2  DNS TXT lookup (lookupDnsTxtRecord)');

  const OBJECT_URI = 'https://mymath.rocks/endpoints/SYn3cl_N4HAPfPHgo2x37XunLEmhV9LnxCggcYwyec0';

  await ok('resolves _apobjid TXT record to the object URI', async () => {
    // Patch dns.resolveTxt to return our fake record
    const orig = dns.resolveTxt;
    dns.resolveTxt = async fqdn => {
      assert.strictEqual(fqdn, '_apobjid.mymath.rocks');
      return [[OBJECT_URI]];
    };

    try {
      delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
      const mod = require('./services/core/fep-612d-dns-resolver');
      const svc = instantiate(mod, {});

      const result = await svc.lookupTxtRecord('mymath.rocks');
      assert.strictEqual(result, OBJECT_URI);
    } finally {
      dns.resolveTxt = orig;
    }
  });

  await ok('returns null when ENOTFOUND', async () => {
    const orig = dns.resolveTxt;
    dns.resolveTxt = async () => {
      const err = new Error('ENOTFOUND');
      err.code = 'ENOTFOUND';
      throw err;
    };

    try {
      delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
      const mod = require('./services/core/fep-612d-dns-resolver');
      const svc = instantiate(mod, {});

      const result = await svc.lookupTxtRecord('no-record.example.com');
      assert.strictEqual(result, null);
    } finally {
      dns.resolveTxt = orig;
    }
  });

  await ok('concatenates multi-chunk TXT records', async () => {
    const orig = dns.resolveTxt;
    dns.resolveTxt = async () => [['https://example.com', '/actors/alice']];

    try {
      delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
      const mod = require('./services/core/fep-612d-dns-resolver');
      const svc = instantiate(mod, {});

      const result = await svc.lookupTxtRecord('example.com');
      assert.strictEqual(result, 'https://example.com/actors/alice');
    } finally {
      dns.resolveTxt = orig;
    }
  });

// ─── §3  resolveByDomain action ─────────────────────────────────────────────

  console.log('\n§ 3  resolveByDomain action');

  const ACTOR_OBJECT = {
    '@context': ['https://www.w3.org/ns/activitystreams'],
    id: OBJECT_URI,
    type: 'Person',
    preferredUsername: 'helge',
    name: 'Helge'
  };

  await ok('fetches and returns the ActivityPub object from the DNS URI', async () => {
    const origResolveTxt = dns.resolveTxt;
    dns.resolveTxt = async () => [[OBJECT_URI]];

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    const mod = require('./services/core/fep-612d-dns-resolver');

    // Provide a broker whose activitypub.actor.get returns our fake actor
    const broker = {
      call: async (action, params) => {
        if (action === 'activitypub.actor.get' && params.id === OBJECT_URI) {
          return ACTOR_OBJECT;
        }
        throw new Error(`unexpected broker call: ${action}`);
      }
    };
    const svc = instantiate(mod, broker);

    try {
      const ctx = makeCtx(broker, { domain: 'mymath.rocks' });
      const result = await mod.actions.resolveByDomain.call(svc, ctx);
      assert.strictEqual(result.id, OBJECT_URI);
      assert.strictEqual(result.preferredUsername, 'helge');
    } finally {
      dns.resolveTxt = origResolveTxt;
    }
  });

  await ok('throws when no TXT record exists', async () => {
    const origResolveTxt = dns.resolveTxt;
    dns.resolveTxt = async () => {
      const err = new Error('ENODATA');
      err.code = 'ENODATA';
      throw err;
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    const mod = require('./services/core/fep-612d-dns-resolver');
    const svc = instantiate(mod, {});

    try {
      await mod.actions.resolveByDomain.call(svc, makeCtx({}, { domain: 'no-record.example.com' }));
      assert.fail('Expected an error');
    } catch (err) {
      assert.match(err.message, /No _apobjid\.no-record\.example\.com TXT record found/);
    } finally {
      dns.resolveTxt = origResolveTxt;
    }
  });

  await ok('rejects non-domain input', async () => {
    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    const mod = require('./services/core/fep-612d-dns-resolver');
    const svc = instantiate(mod, {});

    let caught;
    try {
      await mod.actions.resolveByDomain.call(svc, makeCtx({}, { domain: 'acct:user@example.com' }));
    } catch (err) {
      caught = err;
    }
    assert.ok(caught, 'Expected an error for non-domain input');
  });

// ─── §4  addDomainToAlsoKnownAs action ──────────────────────────────────────

  console.log('\n§ 4  addDomainToAlsoKnownAs action');

  await ok('adds domain to actor alsoKnownAs', async () => {
    const actor = {
      id: 'https://example.com/actors/alice',
      type: 'Person',
      alsoKnownAs: ['acct:alice@example.com']
    };
    const updates = [];

    const broker = {
      call: async (action, params) => {
        if (action === 'activitypub.actor.get') return actor;
        if (action === 'activitypub.actor.update') {
          updates.push(params);
          return null;
        }
        throw new Error(`unexpected: ${action}`);
      }
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    const mod = require('./services/core/fep-612d-dns-resolver');
    const svc = instantiate(mod, broker);

    const ctx = makeCtx(broker, { actorId: actor.id, domain: 'alice.example.com' });
    const result = await mod.actions.addDomainToAlsoKnownAs.call(svc, ctx);

    assert.strictEqual(result.success, true);
    assert.ok(result.alsoKnownAs.includes('alice.example.com'));
    assert.ok(result.alsoKnownAs.includes('acct:alice@example.com'));
    assert.strictEqual(updates.length, 1);
  });

  await ok('is idempotent – skips update if domain already present', async () => {
    const actor = {
      id: 'https://example.com/actors/alice',
      alsoKnownAs: ['alice.example.com']
    };
    const updates = [];

    const broker = {
      call: async (action) => {
        if (action === 'activitypub.actor.get') return actor;
        if (action === 'activitypub.actor.update') { updates.push(1); return null; }
        throw new Error(`unexpected: ${action}`);
      }
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    const mod = require('./services/core/fep-612d-dns-resolver');
    const svc = instantiate(mod, broker);

    const ctx = makeCtx(broker, { actorId: actor.id, domain: 'alice.example.com' });
    const result = await mod.actions.addDomainToAlsoKnownAs.call(svc, ctx);

    assert.strictEqual(result.success, true);
    assert.strictEqual(updates.length, 0, 'No update should occur when domain already in alsoKnownAs');
  });

// ─── §5  fep-4adb-dereferencer – bare domain routing ────────────────────────

  console.log('\n§ 5  fep-4adb-dereferencer routes bare domains to fep-612d-dns-resolver');

  await ok('calls fep-612d-dns-resolver.resolveByDomain for bare domain input', async () => {
    const calls = [];
    const broker = {
      call: async (action, params) => {
        calls.push({ action, params });
        if (action === 'fep-612d-dns-resolver.resolveByDomain') {
          return ACTOR_OBJECT;
        }
        throw new Error(`unexpected: ${action}`);
      }
    };

    // Reload the dereferencer (it will re-require fep-612d-dns-resolver too)
    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    delete require.cache[require.resolve('./services/core/fep-4adb-dereferencer')];
    const derefMod = require('./services/core/fep-4adb-dereferencer');
    const svc = instantiate(derefMod, broker);

    const ctx = makeCtx(broker, { identifier: 'mymath.rocks', contextDomain: null });
    const result = await derefMod.actions.dereferenceIdentifier.call(svc, ctx);

    const dnsCall = calls.find(c => c.action === 'fep-612d-dns-resolver.resolveByDomain');
    assert.ok(dnsCall, 'Expected a call to fep-612d-dns-resolver.resolveByDomain');
    assert.strictEqual(dnsCall.params.domain, 'mymath.rocks');
    assert.strictEqual(result.id, OBJECT_URI);
  });

  await ok('still handles acct: identifiers via webfinger (not DNS)', async () => {
    const calls = [];
    const broker = {
      call: async (action, params) => {
        calls.push({ action, params });
        if (action === 'activitypub.actor.get') return ACTOR_OBJECT;
        return null;
      }
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    delete require.cache[require.resolve('./services/core/fep-4adb-dereferencer')];
    const derefMod = require('./services/core/fep-4adb-dereferencer');
    const svc = instantiate(derefMod, broker);

    // Patch webfingerLookup to return a URI without network I/O
    svc.webfingerLookup = async () => OBJECT_URI;

    const ctx = makeCtx(broker, {
      identifier: 'acct:helge@mymath.rocks',
      contextDomain: null
    });
    const result = await derefMod.actions.dereferenceIdentifier.call(svc, ctx);

    const dnsCall = calls.find(c => c.action === 'fep-612d-dns-resolver.resolveByDomain');
    assert.strictEqual(dnsCall, undefined, 'DNS should not be called for acct: identifiers');
    assert.strictEqual(result.id, OBJECT_URI);
  });

// ─── §6  fep-4adb-processor – resolveIdentifier ─────────────────────────────

  console.log('\n§ 6  fep-4adb-processor resolveIdentifier handles bare domains');

  await ok('resolves bare domain via fep-612d-dns-resolver', async () => {
    const broker = {
      call: async (action, params) => {
        if (action === 'fep-612d-dns-resolver.resolveByDomain') {
          assert.strictEqual(params.domain, 'mymath.rocks');
          return ACTOR_OBJECT;
        }
        throw new Error(`unexpected: ${action}`);
      }
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    delete require.cache[require.resolve('./services/core/fep-4adb-processor')];
    const procMod = require('./services/core/fep-4adb-processor');
    const svc = instantiate(procMod, broker);

    const ctx = makeCtx(broker, { identifier: 'mymath.rocks', contextDomain: null });
    const result = await procMod.actions.resolveIdentifier.call(svc, ctx);

    assert.strictEqual(result, OBJECT_URI);
  });

  await ok('passes through HTTP URIs unchanged', async () => {
    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    delete require.cache[require.resolve('./services/core/fep-4adb-processor')];
    const procMod = require('./services/core/fep-4adb-processor');
    const svc = instantiate(procMod, {});

    const ctx = makeCtx({}, { identifier: OBJECT_URI, contextDomain: null });
    const result = await procMod.actions.resolveIdentifier.call(svc, ctx);
    assert.strictEqual(result, OBJECT_URI);
  });

// ─── §7  fep-4adb-processor – validateIdentifierOwnership ───────────────────

  console.log('\n§ 7  fep-4adb-processor validateIdentifierOwnership for bare domains');

  await ok('validates domain whose DNS record points to the expected actor', async () => {
    const broker = {
      call: async (action, params) => {
        if (action === 'fep-612d-dns-resolver.resolveByDomain') {
          return { id: OBJECT_URI };
        }
        throw new Error(`unexpected: ${action}`);
      }
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    delete require.cache[require.resolve('./services/core/fep-4adb-processor')];
    const procMod = require('./services/core/fep-4adb-processor');
    const svc = instantiate(procMod, broker);

    const ctx = makeCtx(broker, {
      identifier: 'mymath.rocks',
      expectedActorId: OBJECT_URI,
      contextDomain: null
    });
    const valid = await procMod.actions.validateIdentifierOwnership.call(svc, ctx);
    assert.strictEqual(valid, true);
  });

  await ok('rejects domain whose DNS record points elsewhere', async () => {
    const broker = {
      call: async (action) => {
        if (action === 'fep-612d-dns-resolver.resolveByDomain') {
          return { id: 'https://other.example.com/actors/other' };
        }
        throw new Error(`unexpected: ${action}`);
      }
    };

    delete require.cache[require.resolve('./services/core/fep-612d-dns-resolver')];
    delete require.cache[require.resolve('./services/core/fep-4adb-processor')];
    const procMod = require('./services/core/fep-4adb-processor');
    const svc = instantiate(procMod, broker);

    const ctx = makeCtx(broker, {
      identifier: 'mymath.rocks',
      expectedActorId: OBJECT_URI,
      contextDomain: null
    });
    const valid = await procMod.actions.validateIdentifierOwnership.call(svc, ctx);
    assert.strictEqual(valid, false);
  });

// ─── summary ─────────────────────────────────────────────────────────────────

  if (failed > 0) {
    console.error(`\nproof_fep_612d_dns_failed (${failed} failed, ${passed} passed)`);
    process.exit(1);
  }

  console.log(`\nfep_612d_dns_proof_ok (${passed} assertions)`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
