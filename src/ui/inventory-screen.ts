import type { WeaponType } from '../weapons/weapon-view-model';
import type { WeaponSkin } from '../weapons/weapon-skins';
import { WEAPON_SKIN_LABELS, WEAPON_SKIN_LIST } from '../weapons/weapon-skins';
import { PREVIEW_W, PREVIEW_H } from '../weapons/weapon-preview-renderer';

export interface InventoryWeapon {
  type: WeaponType;
  name: string;
  skin: WeaponSkin;
}

export interface InventoryState {
  weapons: InventoryWeapon[];
  keys: string[];
}

/**
 * Inventory overlay: weapons with skin selector, and items (keys).
 * Open with Tab, facility / GoldenEye style.
 */
export class InventoryScreen {
  private container: HTMLElement;
  private _isOpen = false;
  private onSetSkin: ((type: WeaponType, skin: WeaponSkin) => void) | null = null;
  private onClose: (() => void) | null = null;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'inventory-screen';
    this.container.style.cssText = `
      position: absolute;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      background: linear-gradient(180deg, rgba(0,0,0,0.94) 0%, rgba(15,18,22,0.96) 100%);
      color: #c4b896;
      font-family: 'Courier New', monospace;
      z-index: 20;
      padding: 40px;
      box-sizing: border-box;
      pointer-events: auto;
    `;
    document.body.appendChild(this.container);
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  /** renderWeaponPreview: (type, skin, rotationY, canvas) => void. If provided, shows 3D canvas preview (rotatable). */
  show(
    state: InventoryState,
    onSetSkin: (type: WeaponType, skin: WeaponSkin) => void,
    onClose: () => void,
    renderWeaponPreview?: (type: WeaponType, skin: WeaponSkin, rotationY: number, canvas: HTMLCanvasElement) => void,
  ): void {
    this._isOpen = true;
    this.onSetSkin = onSetSkin;
    this.onClose = onClose;
    this.renderWeaponPreview = renderWeaponPreview ?? null;
    this.container.style.display = 'flex';
    this.render(state);
  }
  private renderWeaponPreview: ((type: WeaponType, skin: WeaponSkin, rotationY: number, canvas: HTMLCanvasElement) => void) | null = null;
  private rotationByKey = new Map<string, number>();
  private activeDrag: { type: WeaponType; skin: WeaponSkin; canvas: HTMLCanvasElement; lastX: number } | null = null; // skin = current skin for that weapon when dragging
  private boundMouseMove = (e: MouseEvent) => this.onMouseMove(e);
  private boundMouseUp = () => this.onMouseUp();

  hide(): void {
    this._isOpen = false;
    this.container.style.display = 'none';
    this.onSetSkin = null;
    this.onClose = null;
    this.renderWeaponPreview = null;
    this.activeDrag = null;
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }

