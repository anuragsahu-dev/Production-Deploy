# ============================================
# Stage 1: Build
# ============================================
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# Remove dev dependencies — keep only production deps (express, dotenv, etc.)
RUN npm prune --omit=dev

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-slim AS runner

WORKDIR /app

# Create non-root user for security
RUN useradd -m appuser

# Copy production dependencies from builder (express, dotenv, helmet, cors, winston)
COPY --from=builder /app/node_modules ./node_modules

# Copy package.json (some packages reference it at runtime)
COPY --from=builder /app/package.json ./package.json

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Switch to non-root user
USER appuser

EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/index.js"]