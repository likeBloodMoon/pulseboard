# Pulseboard (WIP)

Pulseboard is a self-hosted device monitoring dashboard: a Next.js UI + API with a lightweight Windows/PowerShell agent that reports health metrics and runs a small allowlisted set of diagnostics.

Note: this is a personal/WIP project and not production-ready. Use at your own risk.

## Features

- Fleet dashboard (online/offline, last seen)
- Live updates via SSE + polling fallback
- Metrics + history (CPU/RAM/Disk/Network)
- Temperature telemetry (best-effort; depends on sensors/permissions)
- Local-only admin login (single account, no DB, no OAuth)

## Safety model (agent)

- No arbitrary command execution / no free-form scripts
- Jobs are allowlisted and validated server-side
- Agent talks only to the Pulseboard API

## Screenshots

<img width="1857" height="928" alt="Pulseboard dashboard" src="https://github.com/user-attachments/assets/1791ea7d-1dcc-40d3-95be-516cb339f67b" />
<img width="1797" height="916" alt="Pulseboard device view" src="https://github.com/user-attachments/assets/2479231a-5d9e-43ee-b0bd-e09eaf1bb528" />

## Quickstart (local)

From the repo root:

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in at `/login`.

## Create admin creds (`apps/web/.env.local`)

1) Choose a username (`PULSEBOARD_ADMIN_USER`)
2) Generate a bcrypt hash (`PULSEBOARD_ADMIN_PASS_HASH`)
3) Generate a random session secret (`PULSEBOARD_SESSION_SECRET`)

Generate a bcrypt hash (stored as `b64:...` to avoid `$...` expansion issues in dotenv tooling):

```bash
node -e "require('bcrypt').hash(process.argv[1], 10).then(h=>console.log('b64:'+Buffer.from(h).toString('base64')))" "your-password-here"
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example `apps/web/.env.local`:

```bash
PULSEBOARD_ADMIN_USER=admin
PULSEBOARD_ADMIN_PASS_HASH=b64:PASTE_OUTPUT_FROM_BCRYPT_COMMAND
PULSEBOARD_SESSION_SECRET=PASTE_OUTPUT_FROM_SECRET_COMMAND
```

## Agent setup (bundle)

- Set the web server URL in `dist/agent.config.json` (or `agent.config.json`) and start the agent.
- The agent POSTs heartbeats to `/api/agent/heartbeat`; the UI listens via `/api/events`.

## Author

Kristof (likeBloodMoon)
