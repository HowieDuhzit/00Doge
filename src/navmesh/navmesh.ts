/**
 * Grid-based navmesh for AI pathfinding.
 * Built from level schema (rooms, doors, props). Supports A* pathfinding and
 * dynamic unblocking when destructibles are destroyed.
 */

import type { LevelSchema, RoomDef, DoorDef, PropDef } from '../levels/level-schema';

const CELL_SIZE = 0.5;
const PROP_BLOCK_RADIUS = 0.6; // Crates/barrels block cells within this radius
const DOOR_CLEAR_MARGIN = 0.3; // Extra walkable margin around doors for connectivity

interface GridCell {
  walkable: boolean;
  /** When true, blocked by a destructible prop (can be unblocked) */
  propBlocked?: boolean;
}

interface PathNode {
  gx: number;
  gz: number;
  g: number;
  h: number;
  f: number;
  parent: PathNode | null;
}

export interface PathPoint {
  x: number;
  z: number;
}

export class NavMesh {
  private grid: Map<string, GridCell> = new Map();
  private minX = 0;
  private maxX = 0;
  private minZ = 0;
  private maxZ = 0;
  private cellSize = CELL_SIZE;

  /** Build navmesh from level schema. Call after level is loaded. */
  build(level: LevelSchema): void {
    this.grid.clear();

    // Compute bounds from rooms
    let first = true;
    for (const room of level.rooms) {
      const hw = room.width / 2;
      const hd = room.depth / 2;
      const rxMin = room.x - hw;
      const rxMax = room.x + hw;
      const rzMin = room.z - hd;
      const rzMax = room.z + hd;
      if (first) {
        this.minX = rxMin;
        this.maxX = rxMax;
        this.minZ = rzMin;
        this.maxZ = rzMax;
        first = false;
      } else {
        this.minX = Math.min(this.minX, rxMin);
        this.maxX = Math.max(this.maxX, rxMax);
        this.minZ = Math.min(this.minZ, rzMin);
        this.maxZ = Math.max(this.maxZ, rzMax);
      }
    }

    // Add padding for safety
    const pad = 2;
    this.minX -= pad;
    this.maxX += pad;
    this.minZ -= pad;
    this.maxZ += pad;

    // Mark all rooms as walkable (floor areas)
    for (const room of level.rooms) {
      this.markRoomWalkable(room);
    }

    // Ensure door openings are walkable (connectivity between rooms)
    for (const door of level.doors) {
      this.markDoorWalkable(door);
    }

    // Block prop positions
    if (level.props) {
      for (const prop of level.props) {
        this.blockProp(prop);
      }
    }
  }

  private key(gx: number, gz: number): string {
    return `${gx},${gz}`;
  }

  private worldToGrid(x: number, z: number): { gx: number; gz: number } {
    const gx = Math.floor((x - this.minX) / this.cellSize);
    const gz = Math.floor((z - this.minZ) / this.cellSize);
    return { gx, gz };
  }

  private gridToWorld(gx: number, gz: number): { x: number; z: number } {
    const x = this.minX + (gx + 0.5) * this.cellSize;
    const z = this.minZ + (gz + 0.5) * this.cellSize;
    return { x, z };
  }

  private getCell(gx: number, gz: number): GridCell | undefined {
    return this.grid.get(this.key(gx, gz));
  }

  private setCell(gx: number, gz: number, cell: GridCell): void {
    this.grid.set(this.key(gx, gz), cell);
  }

  private isWalkable(gx: number, gz: number): boolean {
    const cell = this.getCell(gx, gz);
    return cell?.walkable === true;
  }

