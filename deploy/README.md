# Deploy ActivityPods to production

This guide will help you to deploy the boilerplate to a production environment.

It includes:
- Traefik to orchestrate domain names and certificates
- The Fuseki triple store to store data (on port 3030)
- Redis to cache data and store the emails queue
- Arena to view the emails queue (on port 4567)
- The boilerplate itself

## Configuration

In `docker-compose.yml`:

- Replace `domain.com` by your domain name
- Replace `myemail@mydomain.com` by your email address (this is for Let's encrypt certificates)
- Replace `mypassword` with the password you want for the Fuseki admin

In `middleware/.env.local`:

- Replace `domain.com` by your domain name
- Replace `mypassword` by the previously set Fuseki password

## Launch

```bash
docker-compose build
docker-compose up -d
```
