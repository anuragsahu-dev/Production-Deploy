# 🚀 Level 1: Single VPS Production Deployment Guide (0–50K Users)

## Architecture

```
                         ┌─────────────────────────────────────────────┐
                         │              AWS EC2 (4GB RAM)              │
   Internet              │                                             │
   ───────►  ┌───────────┤  ┌─────────┐    ┌─────────┐   ┌─────────┐ │
             │ Port 80/  │  │  Nginx  │───►│  App    │   │  Redis  │ │
             │ 443       │  │ Reverse │    │ (Node)  │   │ Cache + │ │
             └───────────┤  │ Proxy   │    │ :3000   │   │ Rate    │ │
                         │  │ (SSL +  │    │         │   │ Limit   │ │
                         │  │  Rate   │    │         │   │ :6379   │ │
                         │  │  Limit) │    │         │   │         │ │
                         │  └─────────┘    └────┬────┘   └─────────┘ │
                         │                      │                     │
                         └──────────────────────┼─────────────────────┘
                                                │
                                    ┌───────────▼───────────┐
                                    │  AWS RDS PostgreSQL   │
                                    │  (Managed, External)  │
                                    └───────────────────────┘

   Monitoring: UptimeRobot + AWS CloudWatch
   Logging:    Winston (JSON) → Promtail → Grafana Cloud Loki
   CI/CD:      GitHub Actions → SSH Deploy to EC2
```

---

## Roadmap

| Phase | What                                | Where       |
| ----- | ----------------------------------- | ----------- |
| 1     | Production Dockerfile (multi-stage) | Local       |
| 2     | Docker Compose orchestration        | Local       |
| 3     | Environment variable management     | Local + EC2 |
| 4     | Nginx reverse proxy config          | Local       |
| 5     | Provision AWS EC2 + RDS             | AWS Cloud   |
| 6     | Deploy to EC2                       | EC2 Server  |
| 7     | SSL with Let's Encrypt              | EC2 Server  |
| 8     | CI/CD with GitHub Actions           | GitHub      |
| 9     | Structured logging (Winston + Loki) | Local + EC2 |
| 10    | Monitoring & Alerting               | Cloud       |

---

---

# PHASE 1: Production Dockerfile

## Multi-Stage Build

```dockerfile
# ── Stage 1: Build ──
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
RUN npm prune --omit=dev        # Strip dev deps (typescript, eslint, etc.)

# ── Stage 2: Production ──
FROM node:22-slim AS runner
WORKDIR /app
RUN useradd -m appuser                                    # Non-root user
COPY --from=builder /app/node_modules ./node_modules      # Production deps only
COPY --from=builder /app/package.json ./package.json      # ESM needs this
COPY --from=builder /app/dist ./dist                      # Compiled JS
USER appuser
EXPOSE 3000
CMD ["node", "--enable-source-maps", "dist/index.js"]
```

### Key Decisions

| Decision                       | Why                                                                     |
| ------------------------------ | ----------------------------------------------------------------------- |
| `node:22-slim`                 | Debian-based, smaller than full image, better compatibility than Alpine |
| `npm ci --ignore-scripts`      | Clean install + skip post-install scripts (security)                    |
| `npm prune --omit=dev`         | Remove ~300MB of dev deps before copying to production stage            |
| Non-root `appuser`             | If app is compromised, attacker has limited permissions                 |
| No `HEALTHCHECK` in Dockerfile | Defined in `compose.yaml` instead — easier to tune per environment      |
| `--enable-source-maps`         | Error stack traces point to `.ts` line numbers, not compiled `.js`      |

### Image Size Comparison

```
Build stage (all deps):   ~400MB
Production stage:          ~80MB   ← What actually runs
```

### `.dockerignore`

```
node_modules
dist
npm-debug.log
.env
.git
.gitignore
*.md
tests
.prettierrc
.prettierignore
eslint.config.js
```

Without this, `COPY . .` would copy `node_modules` (500MB+) into the build context.

---

---

# PHASE 2: Docker Compose (Production)

## `compose.yaml`

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: api
    restart: unless-stopped
    env_file: .env # Secrets (DB, JWT, etc.)
    environment:
      - NODE_ENV=production # Overrides .env — guaranteed production
    depends_on:
      redis:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD-SHELL",
          'node -e "fetch(''http://localhost:3000/health'').then(r => { if (!r.ok) throw new Error(); })"',
        ]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    container_name: redis
    restart: unless-stopped
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    container_name: nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      app:
        condition: service_healthy
    networks:
      - app-network

  certbot:
    image: certbot/certbot
    container_name: certbot
    volumes:
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot

