FROM node:20-alpine

RUN node -v
RUN npm -v

RUN apk add --update --no-cache autoconf bash libtool automake python3 py3-pip alpine-sdk openssh-keygen yarn nano

RUN yarn global add pm2

ADD backend /app/backend
ADD config/docker/ecosystem.config.js /app/backend

WORKDIR /app/backend

# Install packages and immediately remove cache to reduce layer size
# See https://making.close.com/posts/reduce-docker-image-size
RUN yarn install && yarn cache clean

EXPOSE 3000

CMD [ "pm2-runtime", "ecosystem.config.js" ]
