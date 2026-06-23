import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ConfigError } from '@murmur/shared';
import { createSqliteStore, type SqliteStore } from '@murmur/rag';
import type { ConfigStore, MurmurConfig, PrivacyConfig } from './config';

export const VERSION = '0.1.0';

/** Fábrica del store de persistencia; inyectable en tests. */
export type StoreFactory = (path: string) => SqliteStore;

export interface CliDeps {
  config: ConfigStore;
  now?: () => number;
  /** Permite inyectar un store alternativo en tests. Por defecto SQLite real. */
  storeFactory?: StoreFactory;
}

export interface CliResult {
  stdout: string;
  exitCode: number;
}

/** Acumula líneas de salida sin imprimir nada. */
class Output {
  readonly #lines: string[] = [];

  line(text = ''): void {
    this.#lines.push(text);
  }

  toString(): string {
    return this.#lines.join('\n');
  }
}

/** Redacta una API key: `sk-…1234`, o `(no configurada)` si falta. */
function redactKey(key?: string): string {
  if (!key) {
    return '(no configurada)';
  }
  return `sk-…${key.slice(-4)}`;
}

export function helpText(): string {
  return `murmur — asistente de voz con IA

Uso: murmur <comando> [opciones]

Comandos:
  start                          Comprueba prerequisitos para arrancar el asistente
  config                         Muestra la configuración actual (API key redactada)
  config set-openai-key <key>    Guarda la API key de OpenAI
  config set-hotkey <combo>      Guarda el atajo de teclado global
  config set-privacy <campo> <valor>
                                 Cambia un flag de privacidad (localOnlyMode,
                                 storeTranscripts, redactBeforeStore, retentionDays)
  memory list                    Lista la memoria guardada
  memory add <texto>             Añade una memoria explícita
  memory forget <id>             Olvida (borra) un item de memoria
  memory export [ruta]           Exporta memoria+sesiones+mensajes (JSON)
  memory prune                   Aplica la retención (retentionDays)
  memory reset [--yes]           Borra la memoria local
  status                         Muestra el estado de murmur
  help                           Muestra esta ayuda

Opciones:
  -v, --version                  Muestra la versión`;
}

/**
 * Punto de entrada puro: recibe argv y deps, devuelve la salida a imprimir y el exitCode.
 * No imprime ni llama a process.exit; eso lo hace el binario `index.ts`.
 */
export async function run(argv: string[], deps: CliDeps): Promise<CliResult> {
  const [command, sub, ...rest] = argv;
  const out = new Output();

  try {
    switch (command) {
      case '-v':
      case '--version':
        out.line(VERSION);
        return ok(out);

      case undefined:
      case 'help':
      case '--help':
        out.line(helpText());
        return ok(out);

      case 'status':
        return await cmdStatus(out, deps);

      case 'start':
        return cmdStart(out, deps);

      case 'config':
        return cmdConfig(out, deps, sub, rest);

      case 'memory':
        return await cmdMemory(out, deps, sub, rest);

      default:
        out.line(`murmur: comando desconocido "${command}". Usa "murmur help".`);
        return fail(out);
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      out.line(`murmur: ${err.message}`);
      return fail(out);
    }
    throw err;
  }
}

function ok(out: Output): CliResult {
  return { stdout: out.toString(), exitCode: 0 };
}

function fail(out: Output): CliResult {
  return { stdout: out.toString(), exitCode: 1 };
}

/** Abre el store SQLite en `path` (factory inyectable, por defecto la real). */
function openStore(deps: CliDeps, path: string): SqliteStore {
  const factory = deps.storeFactory ?? createSqliteStore;
  return factory(path);
}

/** Cuenta los items de memoria sin crear la db si no existe (devuelve 0). */
async function memoryCount(deps: CliDeps): Promise<number> {
  const dbPath = deps.config.dataPath('memory.db');
  if (!existsSync(dbPath)) {
    return 0;
  }
  const store = openStore(deps, dbPath);
  try {
    return await store.memory.count();
  } finally {
    store.close();
  }
}

async function cmdStatus(out: Output, deps: CliDeps): Promise<CliResult> {
  const config = deps.config.load();
  const count = await memoryCount(deps);
  out.line(`murmur ${VERSION}`);
  out.line(`Config:   ${deps.config.path()}`);
  out.line(`Datos:    ${deps.config.baseDir()}`);
  out.line(`API key:  ${config.openaiApiKey ? 'sí (configurada)' : 'no (no configurada)'}`);
  out.line(`Hotkey:   ${config.hotkey}`);
  out.line(`Modelo:   ${config.model}`);
  out.line(`Voz:      ${config.voice}`);
  out.line(`Tema:     ${config.theme}`);
  out.line(`Memoria:  ${count} ${count === 1 ? 'elemento' : 'elementos'}`);
  return ok(out);
}

