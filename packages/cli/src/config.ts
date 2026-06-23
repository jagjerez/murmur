import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '@murmur/shared';

export type Theme = 'system' | 'dark' | 'light';

export interface MurmurConfig {
  openaiApiKey?: string;
  hotkey: string;
  model: string;
  voice: string;
  theme: Theme;
}

export const DEFAULT_CONFIG: Omit<MurmurConfig, 'openaiApiKey'> = {
  hotkey: 'CommandOrControl+Shift+Space',
  model: 'gpt-realtime',
  voice: 'alloy',
  theme: 'system',
};

const CONFIG_FILE = 'config.json';
const VALID_THEMES: readonly Theme[] = ['system', 'dark', 'light'];

/** Persistencia de la configuración de murmur en `<base>/config.json`. */
export class ConfigStore {
  readonly #baseDir: string;

  constructor(baseDir?: string) {
    this.#baseDir = baseDir ?? process.env.MURMUR_HOME ?? join(homedir(), '.murmur');
  }

  /** Directorio base de datos (`MURMUR_HOME` o `~/.murmur`). */
  baseDir(): string {
    return this.#baseDir;
  }

  /** Ruta absoluta del archivo de configuración. */
  path(): string {
    return join(this.#baseDir, CONFIG_FILE);
  }

  /** Ruta absoluta de un archivo de datos dentro del directorio base. */
  dataPath(file: string): string {
    return join(this.#baseDir, file);
  }

  /**
   * Lee la configuración. Si no existe el archivo devuelve los defaults.
   * Si el JSON es inválido lanza `ConfigError`. Campos desconocidos se ignoran.
   */
  load(): MurmurConfig {
    let raw: string;
    try {
      raw = readFileSync(this.path(), 'utf8');
    } catch (err) {
      if (isNotFound(err)) {
        return { ...DEFAULT_CONFIG };
      }
      throw new ConfigError(`No se pudo leer la configuración en ${this.path()}`, { cause: err });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new ConfigError(`Configuración inválida (JSON malformado) en ${this.path()}`, {
        cause: err,
      });
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(`Configuración inválida (se esperaba un objeto) en ${this.path()}`);
    }

    return normalize(parsed as Record<string, unknown>);
  }

  /** Combina `patch` sobre la config actual, la escribe con permisos `0600` y la devuelve. */
  save(patch: Partial<MurmurConfig>): MurmurConfig {
    const merged: MurmurConfig = { ...this.load(), ...patch };
    if (merged.openaiApiKey === undefined) {
      delete merged.openaiApiKey;
    }
    mkdirSync(this.#baseDir, { recursive: true });
    writeFileSync(this.path(), `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
    // Por si el archivo ya existía con otros permisos, forzamos 0600.
    chmodSync(this.path(), 0o600);
    return merged;
  }

  /** Guarda la API key de OpenAI. */
  setOpenAiKey(key: string): MurmurConfig {
    return this.save({ openaiApiKey: key });
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'ENOENT'
  );
}

/** Aplica defaults y descarta campos desconocidos o con tipos inválidos. */
function normalize(raw: Record<string, unknown>): MurmurConfig {
  const config: MurmurConfig = { ...DEFAULT_CONFIG };

  if (typeof raw.openaiApiKey === 'string') {
    config.openaiApiKey = raw.openaiApiKey;
  }
  if (typeof raw.hotkey === 'string') {
    config.hotkey = raw.hotkey;
  }
  if (typeof raw.model === 'string') {
    config.model = raw.model;
  }
  if (typeof raw.voice === 'string') {
    config.voice = raw.voice;
  }
  if (typeof raw.theme === 'string' && (VALID_THEMES as readonly string[]).includes(raw.theme)) {
    config.theme = raw.theme as Theme;
  }

  return config;
}
