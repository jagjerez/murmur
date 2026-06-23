/**
 * `ConfigClient`: puente entre el webview y la configuración persistida de murmur.
 *
 * Dos implementaciones intercambiables:
 *  - `createMockConfigClient(initial?)`: en memoria, para tests y dev en navegador.
 *  - `createTauriConfigClient()`: invoca los comandos Rust (`get_config`/`set_config`/
 *    `set_openai_key`) vía `@tauri-apps/api/core#invoke`. Fuera de un runtime Tauri
 *    DEGRADA a un cliente en memoria (no rompe el dev/tests en navegador).
 *
 * Seguridad: la API key NUNCA se devuelve completa al render. `get()` expone sólo
 * `hasApiKey` y un `apiKeyHint` redactado. El cableado interno (orchestrator) usa
 * `readApiKey()`, que sí devuelve la key — su consumidor no debe renderizarla.
 */

export type ThemePref = 'dark' | 'light' | 'system';

/** Vista del wake word en el render (sin secretos): activación por frase de voz. */
export interface WakeWordView {
  enabled: boolean;
  phrase: string;
  sensitivity: number;
}

/** Vista de configuración segura para el render (sin la API key en claro). */
export interface ConfigView {
  /** ¿Hay una API key guardada? */
  hasApiKey: boolean;
  /** Pista redactada de la key (p. ej. `sk-…WXYZ`), o `undefined` si no hay. */
  apiKeyHint?: string;
  hotkey: string;
  voice: string;
  model: string;
  theme: ThemePref;
  /** Config del wake word ("hey murmur"). */
  wakeWord: WakeWordView;
}

export interface ConfigClient {
  /** Vista segura para el render (key redactada). */
  get(): Promise<ConfigView>;
  /** Guarda la API key. Cadena vacía la borra. */
  setOpenAiKey(key: string): Promise<void>;
  setHotkey(accelerator: string): Promise<void>;
  setVoice(voice: string): Promise<void>;
  setModel(model: string): Promise<void>;
  setTheme(theme: ThemePref): Promise<void>;
  /**
   * Devuelve la API key COMPLETA para cableado interno (orchestrator). Nunca debe
   * usarse para renderizar. `undefined` si no hay key.
   */
  readApiKey(): Promise<string | undefined>;
}

/** Valores iniciales del cliente en memoria. */
export interface ConfigInitial {
  apiKey?: string;
  hotkey?: string;
  voice?: string;
  model?: string;
  theme?: ThemePref;
  wakeWord?: Partial<WakeWordView>;
}

/** Defaults coherentes con el resto de la app (hotkey por defecto, voz/modelo MVP). */
export const CONFIG_DEFAULTS = {
  hotkey: 'CommandOrControl+Shift+Space',
  voice: 'verse',
  model: 'gpt-realtime',
  theme: 'system' as ThemePref,
  wakeWord: { enabled: false, phrase: 'hey murmur', sensitivity: 0.5 } as WakeWordView,
} as const;

/**
 * Redacta una API key para mostrarla sin filtrarla: muestra un prefijo de marca y
 * un sufijo corto (`sk-…WXYZ`). Claves cortas se redactan por completo. Cadena vacía
 * devuelve cadena vacía (no hay nada que redactar).
 */
export function redactKey(key: string): string {
  if (key.length === 0) return '';
  const suffix = key.slice(-4);
  // Si la clave es muy corta, no exponemos su sufijo real.
  if (key.length <= 6) return '…';
  return `${key.slice(0, 3)}…${suffix}`;
}

interface ConfigState {
  apiKey: string;
  hotkey: string;
  voice: string;
  model: string;
  theme: ThemePref;
  wakeWord: WakeWordView;
}

function viewOf(state: ConfigState): ConfigView {
  const hasApiKey = state.apiKey.length > 0;
  return {
    hasApiKey,
    ...(hasApiKey ? { apiKeyHint: redactKey(state.apiKey) } : {}),
    hotkey: state.hotkey,
    voice: state.voice,
    model: state.model,
    theme: state.theme,
    wakeWord: { ...state.wakeWord },
  };
}