  private markRoomWalkable(room: RoomDef): void {
    const hw = room.width / 2;
    const hd = room.depth / 2;
    const xMin = room.x - hw;
    const xMax = room.x + hw;
    const zMin = room.z - hd;
    const zMax = room.z + hd;

    const { gx: gx0, gz: gz0 } = this.worldToGrid(xMin, zMin);
    const { gx: gx1, gz: gz1 } = this.worldToGrid(xMax, zMax);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const { x, z } = this.gridToWorld(gx, gz);
        if (x >= xMin && x <= xMax && z >= zMin && z <= zMax) {
          const existing = this.getCell(gx, gz);
          if (!existing?.propBlocked) {
            this.setCell(gx, gz, { walkable: true });
          }
        }
      }
    }
  }

  private markDoorWalkable(door: DoorDef): void {
    const halfW = door.width / 2 + DOOR_CLEAR_MARGIN;
    const xMin = door.x - halfW;
    const xMax = door.x + halfW;
    const zMin = door.z - halfW;
    const zMax = door.z + halfW;

    const { gx: gx0, gz: gz0 } = this.worldToGrid(xMin, zMin);
    const { gx: gx1, gz: gz1 } = this.worldToGrid(xMax, zMax);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const { x, z } = this.gridToWorld(gx, gz);
        if (x >= xMin && x <= xMax && z >= zMin && z <= zMax) {
          this.setCell(gx, gz, { walkable: true });
        }
      }
    }
  }

  private blockProp(prop: PropDef): void {
    const scale = prop.scale ?? 1;
    const radius = PROP_BLOCK_RADIUS * scale;
    const xMin = prop.x - radius;
    const xMax = prop.x + radius;
    const zMin = prop.z - radius;
    const zMax = prop.z + radius;

    const { gx: gx0, gz: gz0 } = this.worldToGrid(xMin, zMin);
    const { gx: gx1, gz: gz1 } = this.worldToGrid(xMax, zMax);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const { x, z } = this.gridToWorld(gx, gz);
        const dx = x - prop.x;
        const dz = z - prop.z;
        if (dx * dx + dz * dz <= radius * radius) {
          this.setCell(gx, gz, { walkable: false, propBlocked: true });
        }
      }
    }
  }

  /**
   * Unblock cells at the given position (e.g. when a destructible prop is destroyed).
   */
  unblockAt(x: number, z: number, radius = PROP_BLOCK_RADIUS): void {
    const xMin = x - radius;
    const xMax = x + radius;
    const zMin = z - radius;
    const zMax = z + radius;

    const { gx: gx0, gz: gz0 } = this.worldToGrid(xMin, zMin);
    const { gx: gx1, gz: gz1 } = this.worldToGrid(xMax, zMax);

    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const cell = this.getCell(gx, gz);
        if (cell?.propBlocked) {
          const { x: wx, z: wz } = this.gridToWorld(gx, gz);
          const dx = wx - x;
          const dz = wz - z;
          if (dx * dx + dz * dz <= radius * radius) {
            this.setCell(gx, gz, { walkable: true });
          }
        }
      }
    }
  }

  /**
   * Find nearest walkable cell to the given world position.
   */
  nearestWalkable(x: number, z: number): { x: number; z: number } | null {
    const { gx: startGx, gz: startGz } = this.worldToGrid(x, z);
    if (this.isWalkable(startGx, startGz)) {
      return { x, z };
    }

    const maxRadius = 20;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dgx = -r; dgx <= r; dgx++) {
        for (let dgz = -r; dgz <= r; dgz++) {
          if (Math.abs(dgx) !== r && Math.abs(dgz) !== r) continue;
          const gx = startGx + dgx;
          const gz = startGz + dgz;
          if (this.isWalkable(gx, gz)) {
            const { x: wx, z: wz } = this.gridToWorld(gx, gz);
            return { x: wx, z: wz };
          }
        }
      }
    }
    return null;
  }

  /**
   * Find path from (fromX, fromZ) to (toX, toZ). Returns array of waypoints or empty if no path.
   */
  findPath(fromX: number, fromZ: number, toX: number, toZ: number): PathPoint[] {
    const start = this.nearestWalkable(fromX, fromZ);
    const end = this.nearestWalkable(toX, toZ);
    if (!start || !end) return [];

    const { gx: startGx, gz: startGz } = this.worldToGrid(start.x, start.z);
    const { gx: endGx, gz: endGz } = this.worldToGrid(end.x, end.z);

    if (startGx === endGx && startGz === endGz) {
      return [end];
    }

    const open = new Map<string, PathNode>();
    const closed = new Set<string>();

    const startNode: PathNode = {
      gx: startGx,
      gz: startGz,
      g: 0,
      h: this.heuristic(startGx, startGz, endGx, endGz),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    open.set(this.key(startGx, startGz), startNode);

    const dirs = [
      [0, -1], [1, 0], [0, 1], [-1, 0],
      [1, -1], [1, 1], [-1, 1], [-1, -1],
    ];
    const diagCost = Math.SQRT2;

    while (open.size > 0) {
      let current: PathNode | null = null;
      let bestF = Infinity;
      for (const n of open.values()) {
        if (n.f < bestF) {
          bestF = n.f;
          current = n;
        }
      }
      if (!current) break;

      const ckey = this.key(current.gx, current.gz);
      open.delete(ckey);
      closed.add(ckey);

      if (current.gx === endGx && current.gz === endGz) {
        return this.reconstructPath(current);
      }

      for (let i = 0; i < dirs.length; i++) {
        const [dx, dz] = dirs[i];
        const ngx = current.gx + dx;
        const ngz = current.gz + dz;
        const nkey = this.key(ngx, ngz);
        if (closed.has(nkey)) continue;
        if (!this.isWalkable(ngx, ngz)) continue;

        const cost = i < 4 ? 1 : diagCost;
        const g = current.g + cost;
        let neighbor = open.get(nkey);
        if (!neighbor) {
          neighbor = {
            gx: ngx,
            gz: ngz,
            g,
            h: this.heuristic(ngx, ngz, endGx, endGz),
            f: 0,
            parent: current,
          };
          neighbor.f = neighbor.g + neighbor.h;
          open.set(nkey, neighbor);
        } else if (g < neighbor.g) {
          neighbor.g = g;
          neighbor.f = neighbor.g + neighbor.h;
          neighbor.parent = current;
        }
      }
    }

    return [];
  }

  private heuristic(gx: number, gz: number, endGx: number, endGz: number): number {
    const dx = Math.abs(endGx - gx);
    const dz = Math.abs(endGz - gz);
    return Math.sqrt(dx * dx + dz * dz);
  }

  private reconstructPath(node: PathNode): PathPoint[] {
    const path: PathPoint[] = [];
    let n: PathNode | null = node;
    while (n) {
      const { x, z } = this.gridToWorld(n.gx, n.gz);
      path.unshift({ x, z });
      n = n.parent;
    }
    return this.simplifyPath(path);
  }

  /** Remove redundant waypoints (collinear points) for smoother movement. */
  private simplifyPath(path: PathPoint[]): PathPoint[] {
    if (path.length <= 2) return path;
    const out: PathPoint[] = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = path[i - 1];
      const curr = path[i];
      const next = path[i + 1];
      const dx1 = curr.x - prev.x;
      const dz1 = curr.z - prev.z;
      const dx2 = next.x - curr.x;
      const dz2 = next.z - curr.z;
      const cross = dx1 * dz2 - dz1 * dx2;
      if (Math.abs(cross) > 0.01) {
        out.push(curr);
      }
    }
    out.push(path[path.length - 1]);
    return out;
  }

  /** Check if the navmesh has been built (has any walkable cells). */
  get isBuilt(): boolean {
    return this.grid.size > 0;
  }
}
