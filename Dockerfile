FROM node:20-bookworm-slim

WORKDIR /app

# Build server
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --prefix server

# Build web
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web

COPY server ./server
COPY web ./web
RUN npm --prefix server run build && npm --prefix web run build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "npm --prefix server run migrate && node server/dist/index.js"]