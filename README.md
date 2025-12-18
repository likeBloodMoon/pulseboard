# Pulseboard (WIP)

Pulseboard is a self-hosted device monitoring and remote diagnostics dashboard: a real-time web UI backed by a lightweight Windows/PowerShell agent that reports health metrics and runs a small set of safe, allowlisted diagnostics.

> **Disclaimer**  
> These tools are provided **as-is**. I am not liable for any system issues or damages resulting from their use.

## Status

- Work in progress; not production-ready.

## What's Working So Far

- Dashboard UI for a fleet of devices (online/offline, last seen, quick status)
- Device enrollment flow using per-device agent tokens
- Live updates to the UI via Server-Sent Events (SSE)
- Metrics collection + history (CPU, RAM, Disk, Network)
- Temperature telemetry support (CPU/GPU/board + sensor list, where available)

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
[ SQLite(not yet in 1.0) ]
            |
            v
[ Next.js Dashboard UI ]  <-- SSE for live updates
```

## Screenshots

<img width="1857" height="928" alt="image" src="https://github.com/user-attachments/assets/1791ea7d-1dcc-40d3-95be-516cb339f67b" />
<img width="1279" height="876" alt="image" src="https://github.com/user-attachments/assets/a9f11e9f-66df-4aa2-a073-0e376dd6b6b8" />
<img width="1106" height="920" alt="image" src="https://github.com/user-attachments/assets/d7a4a103-e629-4d99-8b9b-a1d93d272bd9" />

Create credentials for `.env.local`:

1) Pick a username (stored as `PULSEBOARD_ADMIN_USER`)
2) Generate a bcrypt password hash (stored as `PULSEBOARD_ADMIN_PASS_HASH`)
3) Generate a random session secret (stored as `PULSEBOARD_SESSION_SECRET`)

Generate a bcrypt hash (stored as `b64:...` to avoid `$...` expansion issues in dotenv tooling):

```bash
node -e "require('bcrypt').hash(process.argv[1], 10).then(h=>console.log('b64:'+Buffer.from(h).toString('base64')))" "your-password-here"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example `apps/web/.env.local`:

```bash
PULSEBOARD_ADMIN_USER=admin
PULSEBOARD_ADMIN_PASS_HASH=b64:PASTE_OUTPUT_FROM_BCRYPT_COMMAND
PULSEBOARD_SESSION_SECRET=PASTE_OUTPUT_FROM_SECRET_COMMAND
```


## Tech Stack (Current)

- Frontend: Next.js (App Router), TypeScript
- Backend: Next.js route handlers (API), SSE, Prisma
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
