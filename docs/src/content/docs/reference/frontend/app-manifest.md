---
title: '@activitypods/app-manifest'
sidebar:
  order: 3
---

Declare an app and its access needs in an `app-manifest.json` file, and generate the documents read by the Pod provider. See the guide [Create an app without a backend](/guides/create-an-app-without-a-backend/) for a step-by-step introduction.

It requires Node 20 or later. The Vite plugin requires Vite 5 or later.

:::caution[Apps with a backend]
The manifest is only for apps without a backend for now. An app with a backend must keep declaring its access needs in its [`AppService`](/app-framework/backend/application-registration/).
:::

## `app-manifest.json`

```json title="app-manifest.json"
{
  "$schema": "./node_modules/@activitypods/app-manifest/schema.json",
  "name": "Example App",
  "description": { "en": "An example app", "fr": "Une appli d'exemple" },
  "thumbnail": "/logo192.png",
  "supportedLocales": ["en", "fr"],
  "accessNeeds": {
    "required": [
      {
        "shapeTreeUri": "https://shapes.activitypods.org/shapetrees/as/Note",
        "accessMode": ["acl:Read", "acl:Write"]
      },
      "apods:ReadInbox"
    ],
    "optional": []
  }
}
```

| Property           | Type                 | Description                                                                           |
| ------------------ | -------------------- | ------------------------------------------------------------------------------------- |
| `name`             | `String`             | **Required.** Name of the app. It can't be translated                                 |
| `description`      | `String` or `Object` | **Required.** Description of the app, or an object with one description per language  |
| `accessNeeds`      | `Object`             | **Required.** Lists of `required` and `optional` [access needs](#access-needs)        |
| `author`           | `String`             | URI of the author of the app                                                          |
| `thumbnail`        | `String`             | Square logo of the app (ideally 192x192 pixels): a URL, or a path relative to the app |
| `tosUri`           | `String`             | URL of the terms of service                                                           |
| `supportedLocales` | `Array`              | Languages supported by the app                                                        |
| `$schema`          | `String`             | JSON schema of this file, which enables validation and autocompletion in most editors |

### Access needs

An access need is either a special right or an object with these properties:

| Property         | Type                | Default       | Description                                                         |
| ---------------- | ------------------- | ------------- | ------------------------------------------------------------------- |
| `shapeTreeUri`   | `String`            | **required**  | URI of the shape tree                                               |
| `accessMode`     | `String` or `Array` | **required**  | One or more of `acl:Read`, `acl:Write`, `acl:Append`, `acl:Control` |
| `preferredScope` | `String`            | `interop:All` | Scope of the access                                                 |

The special rights are:

| Special right               | The app can                          |
| --------------------------- | ------------------------------------ |
| `apods:ReadInbox`           | Read the user's inbox                |
| `apods:ReadOutbox`          | Read the user's outbox               |
| `apods:PostOutbox`          | Post in the user's outbox            |
| `apods:QuerySparqlEndpoint` | Search on the user's data            |
| `apods:CreateWacGroup`      | Create and manage permissions groups |
| `apods:CreateCollection`    | Create and manage collections        |
| `apods:UpdateWebId`         | Update the user's WebID              |

## Command line

Before the package is installed, use its full name:

```bash
npx @activitypods/app-manifest init
```

Once it is installed in the project, use `npx app-manifest <command>`. Don't run `npx app-manifest` in a project where the package isn't installed: `app-manifest` is also the name of an unrelated package on npm.

| Command           | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `init`            | Ask for a name and a description, create `app-manifest.json` and install the package |
| `add [search]`    | Add an access need or a special right. If it is already declared, it is replaced     |
| `remove [search]` | Remove an access need or a special right                                             |
| `list`            | List the declared access needs                                                       |
| `check`           | Validate the manifest and check that the shape trees exist                           |
| `build`           | Generate the documents without Vite                                                  |

### `add`

The search is done on the [shape repository](https://shapes.activitypods.org) and on the special rights. Results are sorted by the number of apps using them. You can also pass a short name (`as/Note`), a special right (`apods:ReadInbox`) or the URI of a shape tree hosted elsewhere.

The labels are displayed in the language of your system. In a terminal, the command asks for what is missing. Otherwise, it reads only the options, and defaults to a required, read-only access.

| Option               | Description                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `--read`             | Read-only access                                                                             |
| `--write`            | Read and write access                                                                        |
| `--required`         | The app can't work without this access                                                       |
| `--optional`         | The user can refuse this access                                                              |
| `--repository <url>` | Shape repository. Defaults to `SHAPE_REPOSITORY_URL`, then `https://shapes.activitypods.org` |

### `build`

| Option           | Description                          |
| ---------------- | ------------------------------------ |
| `--origin <url>` | **Required.** URL of the app         |
| `--out <dir>`    | Output directory. Defaults to `dist` |

## Vite plugin

```ts title="vite.config.ts"
import { defineConfig } from 'vite';
import { appManifest } from '@activitypods/app-manifest/vite';

export default defineConfig({
  plugins: [appManifest()]
});
```

| Option   | Type     | Default      | Description    |
| -------- | -------- | ------------ | -------------- |
| `origin` | `String` | `PUBLIC_URL` | URL of the app |

- **In development**, the plugin serves the documents without cache and with the header `Access-Control-Allow-Origin: *`. It reads the manifest on each request, so a change is immediately visible. If neither `origin` nor `PUBLIC_URL` is set, it uses the URL of the dev server.
- **When building**, it writes the documents to the output directory. The build fails if neither `origin` nor `PUBLIC_URL` is set. `PUBLIC_URL` can be defined in the environment or in a `.env` file.

### Client ID

The plugin provides the client ID of the app through a virtual module:

```ts
import { clientId } from 'virtual:app-manifest';
```

With TypeScript, declare this module in your `vite-env.d.ts` file:

```ts title="src/vite-env.d.ts"
/// <reference types="@activitypods/app-manifest/client" />
```

## Generated documents

| Path                         | Content                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `/app.json`                  | Description of the app. Its URL is the Solid-OIDC `client_id`, and must not change |
| `/access-needs/group-*.json` | One group of access needs per necessity, named after its content                   |
| `/access-needs/need-*.json`  | One document per shape tree, named after its content                               |

The app must use these URLs, relative to the URL of the app:

| URL                        | Use                                        |
| -------------------------- | ------------------------------------------ |
| `/login`                   | Redirection after login                    |
| `/login?logout=true`       | Redirection after logout                   |
| `/login?register_app=true` | Redirection after the authorization screen |

These are the defaults of the [auth provider](/app-framework/frontend/auth-provider/) and of the `LoginPage` component.

The Pod provider's frontend reads these documents from another origin, so they must be served with the header `Access-Control-Allow-Origin: *`.
