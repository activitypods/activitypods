import type { AuthProvider as CoreAuthProvider } from '@refinedev/core';

/** A JSON-LD context: a URL, an inline object, or an array mixing both. */
export type JsonContext = string | string[] | Record<string, any>;

export type ResourceConfig = {
  /**
   * URI of the shape tree describing this resource type, e.g.
   * `https://shapes.activitypods.org/shapetrees/as/Event`.
   * This is the recommended way to identify a resource, since it maps directly
   * to a single Data Registration on the Pod and avoids ambiguous CURIE expansion.
   */
  shapeTreeUri?: string;
  /**
   * Type(s) (CURIE, e.g. `as:Event`, or full URI) of the resource.
   * Only used as a fallback when `shapeTreeUri` is not set: the data provider
   * will look for a Data Registration whose shape tree targets one of these types.
   */
  types?: string | string[];
};

export type ResourcesConfig = Record<string, ResourceConfig>;

export type AuthSession = {
  /** The Solid-OIDC ID token, used as a bearer token for authenticated requests to the Pod */
  token: string;
  /** The WebID of the logged-in user */
  webId: string;
};

export type Identity = {
  id: string;
  name: string;
  avatar?: string;
  webIdData?: Record<string, any>;
  profileData?: Record<string, any>;
};

export type LoginParams = {
  /** Base URL of the Pod provider (issuer) the user wants to log into */
  issuer: string;
  /** Path to redirect to once logged in (and, if needed, once the app is registered). Defaults to "/" */
  redirect?: string;
  /** Set to true to send the user through the Pod provider's signup flow instead of login */
  isSignup?: boolean;
};

export type AuthProvider = CoreAuthProvider & {
  /** Returns the current session (token + webId), or undefined if not logged in */
  getSession: () => AuthSession | undefined;
  /**
   * Completes the Solid-OIDC authorization code flow. Call this from the route configured as
   * `redirectUri` (defaults to `${origin}/login`), after the Pod provider redirects back to
   * the app.
   */
  handleCallback: () => Promise<{ webId: string; redirect: string }>;
  /**
   * Looks up the AppRegistration linking this app to the given WebID (the logged-in user's
   * WebID by default). Every ActivityPods app must be registered before it can read or write
   * any data on a user's Pod.
   *
   * - If the app is already registered *and* its granted access needs are still up to date
   *   (see `getAppStatus`), resolves with the AppRegistration URI.
   * - Otherwise (not yet registered, or the app now declares access needs the user hasn't
   *   granted yet), redirects the browser to the user's authorization agent (the "grant access"
   *   screen) and resolves with `undefined`; the app should be reloaded once the user comes back.
   */
  registerApp: (webId?: string) => Promise<string | undefined>;
  /**
   * Checks this app's status with the Pod: whether it's registered, and whether its granted
   * access needs are stale (`upgradeNeeded`) — e.g. because the app now requests a resource it
   * didn't before. Used internally by `registerApp` and `AntdBackgroundChecks`; exposed directly
   * for building custom status UI (see ActivityPods' own `BackgroundChecks` component).
   */
  getAppStatus: () => Promise<AppStatus>;
};

/** The shape returned by a Pod provider's `/.well-known/app-status` endpoint. */
export type AppStatus = {
  /** Whether the app's own backend (if it has one) is reachable. Always `true` for backend-less apps. */
  onlineBackend: boolean;
  /** Whether this app has an AppRegistration on the Pod at all. */
  installed?: boolean;
  /**
   * Whether the AppRegistration's granted access needs are stale relative to what the app
   * currently declares (compared via the app description's `dc:modified` timestamp) — i.e.
   * whether the user needs to go through the consent screen again to grant the difference.
   */
  upgradeNeeded?: boolean;
  /** The webhook channels the app's backend has on the Pod (only present once `installed`). */
  webhookChannels?: WebhookChannel | WebhookChannel[];
};

export type WebhookChannel = {
  id: string;
  type: string;
  /** URI of the resource whose changes are pushed to the app's backend */
  topic: string;
  sendTo?: string;
};

export type AuthProviderConfig = {
  /** URI that identifies this application. Used as the Solid-OIDC `client_id` */
  clientId: string;
  /**
   * Absolute URL the Pod provider should redirect back to after login.
   * Defaults to `${window.location.origin}/login` — the same route `AntdAuthPage` (or your own
   * equivalent) is normally mounted at, since it handles the OAuth callback itself based on the
   * URL's search params rather than needing a dedicated route.
   */
  redirectUri?: string;
  /** If false (default), `check()` fails (redirects to `/login`) when no session is present */
  allowAnonymous?: boolean;
  /**
   * How often (in ms) to check in the background whether this app's granted access needs are
   * still up to date, silently redirecting to the Pod's consent screen if not (see
   * `getAppStatus`). Also runs on every `visibilitychange`. Defaults to 2 minutes, matching
   * ActivityPods' own frontend; pass `false` to disable.
   */
  appStatusCheckInterval?: number | false;
};

export type DataProviderConfig = {
  resources: ResourcesConfig;
  authProvider: AuthProvider;
  /**
   * JSON-LD context sent along with every resource created or updated, and used to resolve
   * `types` in the resource config into full URIs. Defaults to the ActivityStreams 2 context.
   */
  jsonContext?: JsonContext;
  /**
   * Also list the resources found through the access grants of the app registration. Slow, and
   * usually not needed: resources shared with the user are cached in their containers.
   */
  readAccessGrants?: boolean;
};

export type LiveProviderConfig = {
  resources: ResourcesConfig;
  authProvider: AuthProvider;
  /** Same role as in `DataProviderConfig`: used to resolve `types` into full URIs. */
  jsonContext?: JsonContext;
};

/** A Solid Notifications activity, as delivered over a WebSocketChannel2023 connection. */
export type NotificationActivity = {
  id?: string;
  type: string;
  object?: string | { id?: string; '@id'?: string };
  target?: string;
  state?: string;
  published?: string;
};

export type UnwatchFn = () => void;
