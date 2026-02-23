# 🚀 Remaining Manual Steps — Production Deployment Guide

> **What's already done:** GitHub repo ✅ | Ruleset ✅ | Secrets ✅ | GitHub App ✅ | Docker Hub ✅
>
> **What's NOT used:** PostgreSQL / RDS (removed from this guide)
>
> Follow these steps **in order** to go live.

---

## Step 1: Update Docker Hub Image Name

Replace `YOUR_DOCKERHUB_USERNAME/api` with your **actual Docker Hub username** in these 3 files:

| #   | File                            | Line | Change                                      |
| --- | ------------------------------- | ---- | ------------------------------------------- |
| 1   | `compose.yaml`                  | 6    | `image: YOUR_DOCKERHUB_USERNAME/api:latest` |
| 2   | `.github/workflows/build.yaml`  | 7    | `IMAGE_NAME: YOUR_DOCKERHUB_USERNAME/api`   |
| 3   | `.github/workflows/deploy.yaml` | 7    | `IMAGE_NAME: YOUR_DOCKERHUB_USERNAME/api`   |

**Example:** If your Docker Hub username is `anurag123`, change to `anurag123/api`

After changing:

```bash
git add .
git commit -m "chore: update docker hub image name"
git push origin main
```

---

## Step 2: Launch AWS EC2 Instance

1. Go to **AWS Console → EC2 → Launch Instance**
2. Configure:

| Setting       | Value                                            |
| ------------- | ------------------------------------------------ |
| Name          | `my-api-server`                                  |
| AMI           | Ubuntu Server 24.04 LTS                          |
| Instance Type | `t3.medium` (2 vCPU, 4GB RAM)                    |
| Key Pair      | Create new → `my-api-key` → Download `.pem` file |
| Storage       | 20 GB gp3 SSD                                    |

### Security Group (⚠️ Critical)

| Type  | Port | Source         | Purpose                |
| ----- | ---- | -------------- | ---------------------- |
| SSH   | 22   | **My IP only** | ⚠️ NEVER use 0.0.0.0/0 |
| HTTP  | 80   | 0.0.0.0/0      | Web traffic            |
| HTTPS | 443  | 0.0.0.0/0      | SSL traffic            |

> ❌ Do **NOT** open ports 3000 or 6379. App and Redis are internal only — Nginx handles all external traffic.

---

## Step 3: Allocate Elastic IP

1. Go to **EC2 → Elastic IPs → Allocate Elastic IP address**
2. Select the new IP → **Actions → Associate** → select your EC2 instance
3. **Note this IP address** — you'll need it everywhere

### Update GitHub Secret

Go to **GitHub Repo → Settings → Secrets → Actions** and update:

| Secret     | Value               |
| ---------- | ------------------- |
| `EC2_HOST` | Your new Elastic IP |

> Without an Elastic IP, your public IP changes every time the instance stops/starts.

---

## Step 4: SSH into EC2

### Fix `.pem` File Permissions (Windows PowerShell — One Time)

```powershell
icacls my-api-key.pem /reset
icacls my-api-key.pem /grant:r "%username%:R"
icacls my-api-key.pem /inheritance:r
```

### Connect

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>
```

---

## Step 5: Install Docker on EC2 (Ubuntu 24.04 LTS)

Run these commands **on the EC2 server** (after SSH):

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y
```

### 5a. Add Docker's official GPG key

```bash
sudo apt install ca-certificates curl -y
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

### 5b. Add Docker repository to apt sources

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
```

### 5c. Install Docker Engine + Compose plugin

```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
```

### 5d. Add your user to the docker group (so you don't need sudo)

```bash
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
exit
```

### 5e. Reconnect and Verify

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>

docker --version          # Should show Docker version (e.g., 27.x)
docker compose version    # Should show Compose version (e.g., v2.x)
sudo docker run hello-world   # Should print "Hello from Docker!"
```

> **Why this method instead of `get.docker.com` script?**
> The apt repository method is Docker's **officially recommended** approach. It gives you proper package management — future updates come automatically via `sudo apt upgrade`.

---

## Step 6: Configure Docker Log Rotation

Without this, Docker logs grow **forever** and fill the disk.

```bash
sudo nano /etc/docker/daemon.json
```

Paste this:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Save (`Ctrl+O → Enter → Ctrl+X`) and restart Docker:

```bash
sudo systemctl restart docker
```

> This limits each container to 30MB of logs (3 files × 10MB).

---

## Step 7: Create `.env` on Server

This file lives **only on the server** — it's never in Git.

```bash
mkdir -p ~/app
nano ~/app/.env
```

Paste your **real production values**:

```env
PORT=3000
REDIS_URL=redis://redis:6379
CORS_ORIGIN=https://your-domain.com

