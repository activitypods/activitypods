# Deploy ActivityPods to production

This guide will help you to deploy the [boilerplate](../boilerplate) and the [frontend](../frontend) to a production environment.

It includes:
- [Traefik](https://traefik.io) to orchestrate domain names and certificates
- [Apache Jena Fuseki](https://jena.apache.org/documentation/fuseki2/) triplestore to store semantic data (on port 3030)
- Redis to cache data and store the emails queue
- [Arena](https://github.com/bee-queue/arena) to view the emails queue (on port 4567)
- The frontend
- The boilerplate

## Configuration

In `docker-compose.yml`:

- Replace `domain.com` by your domain name
- Replace `app.domain.com` by the domain name of the frontend app
- Replace `myemail@mydomain.com` by your email address (this is for Let's encrypt certificates)
- Replace `mypassword` with the password you want for the Fuseki admin

In `middleware/boilerplate/.env.local`:

- Replace `domain.com` by your domain name
- Replace `mypassword` by the previously set Fuseki password

> Any file added to the `middleware/boilerplate` directory will be copied to the boilerplate repo, eventually overwriting existing files.

In `frontend/app/.env.local`:

- Replace `https://mydomain.com/` with base URL of the boilerplate
- Set a [MapBox access token](https://docs.mapbox.com/help/glossary/access-token/) for `REACT_APP_MAPBOX_ACCESS_TOKEN`
- Replace any other env variable you want (app name, description, colors...)


## Launch

```bash
docker-compose build
docker-compose up -d
```
