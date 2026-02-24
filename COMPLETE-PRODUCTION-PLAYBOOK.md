# 📖 Complete Production Deployment Playbook

## Full Lifecycle: Local Development → CI/CD → Cloud Infrastructure → Monitoring

This is the **definitive blueprint** of your entire production system. It consolidates every decision, configuration, and manual step taken between February 21–24, 2026.

---

## 🏗️ 1. Infrastructure Overview (Architecture)

We transitioned from a basic setup to a **Single VPS Professional Deployment (0–50K Users)**.

### The Stack:

- **Provider**: AWS EC2 `t3.medium` (2 vCPU, 4GB RAM) — _Allows headroom for Redis and Monitoring._
- **OS**: Ubuntu 24.04 LTS (Noble Numbat).
- **Orchestration**: Docker Compose (5 Containers: App, Redis, Nginx, Alloy, Certbot).
- **Log Management**: Grafana Cloud Loki via Grafana Alloy.
- **SSL**: Let's Encrypt via Certbot (HTTP-01 challenge).
- **Reverse Proxy**: Nginx with Rate Limiting and Security Hardening.

### Application Flow:

1. **Request** hits EC2 Elastic IP on Port 80/443.
2. **Nginx** handles SSL termination, redirects HTTP to HTTPS, and applies rate limits.
3. **App (Node.js)** receives the request via proxy, processes logic, and uses **Redis** for state/caching.
4. **Alloy** watches Docker log files, parses the JSON, and ships them to Grafana Cloud.

---

## 🛠️ 2. Local Development Environment

### 2.1 Quality Gates (Husky & Commitlint)

Your machine is protected against "bad code" commits via Git Hooks:

- **`pre-commit`**: Runs `npm run lint` and `npm run format:check`.
- **`commit-msg`**: Runs `commitlint` to ensure "Conventional Commits" (e.g., `feat:`, `fix:`).
- **`pre-push`**: Runs `npm run test` and `npm run build`.

### 2.2 TypeScript & Linting

- **Parser**: `typescript-eslint` using the `recommendedTypeChecked` ruleset.
- **Formatting**: `Prettier` handles all whitespace, strictly separating "Code Quality" (ESLint) from "Formatting" (Prettier).
- **Executor**: `tsx watch` for instant hot-reload without `dist/` clutter.

---

## 🚀 3. CI/CD (GitHub Actions)

### 3.1 `ci.yaml` (PR Verification)

Triggered on **Pull Requests to `main`**.

- Checks code across **Node.js 18, 20, and 22**.
- Spins up a **Redis service container** for integration tests.
- Runs Lint → Build → Test.

### 3.2 `build.yaml` (Image Registry)

Triggered **Manually**.

- Builds the production image using a **Multi-stage Dockerfile** (Runner stage is only ~50MB).
- Pushes to **Docker Hub** (e.g., `as3305100/api`) with both `latest` and `SHA` tags.
- **Automated Update**: It uses a **GitHub App** to commit the new image tag directly back to `compose.yaml`, so the server always knows which version to pull.

### 3.3 `deploy.yaml` (The Server Orchestrator)

Triggered **Manually** after Build.

- **Dynamic Security**: Uses an IAM user to authorized the GitHub runner's IP in the EC2 Security Group for **only** the duration of the deployment.
- **Persistent .env**: Automatically detects if a repository re-clone is needed. It **Backups `.env` to `/tmp/`**, performs a fresh `git clone`, and **Restores `.env`**.
- **Health Verification**: Runs a loop checking `docker compose ps --format '{{.Health}}'` for the `app` container.

---

## 🐧 4. Manual Server Setup (EC2)

### 4.1 Official Docker Installation (Ubuntu 24.04)

Run these specifically on Ubuntu 24.04:

```bash
# GPG Key
sudo apt update && sudo apt install ca-certificates curl -y
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Repository (Noble)
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installation
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
sudo usermod -aG docker $USER
```

### 4.2 Log Rotation Configuration

Prevents the disk from filling up with container logs:

```bash
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "30m",
    "max-file": "3"
  }
}
```

`sudo systemctl restart docker`

---

## 🔒 5. Nginx & SSL Mastery

### 5.1 Obtaining Certificates (Certbot)

Run this command from `~/app`:

```bash
docker compose run --rm certbot certonly --webroot --webroot-path=/var/www/certbot -d anuragsahu.duckdns.org --email your@email.com --agree-tos --no-eff-email
```

### 5.2 Nginx Production Config (`default.conf`)

- **SSL Termination**: Handles `crypto` for the app.
- **Redirects**: Forces port 80 traffic to 443.
- **Rate Limiting Zones**:
  - `api`: 10 requests/s per IP.
  - `auth`: 5 requests/min per IP.
- **Proxy Headers**:
  - `X-Real-IP`: Passes true client IP to Node.js.
  - `X-Forwarded-Proto`: Tells Node.js if the user used https.

---

## 📊 6. Monitoring & Observability

### 6.1 Grafana Cloud Alloy

Your `config.alloy` is customized to scrape Docker logs and parse Winston JSON.

- **Docker Mapping**: `/var/lib/docker/containers/*/*-json.log`.
- **Parsing Stage**:
  1. `docker {}`: Unpacks the Docker JSON metadata.
  2. `json { expressions = { level = "level", service = "service" } }`: Extracts fields from the Winston string.
  3. `labels`: Promotes these fields to searchable Loki labels.

### 6.2 Uptime Monitoring

Configure **UptimeRobot** to hit `https://anuragsahu.duckdns.org/health`.

- **Status Check**: Should return `200 OK` with JSON: `{"status":"ok", "redis":"connected"}`.

---

## 🏗️ 7. Maintenance Playbook

### Scaling

To increase capacity on your `t3.medium`:

```bash
docker compose up -d --scale app=2
```

### Cleanups

Run weekly to reclaim disk space:

```bash
docker system prune -af --volumes
```

### SSL Renewal (Cron)

```bash
0 3 * * * cd ~/app && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
```

---

**Document Status**: Final Version (v1.0)
**Compiled From**: 12+ Task Modules & 23,000+ Lines of Project Notes.
