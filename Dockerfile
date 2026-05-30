FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline=false

COPY tsconfig.json ./
COPY src ./src
RUN rm -rf dist && npm run build

EXPOSE 8080
CMD ["node", "dist/index.js"]