# Grafana Cloud — Loki (logs) — fill after Step 15
LOKI_URL=
LOKI_USERNAME=
LOKI_API_KEY=
```

Save: `Ctrl+O → Enter → Ctrl+X`

---

## Step 8: First Deployment 🚀

### Option A: Via GitHub Actions (Recommended)

1. Go to **GitHub → Actions → "Build Docker Image" → Run workflow**
2. Wait for it to complete ✅ (builds image → pushes to Docker Hub → updates `compose.yaml`)
3. Go to **GitHub → Actions → "Deploy" → Run workflow**
4. Wait for health check to pass ✅

### Option B: Manual First Deploy (if Actions aren't ready)

```bash
ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>

# Clone the repo
git clone https://github.com/YOUR_USER/YOUR_REPO.git ~/app
cd ~/app

# .env should already be there from Step 7
# Create certbot directories (Nginx needs these to start)
mkdir -p certbot/conf certbot/www

# Build and start
docker compose up --build -d

# Verify
docker compose ps                     # All should be Up/Healthy
docker compose logs -f app            # Check app logs (Ctrl+C to exit)
curl http://localhost:3000/health      # Should return OK
```

### Verify from Outside

Open your browser and go to: `http://<ELASTIC_IP>/health`

You should see a health check response. If yes — **your app is live!** 🎉

---

## Step 9: Point Domain to EC2

In your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.):

| Type | Name                       | Value          | TTL |
| ---- | -------------------------- | -------------- | --- |
| A    | `@` (or `your-domain.com`) | `<ELASTIC_IP>` | 300 |
| A    | `www`                      | `<ELASTIC_IP>` | 300 |

### Verify DNS (wait 5-60 minutes for propagation)

```bash
ping your-domain.com       # Should resolve to your Elastic IP
```

Or check at: https://dnschecker.org

---

## Step 10: Update Nginx Config with Your Domain

On the EC2 server:

```bash
cd ~/app
nano nginx/conf.d/default.conf
```

Replace every instance of `your-domain.com` with your **actual domain**.

```bash
docker compose restart nginx
```

---

## Step 11: Get SSL Certificate

```bash
cd ~/app

docker compose run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  -d your-domain.com -d www.your-domain.com \
  --email your@email.com --agree-tos --no-eff-email
```

> If this fails, make sure:
>
> - DNS is properly pointing to your EC2 IP
> - Port 80 is open in your Security Group
> - Nginx is running: `docker compose ps`

---

## Step 12: Enable HTTPS in Nginx

Edit `nginx/conf.d/default.conf` on the server:

```bash
cd ~/app
nano nginx/conf.d/default.conf
```

Make these 2 changes:

### Change 1: HTTP block (port 80) — redirect all traffic to HTTPS

Replace the `location /` block with:

```nginx
location / {
    return 301 https://$host$request_uri;
}
```

### Change 2: Uncomment the HTTPS server block (port 443)

Uncomment the entire HTTPS server block and replace `your-domain.com` with your actual domain.

### Restart Nginx

```bash
docker compose restart nginx
```

### Verify HTTPS

```bash
curl https://your-domain.com/health
```

---

## Step 13: SSL Auto-Renewal (Cron Job)

Let's Encrypt certs expire every **90 days**. Set up automatic renewal:

```bash
crontab -e
```

Add this line at the bottom:

```
0 3 * * * cd ~/app && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
```

> Checks daily at 3:00 AM. Only renews if the cert is close to expiring.

---

## Step 14: Set Up UptimeRobot (Free)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Click **Add New Monitor**:
   - **Type:** HTTP(S)
   - **URL:** `https://your-domain.com/health`
   - **Interval:** 5 minutes
3. Set alert contacts (email, Slack, Telegram, etc.)

> If 3 consecutive checks fail → sends you an alert.

---

## Step 15: Set Up Grafana Cloud Loki (Free — 50GB/month)

