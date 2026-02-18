/**
 * Config for custom quickplay arena assets.
 * Allows custom naming for HDRI, skybox, environment GLB, and time-of-day presets.
 */

export interface QuickplayPreset {
  hdri?: string;
  skybox?: string;
}

export interface QuickplayConfig {
  /** Environment GLB filename. Default: environment.glb */
  environment?: string;
  /** HDRI for lighting/reflections. Default: environment.hdr */
  hdri?: string;
  /** Skybox image for background. Default: skybox.jpg */
  skybox?: string;
  /** Presets for time of day or other variants (e.g. day, night, sunset). */
  presets?: Record<string, QuickplayPreset>;
  /** Active preset name. Uses presets[preset] if set. */
  preset?: string;
}

const DEFAULT_ENVIRONMENT = 'environment.glb';
const DEFAULT_HDRI = 'environment.hdr';
const DEFAULT_SKYBOX = 'skybox.jpg';

export interface QuickplayResolvedConfig {
  environment: string;
  hdri: string;
  skybox: string;
}

/**
 * Load quickplay config from public/maps/quickplay/config.json.
 * Returns defaults when config is missing or invalid.
 * @param baseUrl - Base URL for assets (e.g. /maps/quickplay/)
 * @param presetOverride - Optional preset name to use (e.g. from UI). Overrides config.preset.
 */
export async function loadQuickplayConfig(
  baseUrl: string,
  presetOverride?: string,
): Promise<QuickplayResolvedConfig> {
  const defaults: QuickplayResolvedConfig = {
    environment: DEFAULT_ENVIRONMENT,
    hdri: DEFAULT_HDRI,
    skybox: DEFAULT_SKYBOX,
  };

  try {
    const res = await fetch(`${baseUrl}config.json`);
    if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
      return defaults;
    }
    const raw = (await res.json()) as QuickplayConfig;
    if (!raw || typeof raw !== 'object') return defaults;

    let hdri = raw.hdri ?? defaults.hdri;
    let skybox = raw.skybox ?? defaults.skybox;
    const presetName = presetOverride ?? raw.preset;

    if (presetName && raw.presets?.[presetName]) {
      const p = raw.presets[presetName];
      if (p.hdri) hdri = p.hdri;
      if (p.skybox) skybox = p.skybox;
    }

    return {
      environment: raw.environment ?? defaults.environment,
      hdri,
      skybox,
    };
  } catch {
    return defaults;
  }
}
