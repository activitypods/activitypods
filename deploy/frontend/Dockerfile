FROM node:14-alpine

# Default arguments
ARG SELECTED_BRANCH=master

WORKDIR /activitypods

RUN node -v
RUN npm -v

RUN apk add --update --no-cache autoconf bash libtool automake alpine-sdk openssh-keygen yarn nano

RUN yarn global add serve

# Force cache invalidation if the master branch changed since last build
# If we don't do that, Docker may skip the git clone command
ADD https://api.github.com/repos/assemblee-virtuelle/activitypods/git/refs/heads/$SELECTED_BRANCH ../git-version.json

RUN git clone https://github.com/assemblee-virtuelle/activitypods.git /activitypods

RUN git checkout $SELECTED_BRANCH

ADD app /activitypods/frontend
WORKDIR /activitypods/frontend

RUN yarn install

RUN yarn run build

EXPOSE 4000

CMD serve -s build -l 4000
