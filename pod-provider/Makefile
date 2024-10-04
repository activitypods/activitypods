DOCKER_COMPOSE_DEV=docker compose
DOCKER_COMPOSE_TEST=docker compose -f docker-compose-test.yml
DOCKER_COMPOSE_PUBLISH=COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker compose -f docker-compose-publish.yml

# Development

build: 
	$(DOCKER_COMPOSE_DEV) build

start: 
	$(DOCKER_COMPOSE_DEV) up -d

stop:
	$(DOCKER_COMPOSE_DEV) down

compact-datasets:
	$(DOCKER_COMPOSE_DEV) down
	docker run --volume=./data/fuseki:/fuseki --entrypoint=/docker-compact-entrypoint.sh semapps/jena-fuseki-webacl
	docker run --volume=./data/fuseki_test:/fuseki --entrypoint=/docker-compact-entrypoint.sh semapps/jena-fuseki-webacl
	$(DOCKER_COMPOSE_DEV) up -d

# Test

start-test: 
	$(DOCKER_COMPOSE_TEST) up -d fuseki_test redis arena mailcatcher

start-test-with-pod-provider: 
	$(DOCKER_COMPOSE_TEST) up -d --build

build-test: 
	$(DOCKER_COMPOSE_TEST) build

stop-test:
	$(DOCKER_COMPOSE_TEST) kill
	$(DOCKER_COMPOSE_TEST) rm -fv

# Publish

init-container-builder:
	docker buildx create --name container-builder --driver docker-container --use --bootstrap

publish-frontend:
	export TAG=`git describe --tags --abbrev=0`
	$(DOCKER_COMPOSE_PUBLISH) build --push frontend

publish-backend:
	export TAG=`git describe --tags --abbrev=0`
	$(DOCKER_COMPOSE_PUBLISH) build --push backend

publish-frontend-latest:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build --push frontend

publish-backend-latest:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build --push backend

publish-arena:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build --push arena