function cmdStart(out: Output, deps: CliDeps): CliResult {
  const config = deps.config.load();
  if (!config.openaiApiKey) {
    out.line('murmur: falta la API key de OpenAI.');
    out.line('Configúrala con: murmur config set-openai-key <key>');
    return fail(out);
  }
  out.line('murmur arrancaría el asistente… TODO(F9): arranque real del asistente.');
  return ok(out);
}

function cmdConfig(out: Output, deps: CliDeps, sub: string | undefined, rest: string[]): CliResult {
  switch (sub) {
    case undefined:
      return showConfig(out, deps.config.load());

    case 'set-openai-key': {
      const key = rest[0];
      if (!key) {
        out.line('murmur: la API key no puede estar vacía.');
        return fail(out);
      }
      const saved = deps.config.setOpenAiKey(key);
      out.line(`murmur: API key guardada (${redactKey(saved.openaiApiKey)}).`);
      return ok(out);
    }

    case 'set-hotkey': {
      const combo = rest[0];
      if (!combo) {
        out.line('murmur: el atajo no puede estar vacío.');
        return fail(out);
      }
      const saved = deps.config.save({ hotkey: combo });
      out.line(`murmur: atajo guardado (${saved.hotkey}).`);
      return ok(out);
    }

    case 'set-privacy':
      return cmdSetPrivacy(out, deps, rest);

    default:
      out.line(`murmur: subcomando de config desconocido "${sub}". Usa "murmur help".`);
      return fail(out);
  }
}

/** Campos booleanos de privacidad editables por CLI. */
const PRIVACY_BOOL_FIELDS = ['localOnlyMode', 'storeTranscripts', 'redactBeforeStore'] as const;
type PrivacyBoolField = (typeof PRIVACY_BOOL_FIELDS)[number];

function isPrivacyBoolField(field: string): field is PrivacyBoolField {
  return (PRIVACY_BOOL_FIELDS as readonly string[]).includes(field);
}

function cmdSetPrivacy(out: Output, deps: CliDeps, rest: string[]): CliResult {
  const [field, value] = rest;
  if (!field || value === undefined) {
    out.line('murmur: uso: murmur config set-privacy <campo> <valor>');
    return fail(out);
  }

  if (isPrivacyBoolField(field)) {
    const parsed = parseBool(value);
    if (parsed === undefined) {
      out.line(`murmur: valor inválido "${value}" para ${field} (usa true/false).`);
      return fail(out);
    }
    const saved = deps.config.setPrivacy({ [field]: parsed } satisfies Partial<PrivacyConfig>);
    out.line(`murmur: privacidad actualizada (${field}=${String(saved.privacy[field])}).`);
    return ok(out);
  }

  if (field === 'retentionDays') {
    const days = Number(value);
    if (!Number.isFinite(days) || days < 0) {
      out.line(`murmur: valor inválido "${value}" para retentionDays (usa un entero ≥ 0).`);
      return fail(out);
    }
    const saved = deps.config.setPrivacy({ retentionDays: days });
    out.line(`murmur: privacidad actualizada (retentionDays=${saved.privacy.retentionDays}).`);
    return ok(out);
  }

  out.line(`murmur: campo de privacidad desconocido "${field}".`);
  return fail(out);
}

/** Interpreta `true`/`false` (insensible a mayúsculas); `undefined` si no es válido. */
function parseBool(value: string): boolean | undefined {
  const v = value.toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return undefined;
}

function showConfig(out: Output, config: MurmurConfig): CliResult {
  out.line(`API key:  ${redactKey(config.openaiApiKey)}`);
  out.line(`Hotkey:   ${config.hotkey}`);
  out.line(`Modelo:   ${config.model}`);
  out.line(`Voz:      ${config.voice}`);
  out.line(`Tema:     ${config.theme}`);
  out.line('Privacidad:');
  out.line(`  Modo local:        ${config.privacy.localOnlyMode ? 'sí' : 'no'}`);
  out.line(`  Guardar transcripciones: ${config.privacy.storeTranscripts ? 'sí' : 'no'}`);
  out.line(`  Redactar al guardar:     ${config.privacy.redactBeforeStore ? 'sí' : 'no'}`);
  out.line(
    `  Retención (días):  ${config.privacy.retentionDays === 0 ? 'sin límite' : config.privacy.retentionDays}`,
  );
  return ok(out);
}

async function cmdMemory(
  out: Output,
  deps: CliDeps,
  sub: string | undefined,
  rest: string[],
): Promise<CliResult> {
  switch (sub) {
    case 'reset':
      return await cmdMemoryReset(out, deps, rest);
    case 'list':
      return await cmdMemoryList(out, deps);
    case 'add':
      return await cmdMemoryAdd(out, deps, rest);
    case 'forget':
      return await cmdMemoryForget(out, deps, rest);
    case 'export':
      return await cmdMemoryExport(out, deps, rest);
    case 'prune':
      return await cmdMemoryPrune(out, deps);
    default:
      out.line(`murmur: subcomando de memory desconocido "${sub ?? ''}". Usa "murmur help".`);
      return fail(out);
  }
}

