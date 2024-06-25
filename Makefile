.DEFAULT_GOAL := help
.PHONY: docker-build docker-up build start log stop restart

DOCKER_COMPOSE_DEV=docker compose -f docker-compose.yml
DOCKER_COMPOSE_PROD=docker compose -f docker-compose-prod.yml --env-file .env.local

# Docker
docker-build-dev:
	$(DOCKER_COMPOSE_DEV) build

docker-build-prod:
	$(DOCKER_COMPOSE_PROD) build

docker-stop-dev:
	$(DOCKER_COMPOSE_DEV) kill
	$(DOCKER_COMPOSE_DEV) rm -fv

docker-stop-prod:
	$(DOCKER_COMPOSE_PROD) kill
	$(DOCKER_COMPOSE_PROD) rm -fv

docker-start-dev:
	$(DOCKER_COMPOSE_DEV) up -d --force-recreate

docker-start-prod:
	$(DOCKER_COMPOSE_PROD) up -d --force-recreate

log:
	$(DOCKER_COMPOSE) logs -f backend frontend fuseki

log-prod:
	$(DOCKER_COMPOSE_PROD) logs -f backend frontend fuseki

start-dev: docker-start-dev

start-prod: docker-start-prod

stop-dev: docker-stop-dev

stop-prod: docker-stop-prod

build-dev:docker-build-dev

build-prod: docker-build-prod

attach-backend:
	$(DOCKER_COMPOSE_PROD) exec backend pm2 attach 0

show-config:
	$(DOCKER_COMPOSE_PROD) config
