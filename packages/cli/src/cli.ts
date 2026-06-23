import { existsSync } from 'node:fs';
import { ConfigError } from '@murmur/shared';
import { createSqliteStore, type SqliteStore } from '@murmur/rag';
import type { ConfigStore, MurmurConfig } from './config';

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

    default:
      out.line(`murmur: subcomando de config desconocido "${sub}". Usa "murmur help".`);
      return fail(out);
  }
}

function showConfig(out: Output, config: MurmurConfig): CliResult {
  out.line(`API key:  ${redactKey(config.openaiApiKey)}`);
  out.line(`Hotkey:   ${config.hotkey}`);
  out.line(`Modelo:   ${config.model}`);
  out.line(`Voz:      ${config.voice}`);
  out.line(`Tema:     ${config.theme}`);
  return ok(out);
}

async function cmdMemory(
  out: Output,
  deps: CliDeps,
  sub: string | undefined,
  rest: string[],
): Promise<CliResult> {
  if (sub !== 'reset') {
    out.line(`murmur: subcomando de memory desconocido "${sub ?? ''}". Usa "murmur help".`);
    return fail(out);
  }

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