async function cmdMemoryReset(out: Output, deps: CliDeps, rest: string[]): Promise<CliResult> {
  const confirmed = rest.includes('--yes');
  const dbPath = deps.config.dataPath('memory.db');

  if (!confirmed) {
    out.line('murmur: esto borrará la memoria local. Repite con --yes para confirmar:');
    out.line('  murmur memory reset --yes');
    return ok(out);
  }

  if (!existsSync(dbPath)) {
    out.line('murmur: no había memoria local que borrar.');
    return ok(out);
  }

  // Borrado real vía el store SQLite: vacía memory_items, sessions y messages.
  const store = openStore(deps, dbPath);
  try {
    await store.reset();
  } finally {
    store.close();
  }

  out.line('murmur: memoria local borrada.');
  return ok(out);
}

/** Abre (creando el directorio si falta) el store de memoria para operaciones de escritura. */
function openMemoryStore(deps: CliDeps): SqliteStore {
  mkdirSync(deps.config.baseDir(), { recursive: true });
  return openStore(deps, deps.config.dataPath('memory.db'));
}

async function cmdMemoryList(out: Output, deps: CliDeps): Promise<CliResult> {
  const dbPath = deps.config.dataPath('memory.db');
  if (!existsSync(dbPath) && deps.storeFactory === undefined) {
    out.line('murmur: no hay memoria guardada.');
    return ok(out);
  }
  const store = openMemoryStore(deps);
  try {
    const items = await store.memory.all();
    if (items.length === 0) {
      out.line('murmur: no hay memoria guardada.');
      return ok(out);
    }
    for (const item of items) {
      out.line(`${item.id}  [${item.type}]  ${item.content}`);
    }
    return ok(out);
  } finally {
    store.close();
  }
}

async function cmdMemoryAdd(out: Output, deps: CliDeps, rest: string[]): Promise<CliResult> {
  const text = rest.join(' ').trim();
  if (!text) {
    out.line('murmur: el texto de la memoria no puede estar vacío.');
    return fail(out);
  }
  const now = deps.now ?? Date.now;
  const store = openMemoryStore(deps);
  try {
    const id = randomUUID();
    await store.memory.add({
      id,
      type: 'explicit_user_memory',
      content: text,
      createdAt: now(),
    });
    out.line(`murmur: memoria guardada (${id}).`);
    return ok(out);
  } finally {
    store.close();
  }
}

async function cmdMemoryForget(out: Output, deps: CliDeps, rest: string[]): Promise<CliResult> {
  const id = rest[0];
  if (!id) {
    out.line('murmur: indica el id a olvidar: murmur memory forget <id>.');
    return fail(out);
  }
  const dbPath = deps.config.dataPath('memory.db');
  if (!existsSync(dbPath) && deps.storeFactory === undefined) {
    out.line(`murmur: no se encontró ninguna memoria con id "${id}".`);
    return fail(out);
  }
  const store = openMemoryStore(deps);
  try {
    const existing = await store.memory.get(id);
    if (existing === undefined) {
      out.line(`murmur: no se encontró ninguna memoria con id "${id}".`);
      return fail(out);
    }
    await store.memory.delete(id);
    out.line(`murmur: memoria olvidada (${id}).`);
    return ok(out);
  } finally {
    store.close();
  }
}

async function cmdMemoryExport(out: Output, deps: CliDeps, rest: string[]): Promise<CliResult> {
  const target = rest[0];
  const store = openMemoryStore(deps);
  let json: string;
  try {
    const dump = await store.exportAll();
    json = JSON.stringify(dump, null, 2);
  } finally {
    store.close();
  }

  if (target) {
    writeFileSync(target, `${json}\n`, 'utf8');
    out.line(`murmur: memoria exportada a ${target}.`);
    return ok(out);
  }

  out.line(json);
  return ok(out);
}

async function cmdMemoryPrune(out: Output, deps: CliDeps): Promise<CliResult> {
  const { retentionDays } = deps.config.load().privacy;
  if (retentionDays <= 0) {
    out.line('murmur: la retención está desactivada (retentionDays=0); no se ha podado nada.');
    out.line('  Actívala con: murmur config set-privacy retentionDays <días>');
    return ok(out);
  }

  const now = deps.now ?? Date.now;
  const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000;
  const store = openMemoryStore(deps);
  try {
    await store.pruneOlderThan(cutoff);
  } finally {
    store.close();
  }
  out.line(`murmur: aplicada la retención de ${retentionDays} días.`);
  return ok(out);
}