volumes:
  redis-data:

networks:
  app-network:
    driver: bridge
```

### Key Decisions

| Decision                                 | Why                                                                                     |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| App has NO `ports:`                      | Only Nginx is exposed (80/443). App is internal only.                                   |
| Health check uses `node -e fetch()`      | Node 22 has built-in `fetch()`. No need to install `wget`/`curl` — keeps image smaller. |
| `depends_on: condition: service_healthy` | Startup order: Redis → App → Nginx. Prevents 502 errors.                                |
| Redis `maxmemory 256mb`                  | On 4GB VPS: OS (~1GB) + App (~500MB) + Nginx (~50MB) + Redis (256MB) = safe             |
| `allkeys-lru` eviction                   | When Redis is full, evict least-recently-used keys automatically                        |
| `:ro` volumes for Nginx                  | Read-only — compromised container can't modify configs/certs                            |
| `unless-stopped` restart                 | Auto-restart after crashes or server reboot                                             |

### Startup Order

```
1. Redis starts    → healthcheck: redis-cli ping     → healthy ✅
2. App starts      → healthcheck: fetch /health      → healthy ✅
3. Nginx starts    → routes traffic to app
```

---

---

# PHASE 3: Environment Variable Management

## The Rule

```
┌───────────────────────────────┬──────────────────────────────┐
│ .env file (secrets, private)  │ environment: (public, fixed) │
├───────────────────────────────┼──────────────────────────────┤
│ DATABASE_URL=postgres://...   │ NODE_ENV=production          │
│ JWT_SECRET=abc123             │                              │
│ REDIS_URL=redis://redis:6379  │                              │
│ CORS_ORIGIN=https://...       │                              │
└───────────────────────────────┴──────────────────────────────┘
      ❌ NOT in Git                     ✅ Can be in Git
```

## Priority (highest wins)

```
1. environment:    ← Always wins (hardcoded in compose.yaml)
2. env_file: .env  ← Loaded second
3. Dockerfile ENV  ← Lowest priority (default fallback)
```

So `NODE_ENV=production` in `environment:` will **always** be production, even if `.env` says `development`.

## How `.env` Gets to Production Server

`.env` is in `.gitignore` — it never goes to GitHub. Three ways to handle it:

### Method 1: Create manually on server (Simplest) ✅

```bash
# SSH into EC2 (one time setup)
ssh -i my-api-key.pem ubuntu@<EC2_IP>
cd ~/app
nano .env       # Paste your production secrets, save
```

This file **survives** `git pull` — Git doesn't know about it. Every future deployment just uses the existing `.env`.

### Method 2: CI/CD creates it from GitHub Secrets (Automated)

```yaml
# In deploy workflow
- name: Deploy
  uses: appleboy/ssh-action@v1
  with:
    host: ${{ secrets.EC2_HOST }}
    key: ${{ secrets.EC2_SSH_KEY }}
    script: |
      cd ~/app
      git pull origin main
      cat > .env << EOF
      DATABASE_URL=${{ secrets.DATABASE_URL }}
      JWT_SECRET=${{ secrets.JWT_SECRET }}
      REDIS_URL=redis://redis:6379
      EOF
      docker compose up -d --build
```

### `.env.example` (Committed to Git — template)

```env
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/myapp
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me
CORS_ORIGIN=http://localhost:5173
```

---

---

# PHASE 4: Nginx Reverse Proxy

## Directory Structure

```
nginx/
├── nginx.conf
└── conf.d/
    └── default.conf
