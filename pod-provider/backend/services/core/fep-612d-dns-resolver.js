/**
 * FEP-612d: Identifying ActivityPub Objects through DNS
 *
 * This service implements FEP-612d, which allows a bare domain name to be
 * resolved to an ActivityPub object via a DNS TXT record.
 *
 * Algorithm:
 *   1. Given a domain name (e.g. "mymath.rocks"), perform a DNS TXT lookup
 *      for "_apobjid.<domain>" (e.g. "_apobjid.mymath.rocks").
 *   2. The TXT record value is the URI of the ActivityPub object.
 *   3. Fetch that URI with an Accept: application/activity+json header and
 *      return the resulting object.
 *
 * The resolved object URI may also be added to the actor's alsoKnownAs so
 * the domain acts as a verified alias per the FEP discussion notes.
 *
 * @see https://codeberg.org/fediverse/fep/src/branch/main/fep/612d/fep-612d.md
 */

const dns = require('dns').promises;

// Regex for a "bare" domain name: no scheme, no path, no @-sign.
// Matches things like "example.com", "sub.example.co.uk", etc.
const BARE_DOMAIN_RE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

/** Return true if the string looks like a bare domain name. */
function isBaredomain(str) {
  return typeof str === 'string' && BARE_DOMAIN_RE.test(str);
}

