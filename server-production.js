/**
 * Production server for 007 Remix.
 * Serves the Vite build and Socket.IO game server from one HTTP origin.
 */

import { createServer } from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { Server as SocketIOServer } from 'socket.io';

const { GameRoom } = await import('./server/dist/server/game-room.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 80;
const STORAGE_PATH = process.env.STORAGE_PATH || '/storage';
const DIST_PATH = path.join(__dirname, 'dist');
const STORAGE_MAPS_PATH = path.join(STORAGE_PATH, 'maps');
const VALID_MAP_IDS = ['crossfire', 'wasteland', 'custom'];
const MAP_ID_TO_FOLDER = {
  custom: 'quickplay',
  crossfire: 'crossfire',
  wasteland: 'wasteland',
};
const ROOM_PREFIX = 'map:';

class ProductionGameServer {
  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });
    this.gameRooms = new Map();
    this.socketToMapId = new Map();

    this.setupHttpHandlers();
    this.setupSocketHandlers();
  }

  setupHttpHandlers() {
    this.app.use(express.json({ limit: '1mb' }));

    this.app.get('/up', (_req, res) => {
      res.status(200).json({ ok: true });
    });

    this.app.use((_req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    this.app.options('/api/maps/:mapId/config', (_req, res) => res.sendStatus(204));
    this.app.post('/api/maps/:mapId/config', (req, res) => this.handleSaveMapConfig(req, res));

    // Persisted map edits override bundled defaults; bundled assets remain the fallback.
    this.app.use('/maps', express.static(STORAGE_MAPS_PATH));
    this.app.use(express.static(DIST_PATH));

    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(DIST_PATH, 'index.html'));
    });
  }

  async handleSaveMapConfig(req, res) {
    const mapId = req.params.mapId;
    if (!VALID_MAP_IDS.includes(mapId)) {
      res.status(400).json({ ok: false, error: `Invalid mapId: ${mapId}` });
      return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ ok: false, error: 'Invalid JSON body' });
      return;
    }

    const folder = MAP_ID_TO_FOLDER[mapId];
    const mapDir = path.join(STORAGE_MAPS_PATH, folder);
    const configPath = path.join(mapDir, 'config.json');

    try {
      await mkdir(mapDir, { recursive: true });
    } catch (err) {
      console.error('[Server] Failed to create map dir:', err);
      res.status(500).json({ ok: false, error: 'Failed to create directory' });
      return;
    }

    let existing = {};
    try {
      const raw = await readFile(configPath, 'utf-8');
      existing = JSON.parse(raw);
    } catch {
      // File missing or invalid - start fresh.
    }

    const merged = { ...existing };
    if ('pickups' in body) merged.pickups = Array.isArray(body.pickups) ? body.pickups : [];
    if ('props' in body) merged.props = Array.isArray(body.props) ? body.props : [];
    if ('labProps' in body) merged.labProps = Array.isArray(body.labProps) ? body.labProps : [];

    try {
      await writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8');
      console.log(`[Server] Wrote config to ${configPath}`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Server] Failed to write config:', err);
      res.status(500).json({ ok: false, error: 'Failed to write config' });
    }
  }

  roomName(mapId) {
    return ROOM_PREFIX + mapId;
  }

  getOrCreateRoom(mapId) {
    let room = this.gameRooms.get(mapId);
    if (!room) {
      room = new GameRoom();
      const roomName = this.roomName(mapId);
      room.onBroadcast = (eventName, data) => {
        this.io.to(roomName).emit(eventName, data);
      };
      this.gameRooms.set(mapId, room);
      console.log(`[Server] Created room for map: ${mapId} (${roomName})`);
    }
    return room;
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`[Server] Client connected: ${socket.id}`);

      socket.on('player:connected', (data) => {
        const mapId = VALID_MAP_IDS.includes(data?.mapId) ? data.mapId : 'crossfire';
        const roomName = this.roomName(mapId);
        this.socketToMapId.set(socket.id, mapId);
        socket.join(roomName);

        const gameRoom = this.getOrCreateRoom(mapId);
        gameRoom.addPlayer(socket.id, data?.username, mapId);

        console.log(`[Server] ${data?.username} joined ${mapId} (room: ${roomName})`);
        this.io.to(roomName).emit('player:connected', {
          playerId: socket.id,
          username: data?.username,
        });
      });

      socket.on('player:state:update', (state) => this.withSocketRoom(socket.id, (room) => room.updatePlayerState(socket.id, state)));
      socket.on('weapon:fire', (event) => this.withSocketRoom(socket.id, (room) => room.handleWeaponFire(event)));
      socket.on('grenade:throw', (event) => this.withSocketRoom(socket.id, (room) => room.handleGrenadeThrow(event)));
      socket.on('grenade:explosion', (event) => this.withSocketRoom(socket.id, (room) => room.handleGrenadeExplosion(event)));
      socket.on('player:gas:damage', (event) => this.withSocketRoom(socket.id, (room) => room.handleGasDamage(socket.id, event)));
      socket.on('player:enemy:damage', (event) => this.withSocketRoom(socket.id, (room) => room.handleEnemyDamage(socket.id, event)));
      socket.on('flashlight:toggle', (event) => this.withSocketRoom(socket.id, (room) => room.handleFlashlightToggle(event)));
      socket.on('destructible:destroyed', (event) => this.withSocketRoom(socket.id, (room) => room.handleDestructibleDestroyed(event)));

      socket.on('disconnect', () => this.handleDisconnect(socket.id));
    });
  }

  withSocketRoom(socketId, callback) {
    const mapId = this.socketToMapId.get(socketId);
    if (!mapId) return;

    const room = this.gameRooms.get(mapId);
    if (room) callback(room, mapId);
  }

  handleDisconnect(socketId) {
    const mapId = this.socketToMapId.get(socketId);
    if (mapId) {
      const room = this.gameRooms.get(mapId);
      room?.removePlayer(socketId);
      this.io.to(this.roomName(mapId)).emit('player:disconnected', { playerId: socketId });
      this.socketToMapId.delete(socketId);

      if (room && room.playerCount === 0) {
        room.dispose();
        this.gameRooms.delete(mapId);
        console.log(`[Server] Disposed empty room: ${mapId}`);
      }
    }
    console.log(`[Server] Client disconnected: ${socketId}`);
  }

  start() {
    this.httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`[Production Server] Running on port ${PORT}`);
      console.log(`[Production Server] Serving static files from ${DIST_PATH}`);
      console.log(`[Production Server] Persistent storage at ${STORAGE_PATH}`);
      console.log('[Production Server] Socket.IO game server ready');
    });
  }

  stop() {
    for (const room of this.gameRooms.values()) {
      room.dispose();
    }
    this.gameRooms.clear();
    this.socketToMapId.clear();
    this.io.close();
    this.httpServer.close();
  }
}

const server = new ProductionGameServer();
server.start();

process.on('SIGINT', () => {
  console.log('\n[Production Server] Shutting down gracefully...');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Production Server] Shutting down gracefully...');
  server.stop();
  process.exit(0);
});
