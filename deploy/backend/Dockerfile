FROM node:14-alpine

# Default arguments
ARG SELECTED_BRANCH=master

WORKDIR /activitypods

RUN node -v
RUN npm -v

RUN apk add --update --no-cache autoconf bash libtool automake python3 py3-pip alpine-sdk openssh-keygen yarn nano

RUN yarn global add pm2

# Force cache invalidation if the master branch changed since last build
# If we don't do that, Docker may skip the git clone command
ADD https://api.github.com/repos/assemblee-virtuelle/activitypods/git/refs/heads/$SELECTED_BRANCH ../git-version.json

RUN git clone https://github.com/assemblee-virtuelle/activitypods.git /activitypods

ADD app /activitypods/backend

RUN yarn install
RUN yarn run bootstrap

WORKDIR /activitypods/backend

EXPOSE 3000

CMD [ "pm2-runtime", "ecosystem.config.js" ]
