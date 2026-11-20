# Real local Traccar QA setup (no fake GPS)

Uses the official Traccar 6.16.0 container with persistent QA volumes. The HTTP UI/API and potential H02 TCP port are bound to **127.0.0.1 only**, to prevent accidental public exposure. The presence of a port does **not** prove ST-906L firmware compatibility.

Requirements: Docker Engine + Docker Compose V2; Node.js 22; a computer where Docker is installed.

```bash
cd tools/traccar-real-qa
docker compose -f compose.yaml config
docker compose -f compose.yaml up -d
docker compose -f compose.yaml ps
```

Open http://127.0.0.1:8082 in a browser, follow Traccar's first-run account setup, and create a **separate QA user**. Never add a password to GitHub. The local default database is for this isolated pilot only; use a production-grade database before any multi-device deployment.

Then on the same host, set private environment variables:

```bash
export TRACCAR_URL=http://127.0.0.1:8082
export TRACCAR_EMAIL='qa@example.invalid'
# Set TRACCAR_PASSWORD securely in your interactive shell (do not paste secrets into chat).
node tools/traccar-real-qa/auth-smoke.mjs
```

To call the script from the repository root, keep the preceding `node` path. Or from this folder use `node auth-smoke.mjs`. Prefer credentials stored locally or a managed secret store; avoid printing them or saving them in shell history. On success, authentication PASS may show zero devices. **No hardware GPS claim is made**. An expired/wrong token or password must fail.

The subsequent `smoke.mjs` requires actual valid device position fixes and is NOT runnable as a hardware PASS until an ST-906L device with SIM has connected.

Do not publicly expose TCP/5013 or HTTP/8082. Public H02 access will require a separate hardened host, firewall and compatible firmware check. For externally reachable API, use HTTPS and network restrictions.

Official documentation: https://www.traccar.org/docker/ and https://www.traccar.org/traccar-api/
