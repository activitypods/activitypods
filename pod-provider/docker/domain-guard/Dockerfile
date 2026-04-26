FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev
COPY index.js blocklist.json ./
CMD ["node", "index.js"]
