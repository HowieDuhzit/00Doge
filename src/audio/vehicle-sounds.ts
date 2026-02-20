/**
 * Procedural vehicle sound effects using Web Audio API.
 */

let audioCtx: AudioContext | null = null;
let engineGain: GainNode | null = null;
let engineOsc: OscillatorNode | null = null;
let engineLFO: OscillatorNode | null = null;
let engineRunning = false;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

/**
 * Start/update the engine sound. Call every frame with rpm 0..1.
 */
export function updateEngineSound(rpm: number, isRunning: boolean): void {
  try {
    const ctx = getCtx();

    if (!isRunning) {
      if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      engineRunning = false;
      return;
    }

    if (!engineRunning) {
      // Create engine oscillator
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';

      // Distortion for engine roughness
      const distortion = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = (Math.PI + 300) * x / (Math.PI + 300 * Math.abs(x));
      }
      distortion.curve = curve;

      engineGain = ctx.createGain();
      engineGain.gain.value = 0.12;

      // Low-pass to make it bassy
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.value = 600;
      lpf.Q.value = 1.5;

      // LFO for engine rumble
      engineLFO = ctx.createOscillator();
      engineLFO.frequency.value = 12;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 8;

      engineLFO.connect(lfoGain);
      lfoGain.connect(engineOsc.frequency);
      engineOsc.connect(distortion);
      distortion.connect(lpf);
      lpf.connect(engineGain);
      engineGain.connect(ctx.destination);

      engineOsc.start();
      engineLFO.start();
      engineRunning = true;
    }

    // Modulate pitch with RPM (80Hz idle → 160Hz at full)
    if (engineOsc) {
      const freq = 60 + rpm * 110;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
    }
    if (engineLFO) {
      engineLFO.frequency.setTargetAtTime(8 + rpm * 14, ctx.currentTime, 0.1);
    }
    if (engineGain) {
      const vol = 0.07 + rpm * 0.08;
      engineGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1);
    }
  } catch {
    // AudioContext blocked or unavailable
  }
}

/**
 * Play vehicle impact/landing sound.
 */
export function playVehicleImpact(intensity: number): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0.3 * intensity;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    const noise = ctx.createOscillator();
    noise.type = 'sawtooth';
    noise.frequency.value = 80;
    noise.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.4);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 400;

    noise.connect(lpf);
    lpf.connect(gain);
    gain.connect(ctx.destination);

    noise.start();
    noise.stop(ctx.currentTime + 0.4);
  } catch {
    // ignore
  }
}

/**
 * Play gun fire sound for mounted turret.
 */
export function playVehicleGunFire(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 180;
    osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 3000;

    osc.connect(lpf);
    lpf.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // ignore
  }
}

/**
 * Play vehicle enter/exit beep.
 */
export function playVehicleBeep(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    const gain = ctx.createGain();
    gain.gain.value = 0.08;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // ignore
  }
}

/**
 * Play explosion sound when vehicle is destroyed.
 */
export function playVehicleExplosion(): void {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') ctx.resume();

    // Low boom
    const boomOsc = ctx.createOscillator();
    boomOsc.type = 'sawtooth';
    boomOsc.frequency.value = 60;
    boomOsc.frequency.exponentialRampToValueAtTime(15, ctx.currentTime + 1.5);

    const boomGain = ctx.createGain();
    boomGain.gain.value = 0.5;
    boomGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 800;

    boomOsc.connect(lpf);
    lpf.connect(boomGain);
    boomGain.connect(ctx.destination);
    boomOsc.start();
    boomOsc.stop(ctx.currentTime + 1.5);
  } catch {
    // ignore
  }
}
