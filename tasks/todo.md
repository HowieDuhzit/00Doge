# ONCE Deployment Setup

## Plan

- [x] Inspect package scripts, existing Docker/Coolify deployment files, server ports, and production runtime.
- [x] Make the production container ONCE-compatible: HTTP on port 80, `/up` healthcheck, `/storage` directory.
- [x] Keep existing Docker/Coolify behavior usable while adding ONCE-specific commands.
- [x] Document first deploy, repeat deploy, hostname, TLS, env vars, and persistent storage.
- [x] Verify with a Docker image build and container healthcheck smoke test.

## Review

- `npm run build` passed.
- `docker build -t 007remix:local .` passed.
- Temporary container on host port `8080` returned `{"ok":true}` from `/up`.
- Temporary container accepted `POST /api/maps/custom/config` and served the saved config from `/maps/quickplay/config.json`, confirming `/storage` overlay behavior.
- `docker compose config` passed and resolves the service to internal port `80` with `/up` healthcheck.
- ONCE CLI is installed at `/usr/local/bin/once`; `once version` returned `v0.1.10`.