module.exports = {
  name: 'fep-612d-dns-resolver',

  settings: {
    // DNS TXT record prefix defined by FEP-612d
    txtPrefix: '_apobjid',

    // Timeout in ms for DNS queries
    dnsTimeoutMs: 5000,

    // Whether to add the resolved domain to the actor's alsoKnownAs
    addToAlsoKnownAs: true
  },

  actions: {
    /**
     * Look up the _apobjid TXT record for a domain and return the raw URI
     * string found in that record, or null if none is found.
     *
     * @param {string} domain - Bare domain name, e.g. "mymath.rocks"
     * @returns {string|null} The ActivityPub object URI from DNS, or null
     */
    async lookupDnsTxtRecord(ctx) {
      const { domain } = ctx.params;

      if (!isBaredomain(domain)) {
        throw new Error(`Invalid domain: "${domain}"`);
      }

      return this.lookupTxtRecord(domain);
    },

    /**
     * Resolve a bare domain name to an ActivityPub object using FEP-612d.
     *
     * Steps:
     *   1. Look up "_apobjid.<domain>" TXT record.
     *   2. Fetch the ActivityPub object at the URI found in that record.
     *
     * @param {string} domain - Bare domain name, e.g. "mymath.rocks"
     * @returns {object} The ActivityPub object
     */
    async resolveByDomain(ctx) {
      const { domain } = ctx.params;

      if (!isBaredomain(domain)) {
        throw new Error(`"${domain}" is not a valid bare domain name`);
      }

      const objectUri = await this.lookupTxtRecord(domain);

      if (!objectUri) {
        throw new Error(`No ${this.settings.txtPrefix}.${domain} TXT record found`);
      }

      this.logger.info(`[FEP-612d] ${this.settings.txtPrefix}.${domain} → ${objectUri}`);

      return this.fetchActivityPubObject(objectUri);
    },

    /**
     * Resolve a bare domain to an ActivityPub object and, if addToAlsoKnownAs
     * is enabled, add the domain to the resolved actor's alsoKnownAs list.
     *
     * @param {string} domain  - Bare domain name
     * @param {string} actorId - (optional) actor URI to update; if omitted the
     *                           id of the resolved object is used
     * @returns {object} { object, alsoKnownAsUpdated }
     */
    async resolveAndLink(ctx) {
      const { domain, actorId } = ctx.params;

      const object = await ctx.call('fep-612d-dns-resolver.resolveByDomain', {
        domain
      });

      const targetId = actorId || object.id || object['@id'];
      let alsoKnownAsUpdated = false;

      if (this.settings.addToAlsoKnownAs && targetId) {
        try {
          await ctx.call('fep-612d-dns-resolver.addDomainToAlsoKnownAs', {
            actorId: targetId,
            domain
          });
          alsoKnownAsUpdated = true;
        } catch (err) {
          this.logger.warn(`[FEP-612d] Could not add domain "${domain}" to alsoKnownAs of ${targetId}: ${err.message}`);
        }
      }

      return { object, alsoKnownAsUpdated };
    },

    /**
     * Add a domain name to an actor's alsoKnownAs array.
     *
     * The domain is stored as a plain string (not a URI) because FEP-612d
     * identifies objects by domain name, not by a URI scheme.  Consumers
     * that need the full ActivityPub URI should call resolveByDomain first.
     *
     * @param {string} actorId - The actor's HTTP(S) URI
     * @param {string} domain  - The bare domain name to record
     * @returns {{ success: boolean, alsoKnownAs: string[] }}
     */
    async addDomainToAlsoKnownAs(ctx) {
      const { actorId, domain } = ctx.params;

      if (!actorId || !domain) {
        throw new Error('actorId and domain are required');
      }

      const actor = await ctx.call('activitypub.actor.get', { id: actorId });

      let alsoKnownAs = actor.alsoKnownAs || [];
      if (!Array.isArray(alsoKnownAs)) {
        alsoKnownAs = [alsoKnownAs];
      }

      if (!alsoKnownAs.includes(domain)) {
        alsoKnownAs = [...alsoKnownAs, domain];

        await ctx.call('activitypub.actor.update', {
          id: actorId,
          data: { ...actor, alsoKnownAs }
        });

        this.logger.info(`[FEP-612d] Added domain "${domain}" to alsoKnownAs of ${actorId}`);
      }

      return { success: true, alsoKnownAs };
    },

    /**
     * Remove a domain name from an actor's alsoKnownAs array.
     *
     * @param {string} actorId - The actor's HTTP(S) URI
     * @param {string} domain  - The bare domain name to remove
     */
    async removeDomainFromAlsoKnownAs(ctx) {
      const { actorId, domain } = ctx.params;

      if (!actorId || !domain) {
        throw new Error('actorId and domain are required');
      }

      const actor = await ctx.call('activitypub.actor.get', { id: actorId });

      let alsoKnownAs = actor.alsoKnownAs || [];
      if (!Array.isArray(alsoKnownAs)) {
        alsoKnownAs = [alsoKnownAs];
      }

      alsoKnownAs = alsoKnownAs.filter(a => a !== domain);

      await ctx.call('activitypub.actor.update', {
        id: actorId,
        data: { ...actor, alsoKnownAs }
      });

      return { success: true, alsoKnownAs };
    }
  },

  methods: {
    /**
     * Perform the DNS TXT lookup for "_apobjid.<domain>".
     *
     * Returns the first non-empty TXT string value found, or null.
     *
     * @private
     */
    async lookupTxtRecord(domain) {
      const fqdn = `${this.settings.txtPrefix}.${domain}`;

      let records;
      try {
        // dns.resolveTxt returns string[][] – each record is an array of
        // chunks that should be concatenated per RFC 4408 §3.1.3.
        records = await Promise.race([
          dns.resolveTxt(fqdn),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`DNS timeout for ${fqdn}`)), this.settings.dnsTimeoutMs)
          )
        ]);
      } catch (err) {
        if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'ESERVFAIL') {
          this.logger.debug(`[FEP-612d] No TXT record at ${fqdn}: ${err.code}`);
          return null;
        }
        throw err;
      }

      for (const chunks of records) {
        const value = chunks.join('').trim();
        if (value) {
          return value;
        }
      }

      return null;
    },

    /**
     * Fetch an ActivityPub object by URI.
     *
     * Sends an Accept: application/activity+json header.  Falls back to a
     * direct fetch when the broker's activitypub.actor service is
     * unavailable.
     *
     * @private
     */
    async fetchActivityPubObject(uri) {
      // Prefer the broker's actor service so that caching/signing is applied.
      try {
        return await this.broker.call('activitypub.actor.get', { id: uri });
      } catch {
        // If the actor service doesn't know about this URI (e.g. it's a
        // non-Actor object), fall back to a plain HTTP fetch.
      }

      const response = await fetch(uri, {
        headers: {
          Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ActivityPub object at ${uri}: HTTP ${response.status}`);
      }

      return response.json();
    }
  }
};

// Export the bare-domain predicate so other services can reuse it.
module.exports.isBaredomain = isBaredomain;
