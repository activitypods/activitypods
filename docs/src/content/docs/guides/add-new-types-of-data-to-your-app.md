---
title: Add new types of data to your app
sidebar:
  order: 1
---

This guide shows you how to access and use new types of data in your app. It assumes that you have used the [app boilerplate](https://github.com/activitypods/app-boilerplate) repository introduced in the [Create Your First Social App](../create-your-first-social-app/) guide.

## What are shapes and shape trees ?

To create interoperable applications, we need to declare exactly what kind of data they will read or write, and we need to share this information in a public place so that the Pod provider can know when two applications want to access the same kind of data.

The [Solid Application Interoperability](https://solid.github.io/data-interoperability-panel/specification/) (SAI) specification recommends using shapes and shape trees to do this:

- A shape is a way to validate linked data against a set of conditions. It can also be used for filtering. For example, shapes can be used to find all projects on a storage. [SHACL](https://en.wikipedia.org/wiki/SHACL) is the W3C recommendation for describing shapes.

- A [shape tree](https://shapetrees.org/) allows shapes to be linked together: for example, a project can be automatically linked to some issues and documents, so that when a user shares a project with another user, the issues and documents are also shared.

:::info
In the current version of ActivityPods, shape trees are limited: they cannot reference other shapes. So in the example above, if you give an application access to all of your projects, you must also give it access to all of your issues and documents. But in the future, we will support more complex shape trees.
:::

So if you want your application to handle a new type of data, you either have to find an existing shape tree (which is probably used by another application), or you have to create your own shape tree.

## Finding existing shape trees

Shape trees must be located in a public URL, but they can be located anywhere on the web. To make it easier, we provide a shape repository for applications that need them.

If you access the [activitypods/shapes](https://github.com/activitypods/shapes) GitHub repository, you will find a [list of shape trees](https://github.com/activitypods/shapes/tree/master/src/shapetrees) that are already available and used by other ActivityPods applications. Here's for example what the shape tree for ActivityStreams events looks like:

```ttl title="Event.ttl"
PREFIX : <>
PREFIX st: <http://www.w3.org/ns/shapetrees#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX as: <https://www.w3.org/ns/activitystreams#>

:Event
  a st:ShapeTree ;
  st:expectsType st:Resource ;
  st:shape <../../shapes/as/Event> ;
  st:describesInstance as:name ;
  skos:prefLabel "Events"@en, "Evénements"@fr .
```

This shape tree is automatically deployed to https://shapes.activitypods.org/shapetrees/as/Event and its corresponding shape is deployed to https://shapes.activitypods.org/shapes/as/Event. Both are available in Turtle and JSON-LD.

Until we develop a nice frontend (and maybe a tool to automatically find the shape trees used by other applications), this is how you will find existing shape trees.

If you have found a shape tree that meets your needs, you can skip directly to the [Declaring the app's access needs](#declaring-the-app-s-access-needs) section. Otherwise, please read on.

## Creating new shape trees

There are many ways to propose a new shape tree. For your convenience, we recommend that you run the above shape repository locally, test it with your application, and when you are ready, submit a PR in order to publish it.

### Running the shape repository locally

```bash
git clone https://github.com/activitypods/shapes.git shapes
cd shapes
yarn install
yarn start
```

It is now available on http://localhost:8000. You can see an example shape on http://localhost:8000/shapetrees/as/Event

### Using the local shape repository

By default, the Pod provider and application use the public shape repository located at https://shapes.activitypods.org. To use your new local shape repository, you need to change some environment variables. Attention: to make sure you stay alert, they are all named differently ;)

- Create an `.env.local` in the root directory and add this variable: `SHAPE_REPOSITORY_URL=http://localhost:8000`
- Create an `.env.local` file in the `/backend` directory and add this variable: `SEMAPPS_SHAPE_REPOSITORY_URL=http://localhost:8000`
- Create an `.env.local` file in the `/frontend` directory and add this variable: `VITE_SHAPE_REPOSITORY_URL=http://localhost:8000`

You will then need to restart the pod provider and your application for the new environment variables to take effect. If you have already created a user, we recommend starting over with a new user and storage to use your local repo.

:::info
We would be happy to automate this with some bash scripts so that it's easy to switch between the production shape repo and your local repo ([#402](https://github.com/activitypods/activitypods/issues/402)), and also to automatically update the shape trees URL in the Pod provider ([#401](https://github.com/activitypods/activitypods/issues/401)). PR welcomes!
:::

### Adding your new shape tree

You are now ready to create your own shape and shape tree. Add it to a directory with the ontology prefix. For example, to create a shape for [FOAF projects](http://xmlns.com/foaf/spec/#term_Project), create a `Project.ttl` file in a new `/src/shapetrees/foaf` directory that looks like this:

```ttl title="Project.ttl" {4,6,9,10,11}
PREFIX : <>
PREFIX st: <http://www.w3.org/ns/shapetrees#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

:Project
  a st:ShapeTree ;
  st:expectsType st:Resource ;
  st:shape <../../shapes/foaf/Project> ;
  st:describesInstance foaf:name ;
  skos:prefLabel "Projects"@en, "Projets"@fr .
```

Next create the actual shape by creating another `Project.ttl` file, that will be located in a new `/src/shapes/foaf` directory:

```ttl title="Project.ttl" {3,5,7}
PREFIX : <>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>

:Project
  a sh:NodeShape ;
  sh:targetClass foaf:Project .
```

You can add other constraints if you are familiar with [SHACL](https://fr.wikipedia.org/wiki/SHACL). Note, however, that the more constraints you add, the more difficult it may be for your application to interoperate with other applications. Currently, only the `sh:targetClass` is required.

## Declaring the app's access needs

Now that you have a shape tree for `foaf:Project` resources, your application must declare this access need. Edit the `/backend/services/app.service.js` file and add an entry to the `accessNeeds.required` setting:

```js title="app.service.js" {7-10}
module.exports = {
  mixins: [AppService],
  settings: {
    ...
    accessNeeds: {
      required: [
        {
          shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/foaf/Project'),
          accessMode: ['acl:Read', 'acl:Write']
        },
        ...
      ]
    }
  }
};
```

With these few lines of code, your application is requesting read and write access to every resource that matches the given shape tree.

Stop and restart the application backend. It will automatically update itself with your new access needs. Now, when you open the application frontend, it will redirect you to an authorization screen asking if you agree to grant the application's new access needs.

:::caution
If you created a new ontology, there are a few more steps to follow. Please have a look at the [Adding a new ontology](#adding-a-new-ontology) appendix below before trying to register your application.
:::

## Configuring the frontend

Congratulations, your application now has the right to read and write `foaf:Project` resources. So let's adapt the frontend to actually do it!

### Adding a new resource to React-Admin

[React-Admin](https://marmelab.com/react-admin/documentation.html) requires you to define "resources", which are the types of data that the application handles. For example, an application may handle events, projects, documents, etc.

We will create a new resource called `projects` but any other name will work too.

Create a `projects` directory in `/src/resources` and add two `ProjectList.jsx` and `ProjectCreate.jsx` files based on the same model as the sample `EventList.jsx` and `EventCreate.jsx` components.

Now you can add this resource as a child of the main [`Admin`](https://marmelab.com/react-admin/Admin.html) component. Edit the `/frontend/src/App.js` file as follows:

```jsx title="App.js" {2-3,9-13}
...
import ProjectList from './resources/projects/ProjectList';
import ProjectCreate from './resources/projects/ProjectCreate';

const App = () => (
  <BrowserRouter>
    <Admin ...>
      // ... other resources here
      <Resource
        name="projects"
        list={ProjectList}
        create={ProjectCreate}
      />
    </Admin>
  </BrowserRouter>
);
```

:::note
You can also add other components to show or edit resources. See the [React-Admin documentation](https://marmelab.com/react-admin/Resource.html) for more information.
:::

### Add the data model

When you create a new resource in your application, you must also configure a corresponding [data model](https://semapps.org/docs/frontend/semantic-data-provider/data-model) in the data provider to help it find where the data resides and where to create it.

At the very least, the data model must include a `type` or a `shapeTreeUri` property. The `type` corresponds to the class of the data. We recommend using the `shapeTreeUri` property because it identifies the data more accurately.

Edit the `/src/frontend/config/dataProvider.js` file and add the data model of your new resource:

```js title="dataProvider.js" {4-6}
export default dataProvider({
  resources: {
    ...
    projects: {
      shapeTreeUri: urlJoin(import.meta.env.VITE_SHAPE_REPOSITORY_URL, 'shapetrees/foaf/Project')
    }
  },
  ...
});
```

:::note
We use the environment variable that you previously set to http://localhost:8000. This means that, when you want to switch to the public shape repository, your code will continue to work.
:::

## Conclusion

That's it ! You should now be able to create `foaf:Project` resources in your application frontend. They will be posted in a dedicated container in your users' Pod.

This is just an introductory guide. Please have look at the documentation of [React-Admin](https://marmelab.com/react-admin/documentation.html), [SemApps](https://semapps.org/docs/frontend/semantic-data-provider/) and ActivityPods for more complete information about this subject. And don't hesitate to ask questions in [our Matrix space](https://matrix.to/#/#activitypods:matrix.org)!

## Appendix: Adding a new ontology

In the example above, we used the [FOAF ontology](http://xmlns.com/foaf/spec/) that is already included by default in the app boilerplate. But if you want to use another ontology (or maybe create your own ontology), you will need to add it to the application backend.

:::note
You can discover what ontologies are included in the app boilerplate by looking at the top of its JSON-LD context: http://localhost:3001/.well-known/context.jsonld
:::

Edit the `/backend/services/core/core.service.js` file. You'll see that a few ontologies specific to ActivityPods are loaded in the `ontologies` settings:

```js title="core.service.js" {2,8}
const { CoreService } = require('@semapps/core');
const { apods, notify, interop, oidc } = require('@semapps/ontologies');

module.exports = {
  mixins: [CoreService],
  settings: {
    ...
    ontologies: [apods, notify, interop, oidc],
  }
}
```

Each of the above ontologies are objects. Here's how a very simple ontology may look like:

```js
const myonto = {
  prefix: 'myonto',
  namespace: 'https://www.myontology.com/ns/core#'
};
```

The `namespace` property should ideally point to a dereferencable URL, with your ontology definition, but this is not required. Generally, it ends with a hash (`#`). In the example above, if you define a class `myonto:Picture`, it will be dereferenced as `https://www.myontology.com/ns/core#Picture`.

:::note
The ontology object above can include other properties, such as a JSON-LD context. You may see examples by looking at [this list of core ontologies](https://github.com/assemblee-virtuelle/semapps/tree/master/src/middleware/packages/ontologies/ontologies/core) or you may read the related [documentation](https://semapps.org/docs/middleware/ontologies).
:::

Add the newly created object to the `ontologies` settings. Now, when you restart your backend, your custom ontology will automatically be added to the application JSON-LD context. The frontend will also be able to load it by looking at this JSON-LD context.

If you created your own ontology, there is one last thing you need to do: the Pod provider currently require all ontologies to have a known prefix. To do that, it uses the [prefix.cc](https://prefix.cc) database. So all you need to do is go to https://prefix.cc/myonto (or whatever prefix you decided to use) and add your ontology namespace. If the prefix is already used by another ontology, you should consider changing it to avoid conflicts.
