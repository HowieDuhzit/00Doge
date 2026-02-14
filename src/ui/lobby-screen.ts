/**
 * Lobby UI - Room list, create/join room, username entry.
 * Shown before joining multiplayer. Fallout/Westworld tactical style.
 */
import type { MultiplayerMapId } from '../levels/multiplayer-arena';
import { MULTIPLAYER_MAPS } from '../levels/multiplayer-arena';

export interface LobbyRoom {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
}

export interface LobbyCallbacks {
  onJoin: (username: string, mapId?: MultiplayerMapId) => void;
  onBack: () => void;
}

export class LobbyScreen {
  private container: HTMLDivElement;
  private usernameInput: HTMLInputElement;
  private joinBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private statusEl: HTMLDivElement;
  private roomsList: HTMLDivElement;
  private mapButtons: HTMLButtonElement[] = [];
  private selectedMapId: MultiplayerMapId = 'crossfire';
  private callbacks: LobbyCallbacks | null = null;
  private _visible = false;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'lobby-screen';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(180deg, rgba(10, 12, 16, 0.98) 0%, rgba(5, 6, 8, 0.99) 100%);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #c4b896;
      font-family: 'Courier New', monospace;
      z-index: 15;
    `;

    // Title
    const title = document.createElement('h2');
    title.style.cssText = `
      font-size: 28px;
      letter-spacing: 6px;
      color: #d4af37;
      margin-bottom: 8px;
    `;
    title.textContent = 'MULTIPLAYER LOBBY';
    this.container.appendChild(title);

    const subtitle = document.createElement('p');
    subtitle.style.cssText = 'font-size: 14px; color: #6a5a4a; margin-bottom: 16px;';
    subtitle.textContent = 'Deathmatch · First to 25 kills wins';
    this.container.appendChild(subtitle);

    // Map selector
    const mapLabel = document.createElement('label');
    mapLabel.style.cssText = 'font-size: 12px; color: #8b7355; margin-bottom: 8px; display: block;';
    mapLabel.textContent = 'MAP';
    this.container.appendChild(mapLabel);

    const mapSelector = document.createElement('div');
    mapSelector.style.cssText = 'display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;';
    for (const map of MULTIPLAYER_MAPS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.mapId = map.id;
      btn.style.cssText = `
        padding: 12px 20px;
        font-size: 14px;
        font-family: 'Courier New', monospace;
        letter-spacing: 2px;
        background: rgba(0, 0, 0, 0.5);
        color: #8b7355;
        border: 2px solid #5a4a3a;
        cursor: pointer;
        transition: background 0.2s, color 0.2s, border-color 0.2s;
        text-align: left;
        min-width: 140px;
      `;
      btn.innerHTML = `<strong>${map.name}</strong><br><span style="font-size:11px;color:#6a5a4a;">${map.description}</span>`;
      btn.addEventListener('click', () => this.selectMap(map.id));
      btn.addEventListener('mouseenter', () => {
        if (this.selectedMapId !== map.id) {
          btn.style.borderColor = '#7a6a5a';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (this.selectedMapId !== map.id) {
          btn.style.borderColor = '#5a4a3a';
        }
      });
      mapSelector.appendChild(btn);
      this.mapButtons.push(btn);
    }
    this.container.appendChild(mapSelector);
    this.updateMapSelectionUI();

    // Username input
    const usernameLabel = document.createElement('label');
    usernameLabel.style.cssText = 'font-size: 12px; color: #8b7355; margin-bottom: 6px; display: block;';
    usernameLabel.textContent = 'USERNAME';
    this.container.appendChild(usernameLabel);

    this.usernameInput = document.createElement('input');
    this.usernameInput.type = 'text';
    this.usernameInput.placeholder = 'Enter callsign...';
    this.usernameInput.maxLength = 20;
    this.usernameInput.value = localStorage.getItem('007remix_username') || 'Agent';
    this.usernameInput.style.cssText = `
      width: 280px;
      padding: 12px 16px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      background: rgba(0, 0, 0, 0.5);
      border: 2px solid #5a4a3a;
      color: #c4b896;
      margin-bottom: 24px;
    `;
    this.usernameInput.addEventListener('input', () => {
      localStorage.setItem('007remix_username', this.usernameInput.value);
    });
    this.container.appendChild(this.usernameInput);

    // Room list (placeholder for future multi-room support)
    this.roomsList = document.createElement('div');
    this.roomsList.style.cssText = `
      width: 320px;
      min-height: 80px;
      padding: 16px;
      margin-bottom: 24px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid #5a4a3a;
    `;
    this.container.appendChild(this.roomsList);

    // Status
    this.statusEl = document.createElement('div');
    this.statusEl.style.cssText = 'font-size: 14px; color: #8b7355; margin-bottom: 20px; min-height: 20px;';
    this.container.appendChild(this.statusEl);

    // Buttons
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; gap: 16px;';

    this.joinBtn = document.createElement('button');
    this.joinBtn.textContent = 'JOIN GAME';
    this.joinBtn.style.cssText = `
      padding: 14px 32px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      letter-spacing: 3px;
      background: transparent;
      color: #d4af37;
      border: 2px solid #d4af37;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    this.joinBtn.addEventListener('mouseenter', () => {
      this.joinBtn.style.background = '#d4af37';
      this.joinBtn.style.color = '#000';
    });
    this.joinBtn.addEventListener('mouseleave', () => {
      this.joinBtn.style.background = 'transparent';
      this.joinBtn.style.color = '#d4af37';
    });
    this.joinBtn.addEventListener('click', () => this.handleJoin());
    btnRow.appendChild(this.joinBtn);

    this.backBtn = document.createElement('button');
    this.backBtn.textContent = 'BACK';
    this.backBtn.style.cssText = `
      padding: 14px 32px;
      font-size: 16px;
      font-family: 'Courier New', monospace;
      letter-spacing: 3px;
      background: transparent;
      color: #8b7355;
      border: 2px solid #5a4a3a;
      cursor: pointer;
      transition: background 0.2s, color 0.2s;
    `;
    this.backBtn.addEventListener('click', () => this.callbacks?.onBack());
    btnRow.appendChild(this.backBtn);

    this.container.appendChild(btnRow);

    document.body.appendChild(this.container);
  }

  private selectMap(mapId: MultiplayerMapId): void {
    this.selectedMapId = mapId;
    this.updateMapSelectionUI();
  }

  private updateMapSelectionUI(): void {
    for (const btn of this.mapButtons) {
      const mapId = btn.dataset.mapId as MultiplayerMapId;
      const selected = this.selectedMapId === mapId;
      btn.style.background = selected ? 'rgba(212, 175, 55, 0.15)' : 'rgba(0, 0, 0, 0.5)';
      btn.style.color = selected ? '#d4af37' : '#8b7355';
      btn.style.borderColor = selected ? '#d4af37' : '#5a4a3a';
    }
  }

  private handleJoin(): void {
    const username = this.usernameInput.value.trim() || 'Agent';
    if (username.length < 2) {
      this.setStatus('Username must be at least 2 characters');
      return;
    }
    this.setStatus('Connecting...');
    this.joinBtn.disabled = true;
    this.callbacks?.onJoin(username, this.selectedMapId);
  }

  show(callbacks: LobbyCallbacks, rooms?: LobbyRoom[]): void {
    this.callbacks = callbacks;
    this._visible = true;
    this.container.style.display = 'flex';
    this.joinBtn.disabled = false;
    this.setStatus('');
    this.updateMapSelectionUI();

    // Render rooms (for now single room)
    if (rooms && rooms.length > 0) {
      this.roomsList.innerHTML = rooms
        .map(
          (r) =>
            `<div style="padding:8px 0;border-bottom:1px solid #3a3a3a;">
              <strong>${r.name}</strong> — ${r.playerCount}/${r.maxPlayers}
            </div>`
        )
        .join('');
    } else {
      this.roomsList.innerHTML = `
        <div style="padding:8px 0;color:#6a5a4a;">
          Default Deathmatch · Join to play
        </div>
      `;
    }
  }

  hide(): void {
    this._visible = false;
    this.container.style.display = 'none';
  }

  setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  setJoinEnabled(enabled: boolean): void {
    this.joinBtn.disabled = !enabled;
  }

  get visible(): boolean {
    return this._visible;
  }

  getUsername(): string {
    return this.usernameInput.value.trim() || 'Agent';
  }

  dispose(): void {
    document.body.removeChild(this.container);
  }
}
