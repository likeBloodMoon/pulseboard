# Pulseboard – Long-Term Vision

Pulseboard is designed to evolve from a developer-friendly project into a
**simple, self-contained system monitoring product** suitable for real-world use.

The focus is not on feature quantity, but on **clarity, reliability, and thoughtful system design**.

---

## Simplified Runtime Architecture

A core long-term goal is to eliminate external runtime dependencies.

Planned architecture:
- Backend compiled into a **single self-contained binary** (planned in Go)
- Embedded database (**SQLite**) for zero-configuration installs
- No required:
  - Node.js
  - Docker
  - external database servers
- One service, one local web UI, minimal configuration

This allows Pulseboard to be installed with a single download and started immediately.

---

## Planned Platform Features

### Agent Capability Declaration
Agents will declare their capabilities on startup, such as:
- available temperature sources
- supported diagnostics
- privilege level
- optional integrations

The dashboard adapts automatically based on what each agent can provide.

---

### Resource Budgets
Per-device soft limits for system resources:
- CPU usage thresholds
- memory pressure indicators
- disk space warnings

Budgets are initially visual indicators rather than alerts, keeping the system lightweight.

---

### Data Retention Controls
Configurable retention policies for:
- metrics history
- diagnostic logs
- agent events

This keeps storage usage predictable and reflects real operational needs.

---

### Remote Diagnostics Timeline
Each device maintains a timeline of significant events:
- agent online/offline transitions
- diagnostics executions
- network failures
- reboots or metric anomalies

This provides context and history instead of isolated data points.

---

### Agent Self-Health Metrics
Agents report their own operational health:
- execution duration
- error counts
- memory usage
- last successful run time

This helps distinguish between system issues and agent failures.

---

### Device Comparison View
Side-by-side comparison of multiple devices:
- CPU, memory, and disk usage
- historical trends
- diagnostic results

Useful for troubleshooting and capacity analysis.

---

### Read-Only Share Links
Generate expiring, read-only links for:
- device overview pages
- diagnostic reports

This enables safe sharing without granting control access.

---

## Network-First Deployment Model

### LAN Auto-Discovery
Pulseboard follows a local-network-first approach:
- One PC acts as the server
- Other machines discover it automatically on the LAN
- No cloud service is required

Discovery mechanisms may include mDNS or lightweight local broadcasts.

---

### Adjustable Server Role
- Any Pulseboard installation can act as the server
- The active server can be changed from the dashboard
- Agents automatically reconnect when the server role changes

This keeps the system flexible while maintaining a simple setup process.

---

## Design Philosophy

Pulseboard prioritizes:
- security-aware defaults
- optional integrations over bundled drivers
- predictable behavior over hidden magic
- simplicity in installation and operation

The goal is a monitoring tool that feels practical, transparent,
and trustworthy in real environments.
