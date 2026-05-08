# SchoolMaster AI — Production Deployment

## Quick Start on VPS

```bash
# 1. Clone project
git clone https://github.com/YOUR_USERNAME/schoolmaster-ai.git
cd schoolmaster-ai

# 2. Copy and fill environment variables
cp .env.example .env
nano .env        # fill all values

# 3. Launch everything
docker compose up -d --build

# 4. Check status
docker compose ps
docker compose logs -f api
```

## URLs
- Admin Dashboard: https://s.monadim.online/admin
- TMA Frontend:    https://s.monadim.online/tma
- API Health:      https://s.monadim.online/health

## Update
```bash
git pull
docker compose up -d --build
```
