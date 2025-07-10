const { getDatasetFromUri } = require('@semapps/ldp');

// A acl:Write permission implicitly gives acl:Read and acl:Append permissions
const modeMapping = {
  'acl:Read': ['acl:Read', 'acl:Write'],
  'acl:Append': ['acl:Append', 'acl:Write'],
  'acl:Write': ['acl:Write'],
  'acl:Control': ['acl:Control']
};

module.exports = {
  name: 'sai.authorizer',
  dependencies: 'permissions',
  async started() {
    // Set priority higher than the WebAclAuthorizerService
    await this.broker.call('permissions.addAuthorizer', { actionName: `${this.name}.hasPermission`, priority: 3 });
  },
  actions: {
    async hasPermission(ctx) {
      const { uri, type, mode, webId } = ctx.params;
      let grantFound = false;

      // SAI does not handle public resources (yet)
      if (webId === 'anon') return undefined;

      if (type === 'resource') {
        const dataRegistrationUri = await ctx.call('data-registrations.getUriByResourceUri', { resourceUri: uri });

        // Continue only if the resource is attached to a data registration
        if (dataRegistrationUri) {
          // Look either for the container rights (for scope interop:AllFromRegistry) or the resource rights (for scope interop:SelectedFromRegistry)
          grantFound = await ctx.call('triplestore.query', {
            query: `
              PREFIX ldp: <http://www.w3.org/ns/ldp#>
              PREFIX acl: <http://www.w3.org/ns/auth/acl#>
              PREFIX interop: <http://www.w3.org/ns/solid/interop#>
              ASK
              WHERE {
                VALUES ?type { interop:AccessGrant interop:DelegatedAccessGrant }
                VALUES ?mode { ${modeMapping[mode].join(' ')} }
                {
                  ?grantUri interop:hasDataRegistration <${dataRegistrationUri}> .
                  ?grantUri interop:grantee <${webId}> . 
                  ?grantUri interop:accessMode ?mode .
                  ?grantUri interop:scopeOfGrant interop:AllFromRegistry .
                } 
                UNION 
                {
                  ?grantUri interop:hasDataInstance <${uri}> .
                  ?grantUri interop:hasDataRegistration <${dataRegistrationUri}> .
                  ?grantUri interop:grantee <${webId}> . 
                  ?grantUri interop:accessMode ?mode .
                  ?grantUri interop:scopeOfGrant interop:SelectedFromRegistry .
                }
                ?grantUri a ?type .
              }
            `,
            webId: 'system',
            dataset: getDatasetFromUri(uri)
          });
        }
      } else if (type === 'container') {
        grantFound = await ctx.call('triplestore.query', {
          query: `
            PREFIX ldp: <http://www.w3.org/ns/ldp#>
            PREFIX acl: <http://www.w3.org/ns/auth/acl#>
            PREFIX interop: <http://www.w3.org/ns/solid/interop#>
            ASK
            WHERE {
              VALUES ?type { interop:AccessGrant interop:DelegatedAccessGrant }
              VALUES ?mode { ${modeMapping[mode].join(' ')} }
              ?grantUri interop:hasDataRegistration <${uri}> .
              ?grantUri interop:accessMode ?mode .
              ?grantUri interop:grantee <${webId}> .
              ?grantUri interop:scopeOfGrant interop:AllFromRegistry .
              ?grantUri a ?type .
            }
          `,
          webId: 'system',
          dataset: getDatasetFromUri(uri)
        });
      }

      return grantFound ? true : undefined;
    }
  }
};
