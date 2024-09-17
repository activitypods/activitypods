DOCKER_COMPOSE_DEV=docker compose
DOCKER_COMPOSE_TEST=docker compose -f docker-compose-test.yml
DOCKER_COMPOSE_PUBLISH=docker compose -f docker-compose-publish.yml

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

publish-frontend:
	export TAG=`git describe --tags --abbrev=0`
	$(DOCKER_COMPOSE_PUBLISH) build frontend
	$(DOCKER_COMPOSE_PUBLISH) push frontend

publish-backend:
	export TAG=`git describe --tags --abbrev=0`
	$(DOCKER_COMPOSE_PUBLISH) build backend
	$(DOCKER_COMPOSE_PUBLISH) push backend

publish-frontend-latest:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build frontend
	$(DOCKER_COMPOSE_PUBLISH) push frontend

publish-backend-latest:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build backend
	$(DOCKER_COMPOSE_PUBLISH) push backend

publish-frontend-arm64:
	export TAG=arm64
	$(DOCKER_COMPOSE_PUBLISH) build frontend
	$(DOCKER_COMPOSE_PUBLISH) push frontend

publish-backend-arm64:
	export TAG=arm64
	$(DOCKER_COMPOSE_PUBLISH) build backend
	$(DOCKER_COMPOSE_PUBLISH) push backend

publish-arena:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build arena
	$(DOCKER_COMPOSE_PUBLISH) push arena

publish-arena-arm64:
	export TAG=latest
	$(DOCKER_COMPOSE_PUBLISH) build arena
	$(DOCKER_COMPOSE_PUBLISH) push arena
