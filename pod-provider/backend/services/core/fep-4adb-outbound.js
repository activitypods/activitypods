/**
 * FEP-4adb Outbound Activity Handler
 * 
 * This service handles FEP-4adb support for outbound ActivityPub activities.
 * It ensures that:
 * 
 * 1. Activities created by actors include their aliases
 * 2. Activities can be addressed to alternative identifiers
 * 3. Outbound activities maintain FEP-4adb compatibility
 */

module.exports = {
  name: 'fep-4adb-outbound',
  dependencies: ['fep-4adb-dereferencer', 'fep-4adb-processor', 'activitypub.actor'],

  settings: {
    // Whether to automatically include actor aliases in outbound activities
    includeAliasesInActivities: true,
    
    // Whether to sign activities with alternative identity credentials
    supportAlternativeSignatures: false
  },

  actions: {
    /**
     * Prepare an activity for sending, ensuring FEP-4adb compatibility
     * 
     * @param {object} activity - The ActivityPub activity object
     * @param {string} actorId - The ID of the actor sending the activity
     * @returns {object} The prepared activity with FEP-4adb enhancements
     */
    async prepareOutboundActivity(ctx) {
      const { activity, actorId } = ctx.params;

      if (!activity || !actorId) {
        throw new Error('activity and actorId are required');
      }

      const prepared = JSON.parse(JSON.stringify(activity)); // Deep copy

      // Get actor information including aliases
      let actor;
      try {
        actor = await ctx.call('activitypub.actor.get', { id: actorId });
      } catch (err) {
        this.logger.warn(`Could not fetch actor ${actorId}: ${err.message}`);
        return prepared;
      }

      // Add alias information to activity if configured
      const aliases = Array.isArray(actor.alsoKnownAs)
        ? actor.alsoKnownAs
        : Array.isArray(actor.aliases)
          ? actor.aliases
          : [];

      if (this.settings.includeAliasesInActivities && aliases.length > 0) {
        prepared.alsoKnownAs = aliases;
      }

      // Ensure actor property includes alias information
      if (prepared.actor) {
        prepared.actor = this.enrichActorReference(prepared.actor, actor);
      }

      // Process to/cc/bcc recipients - resolve alternative identifiers
      for (const field of ['to', 'cc', 'bcc']) {
        if (prepared[field]) {
          prepared[field] = await this.processRecipients(ctx, prepared[field]);
        }
      }

      return prepared;
    },

    /**
     * Create an activity from an actor, with FEP-4adb support
     * 
     * @param {object} activity - The activity template
     * @param {string} actorId - The actor creating the activity
     * @returns {object} The created activity
     */
    async createActivity(ctx) {
      const { activity, actorId } = ctx.params;

      const prepared = await ctx.call('fep-4adb-outbound.prepareOutboundActivity', {
        activity,
        actorId
      });

      prepared.actor = actorId;
      prepared.published = prepared.published || new Date().toISOString();

      return prepared;
    },

    /**
     * Send an activity to recipients, supporting alternative identifiers
     * 
     * @param {object} activity - The activity to send
     * @param {string[]} recipients - List of recipients (can be alternative identifiers)
     * @returns {object} The send result
     */
    async sendActivityToRecipients(ctx) {
      const { activity, recipients } = ctx.params;

      if (!activity || !recipients || recipients.length === 0) {
        return { sent: [], failed: [] };
      }

      const sent = [];
      const failed = [];

      // Get domain context from activity for identifier resolution
      const actorDomain = this.extractDomain(activity.actor);

      for (const recipient of recipients) {
        try {
          // Resolve recipient if it's an alternative identifier
          const resolvedRecipient = await ctx.call(
            'fep-4adb-processor.resolveIdentifier',
            {
              identifier: recipient,
              contextDomain: actorDomain
            }
          );

          if (resolvedRecipient) {
            // In a real implementation, this would call the activitypub.inbox service
            // For now, we just track that we resolved it
            sent.push({
              original: recipient,
              resolved: resolvedRecipient,
              sent: true
            });
          } else {
            failed.push({
              recipient,
              error: 'Could not resolve identifier'
            });
          }
        } catch (err) {
          failed.push({
            recipient,
            error: err.message
          });
        }
      }

      return { sent, failed };
    },

    /**
     * Update an actor's aliases and ensure outbound activities reflect the change
     * 
     * @param {string} actorId - The actor ID
     * @param {string[]} aliases - New list of aliases
     * @returns {object} Update result
     */
    async updateActorAliases(ctx) {
      const { actorId, aliases } = ctx.params;

      if (!actorId || !aliases || !Array.isArray(aliases)) {
        throw new Error('actorId and aliases array are required');
      }

      // Validate each alias is a proper URI
      const validAliases = [];
      for (const alias of aliases) {
        if (typeof alias === 'string' &&
            (alias.startsWith('acct:') || alias.startsWith('did:') ||
             alias.startsWith('mailto:') || alias.startsWith('http'))) {
          validAliases.push(alias);
        }
      }

      try {
        const existingAliases = await ctx.call('fep-4adb-dereferencer.listAliases', { actorId });

        // Add newly requested aliases
        for (const alias of validAliases) {
          try {
            await ctx.call('fep-4adb-dereferencer.addAlias', {
              actorId,
              alias
            });
          } catch (err) {
            this.logger.warn(`Could not register alias ${alias}: ${err.message}`);
          }
        }

        // Remove aliases not in the requested set
        for (const alias of existingAliases) {
          if (!validAliases.includes(alias)) {
            try {
              await ctx.call('fep-4adb-dereferencer.removeAlias', {
                actorId,
                alias
              });
            } catch (err) {
              this.logger.warn(`Could not unregister alias ${alias}: ${err.message}`);
            }
          }
        }

        return {
          success: true,
          actorId,
          aliasesRegistered: validAliases.length
        };
      } catch (err) {
        return {
          success: false,
          error: err.message
        };
      }
    },

    /**
     * Announce that an actor is also known by alternative identifiers
     * 
     * This creates an Announce activity declaring alternative identities
     * per FEP-c390 pattern
     * 
     * @param {string} actorId - The actor making the announcement
     * @param {string[]} identifiers - Identifiers being claimed
     * @returns {object} The created Announce activity
     */
    async announceAlternativeIdentities(ctx) {
      const { actorId, identifiers } = ctx.params;

      if (!actorId || !identifiers) {
        throw new Error('actorId and identifiers are required');
      }

      // Create a VerifiableIdentityStatement
      const statement = {
        type: 'VerifiableIdentityStatement',
        subject: actorId,
        alsoKnownAs: identifiers,
        proof: null // Proof would be added by signature service
      };

      // Create an Announce activity with the statement as attachment
      const activity = {
        type: 'Announce',
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        object: statement,
        attachment: statement
      };

      return await ctx.call('fep-4adb-outbound.createActivity', {
        activity,
        actorId
      });
    }
  },

  methods: {
    /**
     * Extract domain from a URI
     * 
     * @private
     */
    extractDomain(uri) {
      if (!uri || !uri.startsWith('http')) {
        return null;
      }

      try {
        return new URL(uri).hostname;
      } catch (err) {
        return null;
      }
    },

    /**
     * Enrich an actor reference with alias information
     * 
     * @private
     */
    enrichActorReference(actorRef, actorData) {
      // If actor ref is just a string ID, keep it as-is
      if (typeof actorRef === 'string') {
        return actorRef;
      }

      // If it's an object, add alias information
      if (typeof actorRef === 'object') {
        const enriched = JSON.parse(JSON.stringify(actorRef));
        
        if (actorData.alsoKnownAs) {
          enriched.alsoKnownAs = actorData.alsoKnownAs;
        }

        return enriched;
      }

      return actorRef;
    },

    /**
     * Process recipient list to resolve alternative identifiers
     * 
     * @private
     */
    async processRecipients(ctx, recipients) {
      // Handle single recipient as string
      if (typeof recipients === 'string') {
        if (recipients.startsWith('acct:') || recipients.startsWith('did:') || recipients.startsWith('mailto:')) {
          try {
            return await ctx.call('fep-4adb-processor.resolveIdentifier', {
              identifier: recipients,
              contextDomain: null
            });
          } catch (err) {
            return recipients;
          }
        }
        return recipients;
      }

      // Handle array of recipients
      if (Array.isArray(recipients)) {
        return Promise.all(
          recipients.map(r => this.processRecipients(ctx, r))
        );
      }

      return recipients;
    }
  }
};
