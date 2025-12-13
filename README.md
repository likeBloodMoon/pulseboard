# Pulseboard (WIP)

Pulseboard is a self-hosted device monitoring and remote diagnostics dashboard: a real-time web UI backed by a lightweight Windows/PowerShell agent that reports health metrics and runs a small set of safe, allowlisted diagnostics.

## Status

- Work in progress; not production-ready.

## What's Working So Far

- Dashboard UI for a fleet of devices (online/offline, last seen, quick status)
- Authentication with basic roles (Admin / Viewer)
- Device enrollment flow using per-device agent tokens
- Live updates to the UI via Server-Sent Events (SSE)
- Metrics collection + history (CPU, RAM, Disk, Network)
- Temperature telemetry support (CPU/GPU/board + sensor list, where available)
- Remote diagnostics as "jobs" (network checks, system snapshot) with logs + stored results
- Postgres-backed persistence for devices, metrics, and jobs

## Safety Model (Agent)

The agent does not execute arbitrary commands or accept free-form scripts.


- Jobs are allowlisted and validated server-side
- Each agent token is scoped to one device and stored hashed on the server
- Transport is HTTPS; the agent only talks to the Pulseboard API

## Architecture (High Level)

```
[ Windows Agent (PowerShell) ]
            |
            | HTTPS: heartbeat, metrics, job results
            v
[ Next.js API / Backend ]
            |
            v
[ Postgres ]
            |
            v
[ Next.js Dashboard UI ]  <-- SSE for live updates
```

## Screenshots

![image](https://github.com/user-attachments/assets/7cb0fc01-e7ec-4ff6-af8e-8bd0eb020767)
<img width="1108" height="906" alt="image" src="https://github.com/user-attachments/assets/ff0ca1d4-32b6-4dca-9619-eb68afe4efec" />
<img width="1106" height="920" alt="image" src="https://github.com/user-attachments/assets/d7a4a103-e629-4d99-8b9b-a1d93d272bd9" />


## Tech Stack (Current)

- Frontend: Next.js (App Router), TypeScript
- Backend: Next.js route handlers (API), SSE, Prisma
- Database: PostgreSQL
- Auth: per-device agent tokens (hashed) (UI auth is planned)
- Agent: PowerShell 7 (foreground or scheduled task)

## Quickstart (Local)

1. Create a Postgres database and set `DATABASE_URL` (see `apps/web/.env.example`).
2. Install + sync schema:
   - `npm install`
   - `npm --workspace apps/web run db:push`
3. Run the web app: `npm run dev` (http://localhost:3000)

## Temperature Telemetry Notes

- Preferred source is LibreHardwareMonitor (when present); otherwise temps may be unavailable depending on hardware/permissions.
- Obviously bad readings are ignored (e.g., <5 C or >120 C).

## Roadmap

- Alerts/thresholds + notifications
- Tags and better device filtering
- Public demo mode (mock data)
- More agent packaging options (service installer, cross-platform agent exploration)
- Multi-user/org support

## Author

Kristof (likeBloodMoon)
