#!/bin/sh
# One-time setup of a fresh Ubuntu 24.04 (arm64) instance: Docker, swap, the daily demo reset.
# Run on the server as the ubuntu user: sh setup.sh
set -eu

sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker "$USER"

# 1 GB of RAM is enough for the demo, with swap as a safety margin.
if [ ! -f /swapfile ]; then
  sudo fallocate -l 1G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi

mkdir -p "$HOME/tally"

# Every day at 04:00 UTC: a fresh app container, which resets the demo database and samples.
( crontab -l 2>/dev/null | grep -v 'tally' || true
  echo "0 4 * * * cd $HOME/tally && docker compose up -d --force-recreate app >/dev/null 2>&1"
) | crontab -

echo "Done. Log out and back in so the docker group applies."
