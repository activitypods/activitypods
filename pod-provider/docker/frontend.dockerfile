FROM node:20-alpine

RUN node -v
RUN npm -v

WORKDIR /app/frontend

RUN apk add --update --no-cache autoconf bash libtool automake python3 py3-pip alpine-sdk openssh-keygen yarn nano

RUN yarn global add serve

# Install packages first so that Docker doesn't run `yarn install` if the packages haven't changed
# See https://making.close.com/posts/reduce-docker-image-size
ADD frontend/package.json /app/frontend
ADD frontend/yarn.lock /app/frontend
RUN yarn install && yarn cache clean

ADD docker/docker-entrypoint.sh /app/frontend
RUN ["chmod", "+x", "docker-entrypoint.sh"]

ADD frontend /app/frontend

RUN yarn run build

EXPOSE 5000

ENTRYPOINT ["/app/frontend/docker-entrypoint.sh"]

CMD /usr/local/bin/serve -s build -l 5000
