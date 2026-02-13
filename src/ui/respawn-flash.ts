/**
 * Brief white flash overlay when player respawns in multiplayer.
 * Fades out over ~0.4s for a quick "back in action" feel.
 */
export class RespawnFlash {
  private overlay: HTMLDivElement;
  private fadeTimer = 0;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      opacity: 0;
      z-index: 999;
      background: rgba(255, 255, 255, 0.5);
    `;
    document.body.appendChild(this.overlay);
  }

  /** Trigger respawn flash effect */
  show(): void {
    this.fadeTimer = 0.4;
    this.overlay.style.opacity = '0.5';
  }

  update(dt: number): void {
    if (this.fadeTimer > 0) {
      this.fadeTimer -= dt;
      const opacity = Math.max(0, this.fadeTimer / 0.4) * 0.5;
      this.overlay.style.opacity = String(opacity);
    }
  }

  dispose(): void {
    this.overlay.remove();
  }
}