```

## `nginx/nginx.conf`

```nginx
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    client_max_body_size 10M;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Rate Limiting Zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;    # General API
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;    # Login (brute force protection)

    include /etc/nginx/conf.d/*.conf;
}
```

## `nginx/conf.d/default.conf` — HTTP Only (Before SSL)

```nginx
upstream api_backend {
    server app:3000;        # 'app' = Docker Compose service name
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Let's Encrypt challenge (needed for SSL setup)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://api_backend;     # No rate limiting on health checks
    }
}
```

## `nginx/conf.d/default.conf` — After SSL Setup (Final)

```nginx
upstream api_backend {
    server app:3000;
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl;
    server_name your-domain.com www.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://api_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://api_backend;
    }
}
```

---

---

# PHASE 5: Provision AWS EC2 + RDS

## EC2 Instance

| Setting       | Value                                            |
| ------------- | ------------------------------------------------ |
| AMI           | Ubuntu Server 24.04 LTS                          |
| Instance Type | `t3.medium` (2 vCPU, 4GB RAM, ~$30/month)        |
| Key Pair      | Create `my-api-key.pem` — download and keep safe |
| Storage       | 20 GB gp3 SSD                                    |

### Security Group (Firewall)

| Port | Source           | Purpose                          |
| ---- | ---------------- | -------------------------------- |
| 22   | **Your IP only** | SSH (⚠️ NEVER open to 0.0.0.0/0) |
| 80   | 0.0.0.0/0        | HTTP                             |
| 443  | 0.0.0.0/0        | HTTPS                            |

> **Do NOT expose 3000 or 6379.** App and Redis are internal — Nginx handles all external traffic.

### Elastic IP

Allocate one and associate it with your EC2. Without it, your public IP changes every stop/start.

## RDS PostgreSQL (Managed Database)

| Setting       | Value                                      |
| ------------- | ------------------------------------------ |
| Engine        | PostgreSQL 16.x                            |
| Instance      | `db.t3.micro` (free tier) or `db.t3.small` |
| Storage       | 20 GB gp3                                  |
| Public Access | **No** (only EC2 can connect)              |
| VPC           | Same as EC2                                |

### RDS Security Group

| Port | Source                | Purpose                |
| ---- | --------------------- | ---------------------- |
| 5432 | EC2 Security Group ID | Only EC2 → RDS allowed |

**Why managed DB?** Auto-backups, point-in-time recovery, easy scaling. No data loss risk from Docker container restarts.

---

---

# PHASE 6: Deploy to EC2

## Step 1 — Install Docker on EC2

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>

sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
sudo apt install docker-compose-plugin -y
exit     # Log out and back in for group changes
```

## Step 2 — Clone Project

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>
git clone https://github.com/YOUR_USER/YOUR_REPO.git ~/app
cd ~/app
```

## Step 3 — Create `.env` on Server

```bash
nano .env
# Paste production secrets, save
```

## Step 4 — Create Required Directories

```bash
mkdir -p nginx/conf.d certbot/conf certbot/www
```

## Step 5 — Build & Start

```bash
docker compose up --build -d

# Verify
docker compose ps            # All containers should be Up/Healthy
docker compose logs -f app   # Check app logs
curl http://<ELASTIC_IP>/health
```

---

---

# PHASE 7: SSL with Let's Encrypt

## Step 1 — Point Domain to EC2

In your domain registrar, add A records:

| Type | Name              | Value          |
| ---- | ----------------- | -------------- |
| A    | `your-domain.com` | `<ELASTIC_IP>` |
| A    | `www`             | `<ELASTIC_IP>` |

## Step 2 — Get Certificate

```bash
docker compose run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com -d www.your-domain.com \
  --email your@email.com --agree-tos --no-eff-email
```

## Step 3 — Switch Nginx to HTTPS Config

Replace `nginx/conf.d/default.conf` with the SSL version (from Phase 4).

```bash
docker compose restart nginx
curl https://your-domain.com/health    # Should work now
```

## Step 4 — Auto-Renew (Cron Job)

```bash
crontab -e
# Add:
0 3 * * * cd ~/app && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
```

Certs expire every 90 days. This checks daily at 3AM and renews if needed.

---

---

# PHASE 8: CI/CD with GitHub Actions

## GitHub Secrets to Add

| Secret        | Value                        |
| ------------- | ---------------------------- |
| `EC2_HOST`    | Elastic IP                   |
| `EC2_USER`    | `ubuntu`                     |
| `EC2_SSH_KEY` | Contents of `my-api-key.pem` |

## `.github/workflows/deploy.yml`

```yaml
name: Deploy to EC2

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to EC2
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/app
            git pull origin main
            docker compose up -d --build
            docker image prune -f
```

### Flow

```
git push main → Tests pass → SSH into EC2 → git pull → rebuild containers → done
```

`docker image prune -f` cleans up old images to save disk space.

---

---

# PHASE 9: Structured Logging (Winston + Grafana Loki)

## Winston Logger Setup

Winston writes **JSON logs in production** (machine-parseable) and **colorized text in development** (human-readable).

```typescript
// src/config/logger.ts
import winston from "winston";
import { env } from "./env.js";

const logger = winston.createLogger({
  level: env.isDev ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: "api" },
  transports: [
    new winston.transports.Console({
      format: env.isDev
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : winston.format.json(),
    }),
  ],
});

export default logger;
```

### Log Output

**Development:** `info: Server running on http://localhost:3000`

**Production:** `{"level":"info","message":"Server running","service":"api","timestamp":"2026-02-21T12:00:00Z"}`

## Log Pipeline: App → Promtail → Grafana Cloud Loki

```
App (Winston JSON) → Docker stdout → Promtail reads Docker logs → Ships to Loki → View in Grafana
```

### Add Promtail to `compose.yaml`

```yaml
promtail:
  image: grafana/promtail:latest
  container_name: promtail
  restart: unless-stopped
  volumes:
    - /var/log:/var/log:ro
    - /var/lib/docker/containers:/var/lib/docker/containers:ro
    - ./promtail/config.yml:/etc/promtail/config.yml:ro
  command: -config.file=/etc/promtail/config.yml
  networks:
    - app-network
```

### `promtail/config.yml`

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: https://logs-prod-xxx.grafana.net/loki/api/v1/push
    basic_auth:
      username: "YOUR_LOKI_USER_ID"
      password: "YOUR_GRAFANA_API_KEY"

scrape_configs:
  - job_name: docker
    static_configs:
      - targets: [localhost]
        labels:
          job: docker
          __path__: /var/lib/docker/containers/*/*-json.log
    pipeline_stages:
      - docker: {}
      - json:
          expressions:
            level: level
            service: service
      - labels:
          level:
          service:
