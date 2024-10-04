FROM node:20-alpine

RUN node -v
RUN npm -v

WORKDIR /app/backend

RUN apk add --update --no-cache autoconf bash libtool automake python3 py3-pip alpine-sdk openssh-keygen yarn nano

RUN yarn global add pm2

ADD docker/ecosystem.config.js /app/backend

# Install packages first so that Docker doesn't run `yarn install` if the packages haven't changed
# See https://making.close.com/posts/reduce-docker-image-size
ADD backend/package.json /app/backend
ADD backend/yarn.lock /app/backend
RUN yarn install && yarn cache clean

ADD backend /app/backend

EXPOSE 3000

CMD [ "pm2-runtime", "ecosystem.config.js" ]
