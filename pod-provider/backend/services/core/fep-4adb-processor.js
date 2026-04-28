/**
 * FEP-4adb Object Processor
 *
 * This service processes ActivityPub objects that reference identifiers
 * supporting FEP-4adb dereferencing. It:
 *
 * 1. Dereferences alternative identifiers in object properties
 * 2. Validates identifier claims
 * 3. Returns dereferenced actor information
 *
 * FEP-612d support: bare domain names (e.g. "mymath.rocks") are resolved
 * via DNS _apobjid TXT records and treated the same as any other identifier.
 */

const { isBaredomain } = require('./fep-612d-dns-resolver');

module.exports = {
  name: 'fep-4adb-processor',
  dependencies: ['fep-4adb-dereferencer', 'fep-612d-dns-resolver'],

  settings: {
    // Properties in objects that might contain identifiers
    identifierProperties: [
      'actor',
      'attributedTo',
      'to',
      'cc',
      'bcc',
      'attachment',
      'inReplyTo',
      'object',
      'origin',
      'target'
    ]
  },

  actions: {
    /**
     * Process an ActivityPub object and dereference any alternative identifiers
     *
     * @param {object} object - The ActivityPub object to process
     * @param {string} contextDomain - The domain context for relative identifier resolution
     * @returns {object} The processed object with dereferenced identifiers
     */
    async processObject(ctx) {
      const { object, contextDomain } = ctx.params;

      if (!object) {
        throw new Error('Object is required');
      }

      // Use structuredClone for efficient deep copying (Node 17+)
      const processed = typeof structuredClone === 'function' 
        ? structuredClone(object)
        : JSON.parse(JSON.stringify(object));
      const docDomain = this.extractDomainFromObject(processed, contextDomain);

      // Process each identifier property
      for (const prop of this.settings.identifierProperties) {
        if (prop in processed) {
          processed[prop] = await this.dereferencePropertyValue(ctx, processed[prop], docDomain);
        }
      }

      return processed;
    },

    /**
     * Resolve an identifier to an actor URI or object.
     *
     * Supports:
     *   - HTTP(S) URIs  – returned as-is
     *   - acct:, did:, mailto: – via FEP-4adb WebFinger dereferencing
     *   - bare domain names (FEP-612d) – via DNS _apobjid TXT lookup
     *
     * @param {string} identifier - The identifier to resolve
     * @param {string} contextDomain - The domain context
     * @returns {string} The resolved HTTP(S) URI (or the original if unresolvable)
     */
    async resolveIdentifier(ctx) {
      const { identifier, contextDomain } = ctx.params;

      if (!identifier) {
        return null;
      }

      // If it's already an HTTP(S) URI, just return it as-is
      if (typeof identifier === 'string' && (identifier.startsWith('http://') || identifier.startsWith('https://'))) {
        return identifier;
      }

      // FEP-612d: bare domain → DNS _apobjid lookup
      if (typeof identifier === 'string' && isBaredomain(identifier)) {
        try {
          const object = await ctx.call('fep-612d-dns-resolver.resolveByDomain', {
            domain: identifier
          });
          return object?.id || object?.['@id'] || identifier;
        } catch (err) {
          this.logger.warn(`[FEP-612d] Failed to resolve domain ${identifier}: ${err.message}`);
          return identifier;
        }
      }

      // For other non-HTTP identifiers, use FEP-4adb dereferencing
      if (
        typeof identifier === 'string' &&
        (identifier.startsWith('acct:') || identifier.startsWith('did:') || identifier.startsWith('mailto:'))
      ) {
        try {
          const actor = await ctx.call('fep-4adb-dereferencer.dereferenceIdentifier', {
            identifier,
            contextDomain
          });
          return actor?.id || actor?.['@id'] || identifier;
        } catch (err) {
          this.logger.warn(`Failed to dereference identifier ${identifier}: ${err.message}`);
          return identifier; // Return original if dereferencing fails
        }
      }

      return identifier;
    },

    /**
     * Validate that an identifier belongs to a claimed actor
     *
     * This is part of FEP-c390 validation - ensuring that if an object
     * claims an identifier (e.g., in attributedTo), that identifier
     * actually resolves to that actor.
     *
     * Bare domain identifiers (FEP-612d) are validated by resolving the
     * DNS _apobjid record and checking that the resulting object URI matches.
     *
     * @param {string} identifier - The identifier to validate
     * @param {string} expectedActorId - The actor ID the identifier should resolve to
     * @param {string} contextDomain - The domain context
     * @returns {boolean} True if the identifier resolves to the expected actor
     */
    async validateIdentifierOwnership(ctx) {
      const { identifier, expectedActorId, contextDomain } = ctx.params;

      if (!identifier || !expectedActorId) {
        return false;
      }

      // Skip validation for HTTP(S) URIs - they're already specific
      if (typeof identifier === 'string' && (identifier.startsWith('http://') || identifier.startsWith('https://'))) {
        return identifier === expectedActorId || identifier === expectedActorId + '/';
      }

      // FEP-612d: validate bare domain by DNS resolution
      if (typeof identifier === 'string' && isBaredomain(identifier)) {
        try {
          const object = await ctx.call('fep-612d-dns-resolver.resolveByDomain', {
            domain: identifier
          });
          const resolvedId = object?.id || object?.['@id'];
          if (!resolvedId) return false;
          const normalize = u => (u.endsWith('/') ? u.slice(0, -1) : u);
          return normalize(resolvedId) === normalize(expectedActorId);
        } catch (err) {
          this.logger.warn(`[FEP-612d] Domain validation failed for ${identifier}: ${err.message}`);
          return false;
        }
      }

      try {
        return await ctx.call('fep-4adb-dereferencer.verifyIdentifier', {
          identifier,
          actorId: expectedActorId,
          contextDomain
        });
      } catch (err) {
        this.logger.warn(`Identifier validation failed: ${err.message}`);
        return false;
      }
    },

    /**
     * Check if an object has verifiable identity information (FEP-c390)
     *
     * @param {object} object - The object to check
     * @returns {object} Verification information
     */
    async getVerificationInfo(ctx) {
      const { object } = ctx.params;

      if (!object) {
        return { hasVerification: false };
      }

      // Look for VerifiableIdentityStatement in attachment or directly
      let verifiableStatement = null;

      if (object.attachment) {
        if (Array.isArray(object.attachment)) {
          verifiableStatement = object.attachment.find(att => att.type === 'VerifiableIdentityStatement');
        } else if (object.attachment.type === 'VerifiableIdentityStatement') {
          verifiableStatement = object.attachment;
        }
      }

      if (verifiableStatement) {
        return {
          hasVerification: true,
          subject: verifiableStatement.subject,
          alsoKnownAs: verifiableStatement.alsoKnownAs,
          proof: verifiableStatement.proof,
          proofType: verifiableStatement.proof?.type
        };
      }

      return { hasVerification: false };
    }
  },

  methods: {
    /**
     * Extract domain from an ActivityPub object
     *
     * Used to determine the context domain for identifier resolution
     *
     * @private
     */
    extractDomainFromObject(object, fallbackDomain) {
      // Try to get domain from id/url properties
      const id = object.id || object.url;

      if (typeof id === 'string' && (id.startsWith('http://') || id.startsWith('https://'))) {
        try {
          const url = new URL(id);
          return url.hostname;
        } catch (err) {
          return fallbackDomain;
        }
      }

      return fallbackDomain;
    },

    /**
     * Dereference a property value that might contain identifiers
     *
     * @private
     */
    async dereferencePropertyValue(ctx, value, contextDomain) {
      // Handle string identifiers
      if (typeof value === 'string') {
        return await this.resolveIdentifierString(ctx, value, contextDomain);
      }

      // Handle arrays of identifiers
      if (Array.isArray(value)) {
        return Promise.all(value.map(v => this.dereferencePropertyValue(ctx, v, contextDomain)));
      }

      // Handle objects with id property
      if (typeof value === 'object' && value !== null) {
        if (value.id) {
          value.id = await this.resolveIdentifierString(ctx, value.id, contextDomain);
        }
        return value;
      }

      return value;
    },

    /**
     * Resolve a specific identifier string
     *
     * Handles acct:, did:, mailto: (FEP-4adb) and bare domains (FEP-612d).
     *
     * @private
     */
    async resolveIdentifierString(ctx, identifier, contextDomain) {
      // Only attempt resolution for non-HTTP identifiers that look like
      // alternative identifiers or bare domain names.
      const isAlternativeId =
        identifier.startsWith('acct:') || identifier.startsWith('did:') || identifier.startsWith('mailto:');

      if (!isAlternativeId && !isBaredomain(identifier)) {
        return identifier;
      }

      try {
        const resolved = await ctx.call('fep-4adb-processor.resolveIdentifier', {
          identifier,
          contextDomain
        });
        return resolved;
      } catch (err) {
        this.logger.debug(`Could not resolve identifier ${identifier}: ${err.message}`);
        return identifier;
      }
    }
  }
};