1. Sign up at [grafana.com/cloud](https://grafana.com/products/cloud/)
2. Go to **My Account → Loki section**
3. Copy:
   - **URL:** `https://logs-prod-xxx.grafana.net/loki/api/v1/push`
   - **Username:** (numeric ID)
4. Go to **Security → API Keys → Add API Key**
   - Name: `alloy`
   - Role: `MetricsPublisher`
   - **Copy the key** (shown only once)
5. **SSH to EC2** and update `~/app/.env`:

```bash
cd ~/app
nano .env
```

Fill in the Loki values:

```env
LOKI_URL=https://logs-prod-xxx.grafana.net/loki/api/v1/push
LOKI_USERNAME=123456
LOKI_API_KEY=glc_xxxxxxxxxxxxxxx
```

> **Note:** Server metrics (CPU, RAM, disk) are handled by **AWS CloudWatch** (built into EC2, no extra setup). Grafana Mimir is not needed.

6. Restart containers:

```bash
docker compose up -d
```

### Verify Logs in Grafana

1. Go to your Grafana dashboard (`your-org.grafana.net`)
2. Click **Explore** (compass icon)
3. Select **Loki** data source
4. Try these queries:

```
{job="docker", service="api"}                    # All app logs
{job="docker", service="api"} |= "error"         # Only errors
{job="docker", container_name="nginx"}           # Nginx logs
```

---

## Step 16: Set Up AWS CloudWatch Alarms (Free)

CloudWatch is already enabled by default for EC2 (CPU, network, disk, status checks).

### Create Alarms

1. Go to **AWS Console → CloudWatch → Alarms → Create Alarm**
2. Create these 2 alarms:

| Metric                | Threshold       | Action             |
| --------------------- | --------------- | ------------------ |
| CPU Utilization > 80% | 5 min sustained | Email notification |
| Status Check Failed   | 1 occurrence    | Email notification |

---

## ✅ Final Checklist

```
[ ] IMAGE_NAME updated in 3 files (compose.yaml, build.yaml, deploy.yaml)
[ ] EC2 instance launched (Ubuntu 24.04, t3.medium, 20GB)
[ ] Security Group: only ports 22 (my IP), 80, 443
[ ] Elastic IP allocated and associated with EC2
[ ] EC2_HOST secret updated in GitHub
[ ] Docker + Docker Compose installed on EC2
[ ] Docker log rotation configured (/etc/docker/daemon.json)
[ ] .env created on EC2 server (~/app/.env)
[ ] First deployment successful (health check passes)
[ ] Domain DNS A records pointing to Elastic IP
[ ] Nginx config updated with actual domain name
[ ] SSL certificate obtained via Certbot
[ ] HTTPS enabled in Nginx (HTTP → HTTPS redirect)
[ ] SSL auto-renewal cron job set
[ ] UptimeRobot monitoring /health endpoint
[ ] Grafana Cloud Loki receiving logs
[ ] CloudWatch alarms configured (CPU + Status Check)
```

---

## 🔄 Your Daily Workflow (After Everything is Set Up)

```
1. Write code on a feature branch
2. git commit -m "feat: add something"      ← Husky: lint + format + commitlint
3. git push origin feature-branch           ← Husky: test + build
4. Create PR to main                        ← CI runs: lint + build + test (3 Node versions)
5. Merge PR (after CI passes)
6. GitHub Actions → "Build Docker Image"    ← Manual trigger
7. GitHub Actions → "Deploy"                ← Manual trigger
8. App is live! 🚀
```

---

## 💰 Monthly Cost

| Service                     | Cost           |
| --------------------------- | -------------- |
| EC2 `t3.medium` (4GB RAM)   | ~$30           |
| EBS Storage (20GB SSD)      | ~$2            |
| Elastic IP (while attached) | Free           |
| **Total AWS**               | **~$32/month** |

### Free Services

| Service            | Free Tier                   |
| ------------------ | --------------------------- |
| Grafana Cloud Loki | 50GB/month logs             |
| UptimeRobot        | 50 monitors, 5-min interval |
| AWS CloudWatch     | Basic metrics + 10 alarms   |
| Let's Encrypt SSL  | Unlimited certs             |
| GitHub Actions     | 2,000 min/month             |
| Docker Hub         | 1 private repo              |

---

## 🔥 When Something Goes Wrong (Troubleshooting)

```
3:00 AM — App crashes
    │
    ▼
UptimeRobot: 3 failed pings → emails you
    │
    ▼
You wake up, SSH into EC2:
    ssh -i my-api-key.pem ubuntu@<ELASTIC_IP>
    │
    ▼
Quick check:
    docker compose ps              → Which container is down?
    docker compose logs app -n 50  → What happened?
    │
    ▼
Deep search (Grafana Cloud Loki):
    {service="api"} | json | level="error"
    → Find the exact error with timestamp
    │
    ▼
Fix → Push → Build → Deploy
```
