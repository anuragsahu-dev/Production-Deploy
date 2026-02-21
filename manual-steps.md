# 🚀 Manual Deployment Steps

> All code/config files are ready. Follow these steps in order to go live.

---

## Step 1: GitHub Setup

### Create Repository

```bash
git init
git add .
git commit -m "chore: initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
git push -u origin main
```

### Create GitHub App (needed for build workflow)

The build workflow needs to push `compose.yaml` changes back to the repo. A GitHub App token is required for this.

1. Go to **GitHub → Settings → Developer Settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **Name:** `deploy-bot` (or anything unique)
   - **Homepage URL:** your repo URL
   - **Permissions → Repository → Contents:** `Read & Write`
   - **Where can this app be installed?** `Only on this account`
3. Click **Create GitHub App**
4. Note the **App ID** (shown at the top of the app page)
5. Scroll down → **Generate a private key** → downloads a `.pem` file
6. Go to **Install App** (left sidebar) → Install on your repo

### Add GitHub Secrets

Go to **Repo → Settings → Secrets and variables → Actions → New repository secret**

| Secret               | Value                                  | Used By     |
| -------------------- | -------------------------------------- | ----------- |
| `DOCKERHUB_USERNAME` | Your Docker Hub username               | build.yaml  |
| `DOCKERHUB_PASSWORD` | Docker Hub access token (not password) | build.yaml  |
| `APP_ID`             | GitHub App ID (number)                 | build.yaml  |
| `APP_SECRET_KEY`     | Full contents of the `.pem` file       | build.yaml  |
| `EC2_HOST`           | Elastic IP (add after EC2 setup)       | deploy.yaml |
| `EC2_USER`           | `ubuntu`                               | deploy.yaml |
| `EC2_SSH_KEY`        | Full contents of `my-api-key.pem`      | deploy.yaml |

---

## Step 2: Docker Hub

