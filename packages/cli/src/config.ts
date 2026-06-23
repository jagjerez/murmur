import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '@murmur/shared';

export type Theme = 'system' | 'dark' | 'light';

/** Controles de privacidad del usuario. Todos con defaults conservadores. */
export interface PrivacyConfig {
  /** Si `true`, el orchestrator no inyecta contexto RAG en el prompt. */
  localOnlyMode: boolean;
  /** Si `false`, no se persiste el texto de los mensajes. */
  storeTranscripts: boolean;
  /** Si `true`, se redactan los mensajes (redactSensitive) antes de persistir. */
  redactBeforeStore: boolean;
  /** Días de retención; `0` = sin límite. */
  retentionDays: number;
}

export interface MurmurConfig {
  openaiApiKey?: string;
  hotkey: string;
  model: string;
  voice: string;
  theme: Theme;
  privacy: PrivacyConfig;
}

export const DEFAULT_PRIVACY: PrivacyConfig = {
  localOnlyMode: false,
  storeTranscripts: true,
  redactBeforeStore: false,
  retentionDays: 0,
};

export const DEFAULT_CONFIG: Omit<MurmurConfig, 'openaiApiKey'> = {
  hotkey: 'CommandOrControl+Shift+Space',
  model: 'gpt-realtime',
  voice: 'alloy',
  theme: 'system',
  privacy: DEFAULT_PRIVACY,
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

  /** Combina `patch` sobre la privacidad actual (normalizada) y la persiste. */
  setPrivacy(patch: Partial<PrivacyConfig>): MurmurConfig {
    const current = this.load().privacy;
    const next = normalizePrivacy({ ...current, ...patch });
    return this.save({ privacy: next });
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
  const config: MurmurConfig = { ...DEFAULT_CONFIG, privacy: { ...DEFAULT_PRIVACY } };

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
  if (raw.privacy !== null && typeof raw.privacy === 'object' && !Array.isArray(raw.privacy)) {
    config.privacy = normalizePrivacy(raw.privacy as Record<string, unknown>);
  }

  return config;
}

/** Normaliza la privacidad: defaults para campos ausentes o con tipo inválido. */
function normalizePrivacy(raw: Record<string, unknown>): PrivacyConfig {
  const privacy: PrivacyConfig = { ...DEFAULT_PRIVACY };

  if (typeof raw.localOnlyMode === 'boolean') {
    privacy.localOnlyMode = raw.localOnlyMode;
  }
  if (typeof raw.storeTranscripts === 'boolean') {
    privacy.storeTranscripts = raw.storeTranscripts;
  }
  if (typeof raw.redactBeforeStore === 'boolean') {
    privacy.redactBeforeStore = raw.redactBeforeStore;
  }
  if (typeof raw.retentionDays === 'number' && Number.isFinite(raw.retentionDays)) {
    privacy.retentionDays = raw.retentionDays > 0 ? Math.floor(raw.retentionDays) : 0;
  }

  return privacy;
}
