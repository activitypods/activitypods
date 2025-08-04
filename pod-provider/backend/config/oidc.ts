// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';

// Inspired from https://github.com/CommunitySolidServer/CommunitySolidServer/blob/15a929a87e4ce00c0ed266e296405c8e4a22d4a7/config/identity/handler/base/provider-factory.json#L30
// @ts-expect-error TS(7006): Parameter 'settings' implicitly has an 'any' type.
export default (settings, privateJwk) => ({
  claims: {
    openid: ['azp'],
    webid: ['webid']
  },

  extraParams: [
    'is_signup' // Used to recognize signup requests
  ],

  // Default client settings that might not be defined.
  // Mostly relevant for WebID clients.
  clientDefaults: { id_token_signed_response_alg: privateJwk.alg },

  clockTolerance: 120,

  cookies: {
    keys: [settings.cookieSecret],
    long: { signed: true, maxAge: 86400000 },
    short: { signed: true }
  },

  enabledJWA: {
    dPoPSigningAlgValues: [
      'RS256',
      'RS384',
      'RS512',
      'PS256',
      'PS384',
      'PS512',
      'ES256',
      'ES256K',
      'ES384',
      'ES512',
      'EdDSA'
    ]
  },

  features: {
    claimsParameter: { enabled: true },
    clientCredentials: { enabled: true },
    devInteractions: { enabled: false },
    dPoP: { enabled: true },
    introspection: { enabled: true },
    registration: { enabled: true },
    // The /.oidc/auth/session/end endpoint is being called when you disconnect from the Pod provider
    // It has the effect of destroying the session and grants of the logged user
    // The code below automatically accept the global logout, to avoid showing an additional form to the user
    rpInitiatedLogout: {
      enabled: true,
      // Automatically submit the form
      logoutSource: async (ctx: any, form: any) => {
        // Simulate button click
        form = form.replace('</form>', '<input type="hidden" name="logout" value="yes"/></form>');
        ctx.body = `
          <!DOCTYPE html>
          <head>
            <script>
              document.addEventListener('DOMContentLoaded', function () { document.forms[0].submit() });
            </script>
          </head>
          <body>
            ${form}
            <noscript>
              <button autofocus type="submit" form="op.logoutForm" value="yes" name="logout">Continue</button>
            </noscript>
          </body>
          </html>
        `;
      },
      // Redirect to the frontend
      postLogoutSuccessSource: async (ctx: any) => {
        ctx.body = `
          <!DOCTYPE html>
          <head>
            <script>
              window.location.href = "${settings.frontendUrl}";
            </script>
          </head>
          <body>
            <noscript>
              <h1>Success !</h1>
            </noscript>
          </body>
          </html>
        `;
      }
    },
    revocation: { enabled: true },
    userinfo: { enabled: false }
  },

  jwks: { keys: [privateJwk] },

  // Returns the id_token https://solid.github.io/authentication-panel/solid-oidc/#tokens-id
  // Some fields are still missing, see https://github.com/CommunitySolidServer/CommunitySolidServer/issues/1154#issuecomment-1040233385
  // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
  findAccount: async (ctx, sub) => ({
    accountId: sub,

    async claims() {
      return { sub, webid: sub, azp: ctx.oidc.client?.clientId };
    }
  }),

  // Since the login and consent forms are on a separated frontend, we must redirect to it
  // The /.oidc/login-completed and /.oidc/consent-completed endpoint will take care of finishing the interaction
  interactions: {
    url: async (ctx: any, interaction: any) => {
      switch (interaction?.prompt?.name) {
        case 'login': {
          const loginUrl = new URL(urlJoin(settings.frontendUrl, '/login'));
          loginUrl.searchParams.set('interaction_id', interaction.jti);
          loginUrl.searchParams.set('client_id', interaction?.params?.client_id);
          loginUrl.searchParams.set('redirect', interaction.returnTo);
          // @ts-expect-error TS(2345): Argument of type 'boolean' is not assignable to pa... Remove this comment to see the full error message
          if (interaction?.params?.is_signup === 'true') loginUrl.searchParams.set('signup', true); // Extra param
          return loginUrl.toString();
        }

        default: {
          console.error('Unknown interaction', interaction);
        }
      }
    }
  },

  // Inspired from https://github.com/panva/node-oidc-provider/blob/main/recipes/skip_consent.md
  async loadExistingGrant(ctx: any) {
    const grant = new ctx.oidc.provider.Grant({
      clientId: ctx.oidc.client.clientId,
      accountId: ctx.oidc.session.accountId
    });
    grant.addOIDCScope('openid profile offline_access webid');
    await grant.save();
    return grant;
  },

  // Solid OIDC requires pkce https://solid.github.io/solid-oidc/#concepts
  pkce: { methods: ['S256'], required: () => true },

  scopes: ['openid', 'profile', 'offline_access', 'webid'],
  subjectTypes: ['public'],

  ttl: {
    AccessToken: 3600,
    AuthorizationCode: 600,
    BackchannelAuthenticationRequest: 600,
    ClientCredentials: 600,
    DeviceCode: 600,
    // Set a very short ttl so that, if the application is uninstalled, we will show the Authorization screen again
    // Ideally the grant linked with the session should be revoked on uninstallation but we found no easy way to do that (except with a raw edition of the Redis DB)
    // Community Solid Server use 14 days (1209600s) that is the same time as the session (they expire at the same time)
    Grant: 30,
    // Since we currently use ID tokens instead of Access tokens with DPOP, keep it active for one year.
    // Community Solid Server use one hour (3600s) which is a g)ood default if it is used only to generate an access token
    IdToken: 31536000,
    // 3 hours, just in case the user take long to login or authorize. Community Solid Server uses one hour (3600s)
    // If interaction expires on authorization, an error notification will be shown. If the user tries to install again the app, it will work.
    Interaction: 10800,
    RefreshToken: 86400,
    // Keep session open for one year, like the ID token. On Community Solid Server, it is 14 days (1209600s)
    Session: 31536000
  },

  renderError: async (ctx: any, out: any, error: any) => {
    console.error(error);
    ctx.type = 'html';
    ctx.body = `
      <!DOCTYPE html>
      <head>
        <title>Error</title>
      </head>
      <body>
        <div>
          <h1>Error</h1>
          ${Object.entries(out)
            .map(([key, value]) => `<pre><strong>${key}</strong>: ${value}</pre>`)
            .join('')}
        </div>
      </body>
      </html>
    `;
  }
});
