# Deployment & Operations Guide: SmartTrading-V2

## 🚀 Live Access & URLs
- **Live Public Access URL:** [/preview/prod-smarttrading-v2-9a6089/](/preview/prod-smarttrading-v2-9a6089/)
- **Internal Port:** `0`
- **Runtime Engine:** `python_preview`
- **Deployment Status:** `DEPLOYED / ACTIVE`
- **Timestamp:** `2026-09-19T22:58:42.275357+00:00`

## 🛠️ Management & Service Control
### Launch Command
```bash
python3 app.py --port 0
```

### Health Check Probe
```bash
curl -I http://127.0.0.1:0/
```

### Systemd Service Template
```ini
[Unit]
Description=SmartTrading-V2 Service
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/nexus-agent-graph/workspaces/prod-smarttrading-v2-9a6089
ExecStart=/usr/bin/python3 /root/nexus-agent-graph/workspaces/prod-smarttrading-v2-9a6089/app.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

## 🔒 Production Security Protocols
- HTTP-only reverse proxy via Nexus Gateway.
- Dedicated port allocation with zero port conflict.