```

### Docker Log Rotation (Prevent disk full)

```bash
# /etc/docker/daemon.json on EC2
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

Max 30MB of logs per container (3 files × 10MB).

---

---

# PHASE 10: Monitoring & Alerting

## UptimeRobot (Free — Uptime Monitoring)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor: `https://your-domain.com/health` every 5 minutes
3. Set alert contacts (email, Slack, Telegram)

Pings `/health` every 5 min. If 3 consecutive failures → sends alert.

## AWS CloudWatch (Server Metrics)

Already enabled for EC2 by default (CPU, network, disk, status checks).

### Set Up Alarms

| Metric              | Threshold    | Action             |
| ------------------- | ------------ | ------------------ |
| CPU > 80% for 5 min | Alert        | Email notification |
| Status Check Failed | 1 occurrence | Email notification |

---

---

# 📁 Final Project Structure

```
📁 project/
├── 📁 .github/workflows/
│   └── deploy.yml              ← CI/CD
├── 📁 nginx/
│   ├── nginx.conf              ← Main config
│   └── conf.d/default.conf     ← Server block
├── 📁 promtail/
│   └── config.yml              ← Log shipper config
├── 📁 certbot/                 ← Created on server only
├── 📁 src/
│   ├── config/env.ts           ← Centralized env config
│   ├── config/logger.ts        ← Winston logger
│   └── index.ts                ← Entry point
├── Dockerfile                  ← Multi-stage production
├── Dockerfile.dev              ← Development
├── compose.yaml                ← Production orchestration
├── compose.dev.yaml            ← Development orchestration
├── .dockerignore
├── .gitignore
├── .env                        ← Secrets (not in Git)
├── .env.example                ← Template (in Git)
├── tsconfig.json
└── package.json
```

---

# ⚡ Quick Reference

```bash
# Development
docker compose -f compose.dev.yaml up --build

# Production (on EC2)
docker compose up --build -d          # Start
docker compose ps                     # Status
docker compose logs -f app            # Logs
docker compose restart app            # Restart app
docker compose down                   # Stop all

# SSL
docker compose run --rm certbot renew
docker compose exec nginx nginx -s reload

# Maintenance
docker system prune -af               # Clean old images
```

---

# 💰 Monthly Cost (AWS)

| Service               | Cost           |
| --------------------- | -------------- |
| EC2 `t3.medium` (4GB) | ~$30           |
| RDS `db.t3.micro`     | ~$15           |
| EBS Storage (20GB)    | ~$2            |
| **Total**             | **~$47/month** |

| Free Services      |                     |
| ------------------ | ------------------- |
| Grafana Cloud Loki | 50GB/month free     |
| UptimeRobot        | 50 monitors free    |
| Let's Encrypt SSL  | Free                |
| GitHub Actions     | 2000 min/month free |
