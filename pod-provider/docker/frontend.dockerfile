FROM node:20-alpine

RUN node -v
RUN npm -v

RUN apk add --update --no-cache autoconf bash libtool automake python3 py3-pip alpine-sdk openssh-keygen yarn nano

RUN yarn global add serve

ADD frontend /app/frontend

WORKDIR /app/frontend

# Install packages and immediately remove cache to reduce layer size
# See https://making.close.com/posts/reduce-docker-image-size
RUN yarn install && yarn cache clean

RUN yarn run build

ADD docker/docker-entrypoint.sh /app/frontend

RUN ["chmod", "+x", "docker-entrypoint.sh"]

EXPOSE 5000

ENTRYPOINT ["/app/frontend/docker-entrypoint.sh"]

CMD /usr/local/bin/serve -s build -l 5000
