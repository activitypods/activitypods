#!/bin/bash

# Stop all containers including Fuseki
docker compose down

docker run --volume="$(pwd)"/data/fuseki:/fuseki --entrypoint=/docker-compact-entrypoint.sh semapps/jena-fuseki-webacl

docker run --volume="$(pwd)"/data/fuseki_test:/fuseki --entrypoint=/docker-compact-entrypoint.sh semapps/jena-fuseki-webacl

docker compose up -d