1. Create account at [hub.docker.com](https://hub.docker.com)
2. Go to **Account Settings → Security → New Access Token**
   - Description: `github-actions`
   - Permissions: `Read & Write`
   - Copy the token (shown once)
3. Create a repository: click **Create Repository**
   - Name: `api` (or your app name)
   - Visibility: Private (recommended)

### Update Image Name in Code

Replace `YOUR_DOCKERHUB_USERNAME/api` with your actual image name in:

| File                            | Line                                        |
| ------------------------------- | ------------------------------------------- |
| `compose.yaml`                  | `image: YOUR_DOCKERHUB_USERNAME/api:latest` |
| `.github/workflows/build.yaml`  | `IMAGE_NAME: YOUR_DOCKERHUB_USERNAME/api`   |
| `.github/workflows/deploy.yaml` | `IMAGE_NAME: YOUR_DOCKERHUB_USERNAME/api`   |

Example: `as3305100/api`

---

## Step 3: AWS EC2

### Launch Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Configure:

| Setting       | Value                                            |
| ------------- | ------------------------------------------------ |
| Name          | `my-api-server`                                  |
| AMI           | Ubuntu Server 24.04 LTS                          |
| Instance Type | `t3.medium` (2 vCPU, 4GB RAM)                    |
| Key Pair      | Create new → `my-api-key` → Download `.pem` file |
| Storage       | 20 GB gp3 SSD                                    |

### Security Group (Firewall)

| Type  | Port | Source    | Purpose                |
| ----- | ---- | --------- | ---------------------- |
| SSH   | 22   | **My IP** | ⚠️ NEVER use 0.0.0.0/0 |
| HTTP  | 80   | 0.0.0.0/0 | Web traffic            |
| HTTPS | 443  | 0.0.0.0/0 | SSL traffic            |

> **Do NOT open ports 3000 or 6379.** App and Redis are internal — Nginx handles all external traffic.

### Allocate Elastic IP

1. Go to **EC2 → Elastic IPs → Allocate**
2. Select the IP → **Actions → Associate** → choose your EC2 instance

Without an Elastic IP, your public IP changes every time the instance stops/starts.

---

## Step 4: AWS RDS PostgreSQL

### Create Database

1. Go to **AWS Console → RDS → Create Database**
2. Configure:

| Setting           | Value                    |
| ----------------- | ------------------------ |
| Engine            | PostgreSQL 16.x          |
| Template          | Free tier (or Dev/Test)  |
| Instance          | `db.t3.micro`            |
| Storage           | 20 GB gp3                |
| Master username   | `postgres`               |
| Master password   | Choose a strong password |
| **Public access** | **No**                   |
| VPC               | Same as EC2              |

### RDS Security Group

Edit the RDS security group to allow connections **only** from EC2:

| Type       | Port | Source                |
| ---------- | ---- | --------------------- |
| PostgreSQL | 5432 | EC2 Security Group ID |

### Get Connection String

After creation, find the **Endpoint** in the RDS dashboard:

```
mydb.abc123xyz.us-east-1.rds.amazonaws.com
```

Your `DATABASE_URL` will be:

```
postgresql://postgres:YOUR_PASSWORD@mydb.abc123xyz.us-east-1.rds.amazonaws.com:5432/myapp
```

---

## Step 5: EC2 Server Setup

### SSH into EC2

```bash
# On Windows (PowerShell)
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>

# If permission error on .pem file (Windows):
icacls my-api-key.pem /reset
icacls my-api-key.pem /grant:r "%username%:R"
icacls my-api-key.pem /inheritance:r
```

### Install Docker

```bash
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group (avoid needing sudo)
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Log out and back in for group changes to take effect
exit
```

### Verify Docker

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>

docker --version          # Should show Docker version
docker compose version    # Should show Compose version
```

### Configure Docker Log Rotation

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

```bash
sudo systemctl restart docker
```

This limits each container to 30MB of logs (3 files × 10MB). Prevents disk from filling up.

---

## Step 6: Create `.env` on Server

```bash
mkdir -p ~/app
cd ~/app
nano .env
```

Paste your **real production secrets**:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_RDS_ENDPOINT:5432/myapp
REDIS_URL=redis://redis:6379
JWT_SECRET=generate-a-random-64-char-string-here
CORS_ORIGIN=https://your-domain.com

# Grafana Cloud Loki (from Step 9)
LOKI_URL=https://logs-prod-xxx.grafana.net/loki/api/v1/push
LOKI_USERNAME=your-loki-user-id
LOKI_API_KEY=your-grafana-api-key
```

Save: `Ctrl+O → Enter → Ctrl+X`

> **Generate a JWT secret:**
>
> ```bash
> openssl rand -base64 48
> ```

This file is never in Git. It lives only on the server.

---

## Step 7: First Deployment

### Option A: Via GitHub Actions (Recommended)

1. Go to **GitHub → Actions → Build Docker Image → Run workflow**
2. Wait for it to complete ✅
3. Go to **GitHub → Actions → Deploy → Run workflow**
4. Wait for health check ✅

### Option B: Manual First Deploy (if workflows aren't ready)

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>

# Clone the repo
git clone https://github.com/YOUR_USER/YOUR_REPO.git ~/app
cd ~/app

# .env should already be there from Step 6

# Create certbot directories (Nginx needs these to start)
mkdir -p certbot/conf certbot/www

# Build and start
docker compose up --build -d

# Verify
docker compose ps                     # All should be Up/Healthy
docker compose logs -f app            # Check app logs
curl http://localhost:3000/health      # Should return {"status":"ok","redis":"connected"}
```

---

## Step 8: DNS + SSL

### Point Domain to EC2

In your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):

| Type | Name                       | Value          | TTL |
| ---- | -------------------------- | -------------- | --- |
| A    | `@` (or `your-domain.com`) | `<ELASTIC_IP>` | 300 |
| A    | `www`                      | `<ELASTIC_IP>` | 300 |

Wait 5-60 minutes for DNS propagation. Verify:

```bash
ping your-domain.com    # Should resolve to your Elastic IP
```

### Update Nginx Config

Replace `your-domain.com` with your actual domain in `nginx/conf.d/default.conf`.

Push the change and redeploy, or edit directly on the server:

```bash
cd ~/app
nano nginx/conf.d/default.conf
# Replace 'your-domain.com' everywhere
docker compose restart nginx
```

### Get SSL Certificate

```bash
cd ~/app

docker compose run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com -d www.your-domain.com \
  --email your@email.com --agree-tos --no-eff-email
```

### Enable HTTPS in Nginx

Edit `nginx/conf.d/default.conf`:

1. **Uncomment** the entire HTTPS server block (port 443)
2. Replace `your-domain.com` with your actual domain
3. **Change** the HTTP server (port 80) to redirect:

```nginx
# In the port 80 server block, replace location / with:
location / {
    return 301 https://$host$request_uri;
}
```

Restart Nginx:

```bash
docker compose restart nginx
```

Verify:

```bash
curl https://your-domain.com/health
```

### Auto-Renew Certificates

Let's Encrypt certs expire every 90 days. Set up a cron job:

```bash
crontab -e
```

Add this line:

```
0 3 * * * cd ~/app && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
```

Checks daily at 3:00 AM. Only renews if cert is close to expiring.

---

## Step 9: Monitoring

### UptimeRobot (Uptime Monitoring — Free)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. **Add New Monitor:**
   - Type: HTTP(S)
   - URL: `https://your-domain.com/health`
   - Interval: 5 minutes
3. Set alert contacts (email, Slack, Telegram)

If 3 consecutive checks fail → sends an alert.

### Grafana Cloud Loki (Log Aggregation — Free tier: 50GB/month)

1. Sign up at [grafana.com/cloud](https://grafana.com/products/cloud/)
2. Go to **My Account → Loki section**
3. Copy:
   - **URL:** `https://logs-prod-xxx.grafana.net/loki/api/v1/push`
   - **Username:** (numeric ID)
4. Go to **Security → API Keys → Add API Key**
   - Name: `alloy`
   - Role: `MetricsPublisher`
   - Copy the key (shown once)
5. Update `.env` on the server with these values
6. Restart containers: `docker compose up -d`

#### View Logs in Grafana

1. Go to your Grafana dashboard (`your-org.grafana.net`)
2. Click **Explore** (compass icon)
3. Select **Loki** data source
4. Example queries:

```
{job="docker", service="api"}                    # All app logs
{job="docker", service="api"} |= "error"         # Only errors
{job="docker", container_name="nginx"}           # Nginx logs
```

### AWS CloudWatch (Server Metrics)

1. Go to **CloudWatch → Alarms → Create Alarm**
2. Recommended alarms:

| Metric                | Threshold | Action             |
| --------------------- | --------- | ------------------ |
| CPU Utilization > 80% | 5 min     | Email notification |
| Status Check Failed   | 1         | Email notification |

---

## ✅ Deployment Complete Checklist

```
[ ] GitHub repo created and code pushed
[ ] GitHub App created (for build workflow)
[ ] GitHub Secrets configured (all 7)
[ ] Docker Hub account + access token
[ ] IMAGE_NAME updated in 3 files
[ ] EC2 instance running with Elastic IP
[ ] Security Group: only 22 (my IP), 80, 443
[ ] RDS PostgreSQL created (not publicly accessible)
[ ] RDS Security Group: only EC2 → 5432
[ ] Docker installed on EC2
[ ] Docker log rotation configured
[ ] .env created on EC2 server
[ ] First deployment successful
[ ] Domain pointed to Elastic IP
[ ] SSL certificate obtained
[ ] HTTPS enabled in Nginx
[ ] SSL auto-renewal cron set
[ ] UptimeRobot monitoring /health
[ ] Grafana Cloud Loki receiving logs
[ ] CloudWatch alarms set
```

---

## 💰 Monthly Cost

| Service                     | Cost           |
| --------------------------- | -------------- |
| EC2 `t3.medium` (4GB)       | ~$30           |
| RDS `db.t3.micro`           | ~$15           |
| EBS Storage (20GB)          | ~$2            |
| Elastic IP (while attached) | Free           |
| **Total**                   | **~$47/month** |

| Free Services      |                     |
| ------------------ | ------------------- |
| Grafana Cloud Loki | 50GB/month free     |
| UptimeRobot        | 50 monitors free    |
| Let's Encrypt SSL  | Free                |
| GitHub Actions     | 2000 min/month free |
| Docker Hub         | 1 private repo free |

---

## 🔄 Everyday Workflow (After Setup)

```
1. Write code on feature branch
2. git commit -m "feat: add something"     ← Husky: lint + format + commitlint
3. git push origin feature-branch          ← Husky: test + build
4. Create PR to main                       ← CI: lint + build + test (3 Node versions)
5. Merge PR
6. GitHub Actions → Build Docker Image     ← Manual trigger
7. GitHub Actions → Deploy                 ← Manual trigger
8. App is live! 🚀
```
