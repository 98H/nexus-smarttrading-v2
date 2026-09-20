# Deployment & Operations Guide: SmartTrading-V2

## 🚀 Live Access URLs
- **Public Preview URL:** [https://river-alternatives-isolated-parker.trycloudflare.com/preview/prod-smarttrading-v2-9a6089/](https://river-alternatives-isolated-parker.trycloudflare.com/preview/prod-smarttrading-v2-9a6089/)
- **Local Gateway Path:** [/preview/prod-smarttrading-v2-9a6089/](/preview/prod-smarttrading-v2-9a6089/)
- **Internal Port:** `8100`
- **Process PID:** `948374`
- **Runtime Engine:** `nodejs_server`
- **Health Status:** `HEALTHY (HTTP 200)`
- **Deployed Timestamp:** `2026-09-20T14:13:20.199915+00:00`

## 📋 Execution Command
```bash
node server/index.js 8100
```

## 🩺 Health Check Verification
```bash
curl -I http://127.0.0.1:8100/
```

## 🔍 Headless Browser Verification
- **DOM Title:** `SmartTrading-V2`
- **Has Canvas:** `True`
- **Interactive Elements:** `True`
- **Console Errors:** `1`

## 📜 Live Deployment Logs
Logs are stored at `/root/nexus-agent-graph/workspaces/prod-smarttrading-v2-9a6089/logs/deploy.log`.
