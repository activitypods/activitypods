# @activitypods/app-manifest

Declare an [ActivityPods](https://activitypods.org) app and its access needs in `app-manifest.json`, and generate its client ID document.

## Usage

```bash
npx @activitypods/app-manifest init
npx app-manifest add
```

```ts
// vite.config.ts
import { appManifest } from '@activitypods/app-manifest/vite';

export default defineConfig({ plugins: [appManifest()] });
```

```ts
// In the auth provider
import { clientId } from 'virtual:app-manifest';
```

`PUBLIC_URL` must be set to the URL of the app when building. The generated files must be served with `Access-Control-Allow-Origin: *`, as the Pod provider's frontend fetches them.

Run `npx app-manifest --help` for the other commands.

## Commands

```bash
yarn build
yarn test
```

Versioning and publication are handled from the `app-framework` directory.
