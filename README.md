# 007 Remix

A browser-based multiplayer first-person shooter inspired by GoldenEye 007, built with Three.js, Rapier3D physics, and Socket.IO for real-time multiplayer.

## 🎮 Features

- **Real-time Multiplayer**: 20Hz state sync with authoritative server validation
- **Classic Weapons**: Pistol, Rifle, Shotgun, Sniper with realistic ballistics
- **Destructible Environment**: Exploding barrels, breakable crates
- **Game Modes**: Deathmatch (first to 25 kills)
- **Procedural Graphics**: All textures and models generated at runtime
- **Anti-cheat**: Server-side movement and fire rate validation

## 🚀 Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Start development client (Vite)
npm run dev

# Start multiplayer server (Socket.IO) - in another terminal
npm run server
```

Visit `http://localhost:5173` and click "Multiplayer" to play!

### Production Deployment

See **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** for deploying to Coolify/Docker.

## 📚 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Architecture guide for AI assistants
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Full deployment guide
- **[DEPLOYMENT_QUICKSTART.md](./DEPLOYMENT_QUICKSTART.md)** - Quick Coolify setup
- **[NORMAL_MAPPING_STANDARDS.md](./docs/NORMAL_MAPPING_STANDARDS.md)** - Required normal-mapping policy for textures, levels, and weapons
- **[OUTDOOR_LEVELS_SETUP.md](./docs/OUTDOOR_LEVELS_SETUP.md)** - Setting up outdoor maps (skybox, HDRI, day/night, terrain, enemies)

## 🐳 Docker

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

## ONCE Local Deployment

This app is ONCE-compatible as a single Docker container. The production server serves the Vite app, Socket.IO multiplayer, and `/up` healthcheck on container port `80`.

```bash
# Build the local ONCE image
npm run image:build

# First local install through ONCE
npm run once:deploy

# Later updates after rebuilding the image
npm run once:update
```

The default local hostname is `007remix.localhost`. The `once:deploy` script uses `--disable-tls`, which is intended for local-only testing. For LAN or public deployment, point DNS at the machine running ONCE and deploy with your real hostname instead.

The app does not require project-specific environment variables for local ONCE deployment. Optional overrides:

```bash
once deploy 007remix:local --host game.example.com --env PORT=80 --env STORAGE_PATH=/storage
```

Persistent data lives under `/storage`. Map editor saves are written to `/storage/maps/...` and override the bundled map defaults. Back up local data with:

```bash
once backup 007remix.localhost 007remix-backup.tar.gz
```

## 🛠️ Tech Stack

- **Frontend**: Three.js, Vite, TypeScript
- **Physics**: Rapier3D (WASM)
- **Multiplayer**: Socket.IO
- **Server**: Node.js, Express
- **Deployment**: Docker, Coolify, GitHub Actions
