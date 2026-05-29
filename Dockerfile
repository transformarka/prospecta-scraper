FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    wget ca-certificates \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

# Instalar Chromium con todas sus dependencias del sistema
RUN npx playwright install --with-deps chromium

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

CMD ["node", "dist/index.js"]
