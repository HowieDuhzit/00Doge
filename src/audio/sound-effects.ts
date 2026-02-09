/**
 * Procedural sound effects using Web Audio API.
 * No audio files needed — generates gunshot, reload, etc. from noise and oscillators.
 */

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export type WeaponSoundType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

/** Base gunshot helper: noise + filter + optional bass. Tuned by duration/pitch/gain. */
function proceduralShot(
  ctx: AudioContext,
  now: number,
  opts: {
    noiseDuration: number;
    filterStart: number;
    filterEnd: number;
    gain: number;
    bassFreq?: number;
    bassDuration?: number;
  },
): void {
  const { noiseDuration, filterStart, filterEnd, gain, bassFreq = 0, bassDuration = 0 } = opts;
  const bufferSize = Math.ceil(ctx.sampleRate * noiseDuration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterStart, now);
  filter.frequency.exponentialRampToValueAtTime(filterEnd, now + noiseDuration * 0.7);
  filter.Q.value = 1;
  const distortion = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 256 - 1;
    curve[i] = (Math.PI + 20) * x / (Math.PI + 20 * Math.abs(x));
  }
  distortion.curve = curve;
  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(gain, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + noiseDuration);
  noise.connect(filter);
  filter.connect(distortion);
  distortion.connect(gainNode);
  gainNode.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + noiseDuration);
  if (bassFreq > 0 && bassDuration > 0) {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(bassFreq, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + bassDuration * 0.8);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(gain * 1.2, now);
    oscGain.gain.exponentialRampToValueAtTime(0.01, now + bassDuration);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + bassDuration);
  }
}

/** Pistol: crisp, short crack */
export function playGunshotPistol(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  proceduralShot(ctx, now, {
    noiseDuration: 0.08,
    filterStart: 1200,
    filterEnd: 280,
    gain: 0.35,
    bassFreq: 120,
    bassDuration: 0.06,
  });
}

/** Rifle: sharper, snappier burst */
export function playGunshotRifle(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  proceduralShot(ctx, now, {
    noiseDuration: 0.06,
    filterStart: 1400,
    filterEnd: 350,
    gain: 0.3,
    bassFreq: 100,
    bassDuration: 0.05,
  });
}

/** Shotgun: deep boom, thicker noise */
export function playGunshotShotgun(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  proceduralShot(ctx, now, {
    noiseDuration: 0.2,
    filterStart: 600,
    filterEnd: 120,
    gain: 0.5,
    bassFreq: 180,
    bassDuration: 0.12,
  });
}

/** Sniper: heavy crack, longer decay */
export function playGunshotSniper(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  proceduralShot(ctx, now, {
    noiseDuration: 0.18,
    filterStart: 900,
    filterEnd: 150,
    gain: 0.45,
    bassFreq: 140,
    bassDuration: 0.14,
  });
}

/** Play gunshot by weapon type (player weapons) */
export function playGunshotWeapon(type: WeaponSoundType): void {
  switch (type) {
    case 'pistol': playGunshotPistol(); break;
    case 'rifle': playGunshotRifle(); break;
    case 'shotgun': playGunshotShotgun(); break;
    case 'sniper': playGunshotSniper(); break;
  }
}

/** Legacy: single generic gunshot (e.g. for enemy fire). */
export function playGunshot(): void {
  playGunshotRifle();
}

/** Procedural empty click (dry fire) */
export function playDryFire(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

/** Procedural reload sound (mechanical click-clack) */
export function playReload(): void {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  // Magazine out (click)
  const click1 = ctx.createOscillator();
  click1.frequency.setValueAtTime(3000, now + 0.1);
  click1.frequency.exponentialRampToValueAtTime(800, now + 0.13);
  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0, now);
  g1.gain.setValueAtTime(0.2, now + 0.1);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
  click1.connect(g1);
  g1.connect(ctx.destination);
  click1.start(now);
  click1.stop(now + 0.2);

  // Magazine in (heavier click)
  const click2 = ctx.createOscillator();
  click2.frequency.setValueAtTime(2000, now + 0.7);
  click2.frequency.exponentialRampToValueAtTime(500, now + 0.73);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, now);
  g2.gain.setValueAtTime(0.25, now + 0.7);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.78);
  click2.connect(g2);
  g2.connect(ctx.destination);
  click2.start(now);
  click2.stop(now + 0.8);

  // Slide rack
  const bufferSize = ctx.sampleRate * 0.06;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2) * 0.3;
  }
  const slide = ctx.createBufferSource();
  slide.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 2000;
  const g3 = ctx.createGain();
  g3.gain.setValueAtTime(0, now);
  g3.gain.setValueAtTime(0.3, now + 0.95);
  g3.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  slide.connect(filter);
  filter.connect(g3);
  g3.connect(ctx.destination);
  slide.start(now + 0.95);
  slide.stop(now + 1.05);
}
