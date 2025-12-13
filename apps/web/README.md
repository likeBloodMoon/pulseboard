## Pulseboard Web

Next.js (App Router, TypeScript) dashboard that receives metrics directly from the agent's heartbeat endpoint and renders live telemetry.

### Run

From repo root:

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Configure agent -> web

- Set `baseUrl` in `dist/agent.config.json` (or `packages/agent/agent.config.json` if running from source) to the web server address, e.g. `http://localhost:3000`.
- Start the agent; it will POST heartbeats to `/api/agent/heartbeat`. The UI listens via SSE (`/api/events`) and falls back to polling `/api/metrics`.
- If using HTTPS with a self-signed cert, launch the agent with `-SkipCertificateValidation` or set `"skipCertificateValidation": true`.

### Device enrollment (stub)

- POST `/api/devices` with `{ "name": "Office PC" }` to get a `deviceId` and `token`. Add both to the agent config.
- GET `/api/devices` returns device list with online/offline (based on recent heartbeats).
- Heartbeats require a token; unknown devices will auto-provision if the token is supplied, otherwise they are rejected with 401.

### UI

- Hero + stat cards for CPU, memory, disk with color-coded states
- Recent samples table (live feed)
- Process count summary
- Temperature (best-effort) readings: CPU/GPU/board when sensors are available
