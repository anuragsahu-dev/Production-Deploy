# 🚀 Master Production Deployment Guide

## Single Server • Docker Compose • GitHub Actions • SSL • Monitoring

This guide consolidates everything from our deployment journey (February 21–24, 2026). Follow these steps to set up, deploy, and maintain your application on AWS EC2 with Ubuntu 24.04 LTS.

---

## 🏗️ 1. Infrastructure Requirements

| Component   | Specification                                        |
| ----------- | ---------------------------------------------------- |
| **Server**  | AWS EC2 `t3.small` or `t3.medium` (Ubuntu 24.04 LTS) |
| **Storage** | 20GB gp3 SSD                                         |
| **IPv4**    | 1 Elastic IP (Associated with Instance)              |
| **Domain**  | Your DuckDNS or Custom Domain                        |

### Security Group (Port Rules)

| Protocol  | Port          | Source                                   | Why?                |
| --------- | ------------- | ---------------------------------------- | ------------------- |
| **SSH**   | 22 (or yours) | **Your IP** (or 0.0.0.0/0 with Key Auth) | Management          |
| **HTTP**  | 80            | 0.0.0.0/0                                | Certbot & Redirects |
| **HTTPS** | 443           | 0.0.0.0/0                                | Secure API Traffic  |

---

## ⚙️ 2. GitHub Configuration

### 2.1 Repository Secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret Name          | Value                                   |
| -------------------- | --------------------------------------- |
| `DOCKERHUB_USERNAME` | Your Docker Hub username                |
| `DOCKERHUB_PASSWORD` | Docker Hub Access Token (not password)  |
| `APP_ID`             | GitHub App ID (for `build.yaml`)        |
| `APP_SECRET_KEY`     | GitHub App Private Key (`.pem` content) |
| `EC2_HOST`           | Your EC2 Elastic IP                     |
| `EC2_USERNAME`       | `ubuntu`                                |
| `EC2_SSH_KEY`        | Your `.pem` private key file content    |
| `EC2_SSH_PORT`       | `22` (default)                          |

### 2.2 GitHub App (Automated Image Updates)

To allow the **Build** workflow to update `compose.yaml` automatically:

1. Create a GitHub App with **Contents: Read & Write** permissions.
2. Install it on the repository.
3. In **Settings → Rulesets**, find your `main` branch ruleset.
4. Add the **GitHub App** to the **"Bypass list"** with "Always" permission. This allows the bot to push image updates without a PR.

---

## 🐧 3. EC2 Server Preparation (One-Time)

### 3.1 Install Docker (Ubuntu 24.04 Method)

SSH into your EC2 and run these commands block-by-block:

```bash
# 1. Prerequisites
sudo apt update && sudo apt install ca-certificates curl -y
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# 2. Add Repository (Noble for 24.04)
echo "Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\nComponents: stable\nSigned-By: /etc/apt/keyrings/docker.asc" | sudo tee /etc/apt/sources.list.d/docker.sources

# 3. Install
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y

# 4. Permissions (Log out and back in after this)
sudo usermod -aG docker $USER
exit
```

### 3.2 Configure Docker Log Rotation

Prevents your logs from eating all disk space.

```bash
sudo nano /etc/docker/daemon.json
```

Paste:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Restart: `sudo systemctl restart docker`

### 3.3 Create Persistent .env

Create the directory and the secret file:

```bash
mkdir -p ~/app
nano ~/app/.env
```

Paste your **Production Secrets** (LOKI credentials, DB URLs, etc.). _Note: Our `deploy.yaml` is configured to backup and restore this file during updates._

---

## 🚀 4. The Deployment Cycle

### Phase 1: Build (Manual)

1. Go to **Actions → Build Docker Image → Run Workflow**.
2. This builds the image, pushes it to Docker Hub, and updates `compose.yaml` in your repo with a unique tag (e.g., `build-sha123`).

### Phase 2: Deploy (Manual)

1. Pull the latest `main` branch to your local machine (since the build bot updated `compose.yaml`).
2. Go to **Actions → Deploy → Run Workflow**.
3. This SSHs into EC2, pulls the new image, and runs `docker compose up -d`.

---

## 🔒 5. SSL & HTTPS Configuration

### 5.1 Get SSL Certificate (Certbot)

Run once your domain points to your EC2 IP:

```bash
cd ~/app
mkdir -p certbot/conf certbot/www
docker compose run --rm certbot certonly --webroot --webroot-path=/var/www/certbot -d anuragsahu.duckdns.org --email your-email@gmail.com --agree-tos --no-eff-email
```

### 5.2 Update Nginx to Production Mode

Edit `~/app/nginx/conf.d/default.conf` to:

1. Uncomment the **Port 443** (HTTPS) block.
2. Replace all `your-domain.com` with `anuragsahu.duckdns.org`.
3. In the **Port 80** block, change `location /` to:
   ```nginx
   location / { return 301 https://$host$request_uri; }
   ```
4. Restart: `docker compose restart nginx`

### 5.3 Set SSL Auto-Renewal Cron

```bash
crontab -e
```

Add: `0 3 * * * cd ~/app && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload`

---

## 📊 6. Monitoring Setup

### 6.1 Logs (Grafana Cloud Loki)

1. **Configure Alloy:** We use `config.alloy` to ship logs.
2. **Search:** In Grafana Explore, use `{job="docker"}` or `{service="api"}` to view logs.
3. **Parsing:** Logs are parsed from Winston JSON to extract `level` and `service` automatically.

### 6.2 Uptime Monitoring (UptimeRobot)

1. Point it to `https://anuragsahu.duckdns.org/health`.
2. Set interval to **5 minutes**.

### 6.3 Server Metrics (AWS CloudWatch)

1. Already collecting metrics (CPU, RAM, Disk) by default.
2. Recommended Alarm: **CPU > 80% for 5 minutes**.

---

## 📈 7. Scaling Scaling (Optional)

If your traffic grows, you can run multiple replicas of your API.

**Method 1: Manual Scale**

```bash
docker compose up -d --scale app=2
```

**Method 2: Automatic (compose.yaml)**
Add this to your `app` service:

```yaml
deploy:
  replicas: 2
```

_Note: t3.small has 2GB RAM. Stay at 1-2 replicas for best stability._

---

## 🛠️ 8. Useful Commands on EC2

| Command                      | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `docker compose ps`          | Check if containers are healthy                        |
| `docker compose logs -f app` | Real-time app logs                                     |
| `docker compose top`         | See CPU/RAM per container                              |
| `docker images -a`           | List all images (Deploy cleans old ones automatically) |

---

**Build with ❤️ for High Performance & Low Cost.**
