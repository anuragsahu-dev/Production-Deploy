# 🌐 The Ultimate Production Deployment & Management Guide

## Full Stack: Node.js • Docker Compose • Nginx • SSL • Grafana Cloud • GitHub Actions

This is the definitive guide for your production environment, consolidating all research, configurations, and fixes from February 21–24, 2026.

---

## 🏛️ 1. System Architecture

Your system is designed for **High Performance**, **Security**, and **Observability** on a single AWS EC2 instance.

### Traffic Flow:

1.  **User** requests `https://anuragsahu.duckdns.org`
2.  **Nginx (Docker)**: Terminates SSL, applies Rate Limiting (10 req/s), and Reverse Proxies to the App.
3.  **App (Node.js)**: Processes logic, talks to **Redis** (internal Docker network) for caching/rate limiting.
4.  **Health Check**: `/health` is exposed for monitoring tools (no rate limiting applied here).

### Data Flow (Logging):

1.  **App (Winston)**: Logs JSON to `stdout`.
2.  **Docker**: Captures logs at `/var/lib/docker/containers/*/*.log`.
3.  **Alloy (Grafana)**: Reads files → Parses Docker JSON → Parses Winston JSON (extracts `level`, `service`) → Ships to **Grafana Cloud Loki**.

---

## 🛠️ 2. Server Configuration (AWS EC2)

### 2.1 Recommended Hardware

| Component    | Requirement                                         |
| ------------ | --------------------------------------------------- |
| **Instance** | `t3.small` (2GB RAM) or `t3.medium` (4GB RAM)       |
| **OS**       | Ubuntu 24.04 LTS (Noble)                            |
| **Storage**  | 20GB EBS (gp3)                                      |
| **Network**  | Elastic IP (Crucial: Prevents IP change on restart) |

### 2.2 Security Group Rules

| Type      | Port | Source    | Why?                      |
| --------- | ---- | --------- | ------------------------- |
| **SSH**   | 22   | Your IP   | Admin Access              |
| **HTTP**  | 80   | 0.0.0.0/0 | Let's Encrypt / Redirects |
| **HTTPS** | 443  | 0.0.0.0/0 | Secure Traffic            |

---

## 📦 3. One-Time Server Setup (Must Follow Carefully)

### Step 1: Install Docker (Ubuntu 24.04 Official)

```bash
sudo apt update && sudo apt install ca-certificates curl -y
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu noble stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin -y
sudo usermod -aG docker $USER
```

_Logout and login again for permissions to take effect._

### Step 2: Enable Log Rotation

_Ensures your server doesn't crash from "Disk Full" errors._

```bash
sudo nano /etc/docker/daemon.json
```

Paste this configuration:

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

---

## 🔐 4. SSL & Nginx Configuration

### 4.1 SSL (Certbot)

Run this command once your domain points to your IP:

```bash
cd ~/app
mkdir -p certbot/conf certbot/www
docker compose run --rm certbot certonly --webroot --webroot-path=/var/www/certbot -d anuragsahu.duckdns.org --email your-email@gmail.com --agree-tos --no-eff-email
```

### 4.2 Nginx Tuning (`default.conf`)

Your Nginx config is set for **Rate Limiting** and **SSL Termination**.

- **Rate Limit**: 10 requests/sec per IP (defined in `nginx.conf`).
- **Reverse Proxy**: Forwards `X-Forwarded-For` so your Node.js app knows the real user IP.
- **SSL Auto-Renewal**: Add this to your `crontab -e`:

```bash
0 3 * * * cd ~/app && docker compose run --rm certbot renew && docker compose exec nginx nginx -s reload
```

---

## 🤖 5. CI/CD (GitHub Actions)

### Secrets Management

Add these to **GitHub Settings → Secrets → Actions**:

- `DOCKERHUB_USERNAME` / `DOCKERHUB_PASSWORD`
- `EC2_HOST` (Your Elastic IP)
- `EC2_SSH_KEY` (Key content)
- `APP_ID` / `APP_SECRET_KEY` (From your GitHub App - enables the build bot to update `compose.yaml`).

### Deployment Logic in `deploy.yaml`:

- **Safe .env Persistence**: The script now detects if it's the "First Deployment", backups your `.env` to `/tmp/`, re-clones the repo, and restores the `.env`. This ensures you **never lose your server secrets**.
- **Health Checks**: The workflow waits up to 2 minutes for the app to report `healthy` before finishing.

---

## 📊 6. Monitoring & Logs (Grafana Cloud)

### 6.1 Alloy (Log Shipper)

Your `alloy/config.alloy` is advanced. It handles:

1.  **Docker Extraction**: Maps `/var/lib/docker/containers/*/*-json.log`.
2.  **JSON Processing**: Unpacks the Docker wrapper.
3.  **Labeling**: Creates `level` (info/warn/error) and `service` labels so you can filter logs easily.

### 6.2 Useful Loki Queries:

- **See all errors**: `{job="docker", level="error"}`
- **See only API logs**: `{service="api"}`
- **Search for a specific IP**: `{job="docker"} |= "1.2.3.4"`

### 6.3 UptimeRobot:

Monitors `https://anuragsahu.duckdns.org/health`.

- **Expected Status**: 200 OK.
- **Interval**: 5 minutes.
- **Alert**: Email/Slack notification if status is not 200.

---

## 🚀 7. Ongoing Management

### Scaling Replicas

If you get high traffic, scale your app without downtime (if using multiple containers):

```bash
docker compose up -d --scale app=2
```

### Useful Maintenance Commands

| Command                        | Purpose                   |
| ------------------------------ | ------------------------- |
| `docker compose ps`            | Status of all services    |
| `docker compose logs -f alloy` | Debugging log shipping    |
| `docker compose logs -f app`   | Real-time app logs        |
| `docker system prune -f`       | Clean up old images/cache |

---

**Build Documentation v1.0 • February 2026**
**Author: Antigravity AI**
