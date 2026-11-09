# Deploying the demo

The public demo runs on one small AWS EC2 instance with Docker Compose: the app image, Postgres and
Caddy (HTTPS). Why one instance and not managed services: [DECISIONS.md](DECISIONS.md).

```
visitor ──HTTPS──▶ Caddy :443 ──▶ app :3000 (API + web app, demo mode) ──▶ Postgres
                                   image: ghcr.io/dannyboyil/tally, built by CI
```

**Cost:** about $11/month in us-east-1: t4g.micro ~$6, public IPv4 ~$3.65, 10 GB disk ~$0.80.
Stopping the instance stops the compute charge (the IP and disk still cost ~$4.50).

## Demo behaviour

- Starts with a clean database and four sample documents, and again every day at 04:00 UTC
  (a cron job recreates the app container).
- Golden-set images, including the "Try a sample" buttons, replay recorded Claude answers: free.
- Any other image is read live by Claude only with `DEMO_ACCESS_CODE`, at most
  `DEMO_LIVE_DAILY_CAP` times a day. Without a code and key the demo is replay-only.
- Writes are rate-limited per visitor (20 a minute).

## One-time setup

### 1. AWS

1. **Billing alarm first:** Billing → Budgets → create a monthly cost budget of $15 with an email
   alert.
2. **EC2 → Launch instance:**
   - Name `tally-demo`; image **Ubuntu Server 24.04 LTS, 64-bit (Arm)**; type **t4g.micro**.
   - Key pair: create one (`tally-demo`, ED25519) and keep the downloaded `.pem` file safe.
   - Network: allow **SSH**, **HTTP** and **HTTPS** from anywhere (SSH is key-only, and CI needs it).
   - Storage: 10 GB gp3.
3. **Elastic IP:** EC2 → Elastic IPs → Allocate → Associate with `tally-demo`. The address stays
   the same across stops, so the hostname and certificate keep working.

### 2. The server

```bash
chmod 600 ~/Downloads/tally-demo.pem
scp -i ~/Downloads/tally-demo.pem deploy/setup.sh ubuntu@<elastic-ip>:
ssh -i ~/Downloads/tally-demo.pem ubuntu@<elastic-ip> 'sh setup.sh'
```

Then copy the compose files and create the server's `.env` from
[deploy/.env.example](../deploy/.env.example):

```bash
scp -i ~/Downloads/tally-demo.pem deploy/compose.yml deploy/Caddyfile ubuntu@<elastic-ip>:tally/
ssh -i ~/Downloads/tally-demo.pem ubuntu@<elastic-ip>
nano tally/.env && chmod 600 tally/.env     # DOMAIN, POSTGRES_PASSWORD, optionally the access code and key
```

Without a domain of your own, `DOMAIN=<ip-with-dashes>.sslip.io` (for 3.120.45.67:
`3-120-45-67.sslip.io`) resolves to the server, and Caddy gets a certificate for it.

### 3. The image

The first push to `main` publishes `ghcr.io/dannyboyil/tally`. GitHub creates the package as
private: on GitHub → your profile → Packages → `tally` → Package settings → change visibility to
**public**, so the server can pull it without credentials.

### 4. Automatic deploys

So that every merge to `main` deploys by itself, in the repository's Settings → Secrets and
variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | the Elastic IP |
| Secret | `DEPLOY_SSH_KEY` | a deploy-only private key (below) |
| Secret | `DEPLOY_KNOWN_HOSTS` | output of `ssh-keyscan -t ed25519 <elastic-ip>` |

A separate key for CI, so the `.pem` never leaves your machine:

```bash
ssh-keygen -t ed25519 -N '' -C tally-deploy -f ~/.ssh/tally-deploy
ssh-copy-id -i ~/.ssh/tally-deploy.pub -o IdentityFile=~/Downloads/tally-demo.pem ubuntu@<elastic-ip>
cat ~/.ssh/tally-deploy        # paste as DEPLOY_SSH_KEY
```

Until `DEPLOY_HOST` is set, the deploy job is skipped. Deploy by hand any time:

```bash
ssh -i ~/Downloads/tally-demo.pem ubuntu@<elastic-ip> 'cd tally && docker compose pull app && docker compose up -d'
```

## Operating it

```bash
docker compose ps                              # on the server, in ~/tally
docker compose logs -f app
docker compose up -d --force-recreate app      # reset the demo now
TAG=<commit sha> docker compose up -d app      # roll back to an earlier release
```
