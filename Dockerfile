FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

RUN npm prune --omit=dev

FROM node:22-slim AS runner

WORKDIR /app

RUN useradd -m appuser

COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/package.json ./package.json

COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/index.js"]