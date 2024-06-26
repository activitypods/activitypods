.DEFAULT_GOAL := help
.PHONY: docker-build docker-up build start log stop restart

DOCKER_COMPOSE_DEV=docker compose -f docker-compose.yml
DOCKER_COMPOSE_PROD=docker compose -f docker-compose-prod.yml --env-file .env.local
DOCKER_COMPOSE_BUILD=docker compose -f docker-compose-build.yml

# Build and start

build-prod: 
	$(DOCKER_COMPOSE_PROD) up -d --force-recreate

start-prod: 
	$(DOCKER_COMPOSE_PROD) build

stop-prod:
	$(DOCKER_COMPOSE_PROD) kill
	$(DOCKER_COMPOSE_PROD) rm -fv

# Maintainance

log-prod:
	$(DOCKER_COMPOSE_PROD) logs -f backend frontend fuseki

attach-backend:
	$(DOCKER_COMPOSE_PROD) exec backend pm2 attach 0

show-config:
	$(DOCKER_COMPOSE_PROD) config

# Release

push-frontend:
	$(DOCKER_COMPOSE_BUILD) build frontend && $(DOCKER_COMPOSE_BUILD) push frontend

push-backend:
	$(DOCKER_COMPOSE_BUILD) build backend && $(DOCKER_COMPOSE_BUILD) push backend

