# OAuth Smoke Runbook

This runbook documents how to run the OAuth smoke proofs safely in local/dev and GitHub Actions.

## Scope

The smoke suite validates two flows:

1. Managed login flow (`proof-oauth-managed-login.js`)
2. Backend-to-sidecar bridge flow (`proof-oauth-backend-sidecar-bridge.js`)

The combined runner is:

- `npm run proof:oauth:smoke`
- `scripts/proof-oauth-smoke.sh`

## Required Inputs

Set these environment variables for local runs and for workflow dispatch inputs:

- `OAUTH_PROOF_BASE_URL`
- `OAUTH_PROOF_SIDECAR_BASE_URL`
- `OAUTH_PROOF_CANONICAL_ACCOUNT_ID`
- `OAUTH_PROOF_CLIENT_ID`
- `OAUTH_PROOF_REDIRECT_URI`
- Optional: `OAUTH_PROOF_SCOPE` (defaults to `atproto`)

## Authorization Modes

There are two authorize paths used by proof scripts:

1. User-bound authorize (recommended / production-like)
- Provide `OAUTH_PROOF_USER_TOKEN`.
- Uses public `POST /oauth/authorize`.
- Server binds approval to decoded user identity.

2. Internal fallback authorize (automation-only)
- Provide `OAUTH_PROOF_INTERNAL_BEARER` (or `ACTIVITYPODS_TOKEN`).
- Uses `POST /api/internal/oauth/authorize`.
- Requires backend setting `OAUTH_ALLOW_INTERNAL_AUTHORIZE_FALLBACK=true`.
- Intended for controlled non-production automation only.

## GitHub Actions Workflow

Workflow file:

- `.github/workflows/oauth-smoke-dispatch.yml`

Dispatch inputs include endpoint and client details, plus:

- `enforce_user_bound_authorize` (default: `true`)

### Strict mode (`enforce_user_bound_authorize=true`)

Requirements:

- Secret `OAUTH_PROOF_USER_TOKEN` must be present.
- Secret `OAUTH_PROOF_INTERNAL_BEARER` must NOT be present for that run.

Behavior:

- Workflow fails fast if strict constraints are violated.
- This prevents silent fallback to internal authorize.

### Non-strict mode (`enforce_user_bound_authorize=false`)

Requirements:

- At least one token secret is present:
  - `OAUTH_PROOF_USER_TOKEN`, or
  - `OAUTH_PROOF_INTERNAL_BEARER`

Behavior:

- Allows internal fallback for controlled test automation.

## Security and Reliability Notes

1. Do not print tokens in logs.
2. Keep user token and internal bearer in GitHub Secrets only.
3. Keep internal fallback disabled in production (`OAUTH_ALLOW_INTERNAL_AUTHORIZE_FALLBACK=false`).
4. Preserve HTTPS-only client metadata and redirect URI policy in production.
5. The workflow already uses bounded retries with exponential backoff and jitter for endpoint probes and smoke execution.

## Local Example

```bash
OAUTH_PROOF_BASE_URL=http://localhost:3000 \
OAUTH_PROOF_SIDECAR_BASE_URL=http://localhost:8085 \
OAUTH_PROOF_CANONICAL_ACCOUNT_ID=http://localhost:3000/atproto365133 \
OAUTH_PROOF_CLIENT_ID=http://localhost:3901/memory-pwa.client.json \
OAUTH_PROOF_REDIRECT_URI=http://localhost:3901/oauth/callback \
ACTIVITYPODS_TOKEN=test-atproto-signing-token-local \
bash scripts/proof-oauth-smoke.sh
```