  /** One preview per weapon; rotation keyed by weapon type only. */
  private getRotationKey(type: WeaponType): string {
    return type;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.activeDrag || !this.renderWeaponPreview) return;
    const delta = e.clientX - this.activeDrag.lastX;
    this.activeDrag.lastX = e.clientX;
    const key = this.getRotationKey(this.activeDrag.type);
    const current = this.rotationByKey.get(key) ?? 0;
    const next = current + delta * 0.01;
    this.rotationByKey.set(key, next);
    this.renderWeaponPreview(this.activeDrag.type, this.activeDrag.skin, next, this.activeDrag.canvas);
  }

  private onMouseUp(): void {
    if (this.activeDrag) {
      this.activeDrag.canvas.style.cursor = 'grab';
      this.activeDrag = null;
    }
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
  }

  private render(state: InventoryState): void {
    this.container.innerHTML = '';

    const title = document.createElement('h1');
    title.textContent = 'INVENTORY';
    title.style.cssText = 'font-size: 28px; letter-spacing: 8px; color: #d4af37; margin-bottom: 8px;';
    this.container.appendChild(title);

    const hint = document.createElement('p');
    hint.textContent = 'Tab to close';
    hint.style.cssText = 'font-size: 11px; color: #666; margin-bottom: 28px;';
    this.container.appendChild(hint);

    // ─── Weapons ───
    const weaponsLabel = document.createElement('div');
    weaponsLabel.textContent = 'WEAPONS';
    weaponsLabel.style.cssText = 'font-size: 11px; letter-spacing: 4px; color: #888; margin-bottom: 12px;';
    this.container.appendChild(weaponsLabel);

    const weaponList = document.createElement('div');
    weaponList.style.cssText = 'margin-bottom: 28px; min-width: 520px;';
    for (const w of state.weapons) {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; gap: 20px; margin-bottom: 14px; padding: 10px 14px; background: rgba(40,42,48,0.6); border: 1px solid rgba(100,90,60,0.3);';
      const nameRow = document.createElement('div');
      nameRow.style.cssText = 'font-size: 14px; color: #e0d0a8; min-width: 100px;';
      nameRow.textContent = w.name;
      row.appendChild(nameRow);
      // Single preview for this weapon (shows current skin)
      const previewBlock = document.createElement('div');
      previewBlock.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 4px;';
      const preview = document.createElement('canvas');
      preview.width = PREVIEW_W;
      preview.height = PREVIEW_H;
      preview.title = 'Drag to rotate';
      preview.style.cssText = `
        display: block;
        width: ${PREVIEW_W}px;
        height: ${PREVIEW_H}px;
        cursor: grab;
        background: #1a1a22;
        border: 1px solid rgba(100,90,60,0.5);
      `;
      if (this.renderWeaponPreview) {
        const rotationY = this.rotationByKey.get(this.getRotationKey(w.type)) ?? 0;
        this.renderWeaponPreview(w.type, w.skin, rotationY, preview);
        preview.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.activeDrag = { type: w.type, skin: w.skin, canvas: preview, lastX: e.clientX };
          preview.style.cursor = 'grabbing';
          document.addEventListener('mousemove', this.boundMouseMove);
          document.addEventListener('mouseup', this.boundMouseUp);
        });
      }
      previewBlock.appendChild(preview);
      const dragHint = document.createElement('div');
      dragHint.textContent = 'Drag to rotate';
      dragHint.style.cssText = 'font-size: 9px; color: #666;';
      previewBlock.appendChild(dragHint);
      row.appendChild(previewBlock);
      // Skin options next to the preview
      const skinButtons = document.createElement('div');
      skinButtons.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
      for (const skin of WEAPON_SKIN_LIST) {
        const isActive = w.skin === skin;
        const btn = document.createElement('button');
        btn.textContent = WEAPON_SKIN_LABELS[skin];
        btn.type = 'button';
        btn.style.cssText = `
          font-family: 'Courier New', monospace;
          font-size: 11px;
          padding: 6px 12px;
          text-align: left;
          border: 1px solid ${isActive ? '#d4af37' : 'rgba(120,110,80,0.6)'};
          background: ${isActive ? 'rgba(180,160,80,0.25)' : 'rgba(30,32,36,0.8)'};
          color: ${isActive ? '#e8c547' : '#a09070'};
          cursor: pointer;
        `;
        btn.addEventListener('click', () => {
          this.onSetSkin?.(w.type, skin);
        });
        skinButtons.appendChild(btn);
      }
      row.appendChild(skinButtons);
      weaponList.appendChild(row);
    }
    this.container.appendChild(weaponList);

    // ─── Items (keys) ───
    const itemsLabel = document.createElement('div');
    itemsLabel.textContent = 'ITEMS';
    itemsLabel.style.cssText = 'font-size: 11px; letter-spacing: 4px; color: #888; margin-bottom: 12px;';
    this.container.appendChild(itemsLabel);

    const keysList = document.createElement('div');
    keysList.style.cssText = 'min-width: 420px;';
    if (state.keys.length === 0) {
      const empty = document.createElement('p');
      empty.textContent = 'No keys or items.';
      empty.style.cssText = 'font-size: 13px; color: #666;';
      keysList.appendChild(empty);
    } else {
      for (const keyId of state.keys) {
        const keyRow = document.createElement('div');
        keyRow.style.cssText = 'font-size: 13px; color: #a09060; padding: 6px 0; border-bottom: 1px solid rgba(80,70,50,0.3);';
        keyRow.textContent = `Key: ${keyId}`;
        keysList.appendChild(keyRow);
      }
    }
    this.container.appendChild(keysList);
  }

  /** Call when skin was set so inventory can refresh with new state (optional). */
  updateState(state: InventoryState): void {
    if (this._isOpen) this.render(state);
  }
}
