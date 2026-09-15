DOCKER_COMPOSE_DEV=docker compose
DOCKER_COMPOSE_TEST=docker compose -f docker-compose-test.yml
VERSION=$(shell git describe --tags --always --match 'v[0-9]*' | sed 's/^v//')
DOCKER_COMPOSE_PUBLISH=VERSION=$(VERSION) COMPOSE_DOCKER_CLI_BUILD=1 DOCKER_BUILDKIT=1 docker compose -f docker-compose-publish.yml

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
	$(DOCKER_COMPOSE_TEST) up -d fuseki_test redis arena mailcatcher tripleadmin

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
	TAG=`git describe --tags --abbrev=0 --match 'v[0-9]*'` $(DOCKER_COMPOSE_PUBLISH) build --push frontend

publish-backend:
	TAG=`git describe --tags --abbrev=0 --match 'v[0-9]*'` $(DOCKER_COMPOSE_PUBLISH) build --push backend

publish-frontend-latest:
	TAG=`git describe --tags --abbrev=0 --match 'v[0-9]*'` $(DOCKER_COMPOSE_PUBLISH) build --push frontend && TAG=latest $(DOCKER_COMPOSE_PUBLISH) build --push frontend

publish-backend-latest:
	TAG=`git describe --tags --abbrev=0 --match 'v[0-9]*'` $(DOCKER_COMPOSE_PUBLISH) build --push backend && TAG=latest $(DOCKER_COMPOSE_PUBLISH) build --push backend

publish-arena:
	TAG=latest $(DOCKER_COMPOSE_PUBLISH) build --push arena