/** Cliente de configuración en memoria (tests/dev). La key vive sólo aquí. */
export function createMockConfigClient(initial: ConfigInitial = {}): ConfigClient {
  const state: ConfigState = {
    apiKey: initial.apiKey ?? '',
    hotkey: initial.hotkey ?? CONFIG_DEFAULTS.hotkey,
    voice: initial.voice ?? CONFIG_DEFAULTS.voice,
    model: initial.model ?? CONFIG_DEFAULTS.model,
    theme: initial.theme ?? CONFIG_DEFAULTS.theme,
    wakeWord: { ...CONFIG_DEFAULTS.wakeWord, ...initial.wakeWord },
  };

  return {
    get: () => Promise.resolve(viewOf(state)),
    setOpenAiKey: (key) => {
      state.apiKey = key;
      return Promise.resolve();
    },
    setHotkey: (accelerator) => {
      state.hotkey = accelerator;
      return Promise.resolve();
    },
    setVoice: (voice) => {
      state.voice = voice;
      return Promise.resolve();
    },
    setModel: (model) => {
      state.model = model;
      return Promise.resolve();
    },
    setTheme: (theme) => {
      state.theme = theme;
      return Promise.resolve();
    },
    readApiKey: () => Promise.resolve(state.apiKey.length > 0 ? state.apiKey : undefined),
  };
}

/** ¿Hay un runtime Tauri disponible? Detecta `window.__TAURI_INTERNALS__`. */
function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ !== undefined
  );
}

/** Forma de la config que devuelven los comandos Rust (`get_config`). */
interface RustConfigView {
  has_api_key: boolean;
  api_key_hint?: string | null;
  hotkey: string;
  voice: string;
  model: string;
  theme: string;
  wake_word?: {
    enabled?: boolean;
    phrase?: string;
    sensitivity?: number;
  } | null;
}

function themeOf(value: string): ThemePref {
  return value === 'dark' || value === 'light' ? value : 'system';
}

/** Mapea el wake word del backend a la vista, con defaults si falta o llega parcial. */
function wakeWordOf(raw: RustConfigView['wake_word']): WakeWordView {
  return {
    enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : CONFIG_DEFAULTS.wakeWord.enabled,
    phrase:
      typeof raw?.phrase === 'string' && raw.phrase.length > 0
        ? raw.phrase
        : CONFIG_DEFAULTS.wakeWord.phrase,
    sensitivity:
      typeof raw?.sensitivity === 'number' && Number.isFinite(raw.sensitivity)
        ? raw.sensitivity
        : CONFIG_DEFAULTS.wakeWord.sensitivity,
  };
}

/**
 * Cliente real respaldado por los comandos Rust de Tauri. Carga `invoke` de forma
 * perezosa (`await import`) para no evaluar el módulo de Tauri en jsdom/`vite build`.
 * Fuera de Tauri degrada a `createMockConfigClient`.
 *
 * NOTA: la key completa nunca viaja al render. `readApiKey()` invoca un comando
 * dedicado del backend; si el backend no lo soporta, devuelve `undefined`.
 */
export function createTauriConfigClient(): ConfigClient {
  if (!isTauri()) {
    console.info('[murmur] fuera de un runtime Tauri: ConfigClient degrada a memoria.');
    return createMockConfigClient();
  }

  async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    const mod = (await import('@tauri-apps/api/core')) as {
      invoke<R>(cmd: string, args?: Record<string, unknown>): Promise<R>;
    };
    return mod.invoke<T>(cmd, args);
  }

  return {
    async get() {
      const raw = await invoke<RustConfigView>('get_config');
      return {
        hasApiKey: raw.has_api_key,
        ...(raw.api_key_hint ? { apiKeyHint: raw.api_key_hint } : {}),
        hotkey: raw.hotkey,
        voice: raw.voice,
        model: raw.model,
        theme: themeOf(raw.theme),
        wakeWord: wakeWordOf(raw.wake_word),
      };
    },
    async setOpenAiKey(key) {
      await invoke('set_openai_key', { key });
    },
    async setHotkey(accelerator) {
      await invoke('set_config', { patch: { hotkey: accelerator } });
    },
    async setVoice(voice) {
      await invoke('set_config', { patch: { voice } });
    },
    async setModel(model) {
      await invoke('set_config', { patch: { model } });
    },
    async setTheme(theme) {
      await invoke('set_config', { patch: { theme } });
    },
    async readApiKey() {
      // Comando interno opcional; si no existe en el backend, no rompe el render.
      try {
        const key = await invoke<string | null>('read_openai_key');
        return key ?? undefined;
      } catch {
        return undefined;
      }
    },
  };
}
