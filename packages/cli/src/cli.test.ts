import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStore } from '@murmur/rag';
import { run, VERSION } from './cli';
import { ConfigStore } from './config';

describe('cli run', () => {
  let baseDir: string;
  let config: ConfigStore;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'murmur-'));
    config = new ConfigStore(baseDir);
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  describe('versión y ayuda', () => {
    it('VERSION es 0.1.0', () => {
      expect(VERSION).toBe('0.1.0');
    });

    it('--version devuelve la versión con exitCode 0', async () => {
      const { stdout, exitCode } = await run(['--version'], { config });
      expect(stdout).toContain(VERSION);
      expect(exitCode).toBe(0);
    });

    it('-v devuelve la versión', async () => {
      const { stdout, exitCode } = await run(['-v'], { config });
      expect(stdout).toContain(VERSION);
      expect(exitCode).toBe(0);
    });

    it('sin args muestra la ayuda con los comandos reales', async () => {
      const { stdout, exitCode } = await run([], { config });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('start');
      expect(stdout).toContain('config');
      expect(stdout).toContain('status');
      expect(stdout).toContain('memory');
    });

    it('help y --help muestran la ayuda', async () => {
      expect((await run(['help'], { config })).stdout).toContain('start');
      expect((await run(['--help'], { config })).stdout).toContain('start');
    });

    it('comando desconocido → exitCode 1 con sugerencia', async () => {
      const { stdout, exitCode } = await run(['frobnicate'], { config });
      expect(exitCode).toBe(1);
      expect(stdout).toContain('desconocido');
      expect(stdout).toContain('help');
    });
  });

  describe('config set-openai-key / config', () => {
    it('guarda la key y la muestra redactada (nunca completa)', async () => {
      const key = 'sk-test-ABCDEFGH1234';
      const setRes = await run(['config', 'set-openai-key', key], { config });
      expect(setRes.exitCode).toBe(0);
      expect(setRes.stdout).not.toContain(key);
      expect(setRes.stdout).toContain('1234');

      const { stdout, exitCode } = await run(['config'], { config });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('sk-…1234');
      expect(stdout).not.toContain(key);
      // persistido
      expect(config.load().openaiApiKey).toBe(key);
    });

    it('key vacía → exitCode 1 y no persiste', async () => {
      const { exitCode } = await run(['config', 'set-openai-key', ''], { config });
      expect(exitCode).toBe(1);
      expect(config.load().openaiApiKey).toBeUndefined();
    });

    it('set-openai-key sin argumento → exitCode 1', async () => {
      const { exitCode } = await run(['config', 'set-openai-key'], { config });
      expect(exitCode).toBe(1);
    });

    it('config sin key muestra (no configurada)', async () => {
      const { stdout, exitCode } = await run(['config'], { config });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('no configurada');
    });

    it('config subcomando desconocido → exitCode 1', async () => {
      const { exitCode } = await run(['config', 'frobnicate'], { config });
      expect(exitCode).toBe(1);
    });
  });

  describe('config set-hotkey', () => {
    it('persiste el hotkey y config lo refleja', async () => {
      const setRes = await run(['config', 'set-hotkey', 'Ctrl+Alt+M'], { config });
      expect(setRes.exitCode).toBe(0);
      expect(config.load().hotkey).toBe('Ctrl+Alt+M');

      const { stdout } = await run(['config'], { config });
      expect(stdout).toContain('Ctrl+Alt+M');
    });

    it('combo vacío → exitCode 1', async () => {
      const { exitCode } = await run(['config', 'set-hotkey', ''], { config });
      expect(exitCode).toBe(1);
    });
  });

  describe('config set-transcription', () => {
    it('persiste el modo y config lo refleja', async () => {
      const setRes = await run(['config', 'set-transcription', 'whisper-api'], { config });
      expect(setRes.exitCode).toBe(0);
      expect(config.load().transcription).toBe('whisper-api');

      const { stdout } = await run(['config'], { config });
      expect(stdout).toContain('whisper-api');
    });

    it('modo inválido → exitCode 1 y no persiste', async () => {
      const { exitCode } = await run(['config', 'set-transcription', 'foo'], { config });
      expect(exitCode).toBe(1);
      expect(config.load().transcription).toBe('realtime');
    });

    it('sin argumento → exitCode 1', async () => {
      const { exitCode } = await run(['config', 'set-transcription'], { config });
      expect(exitCode).toBe(1);
    });

    it('config muestra el modo por defecto realtime', async () => {
      const { stdout } = await run(['config'], { config });
      expect(stdout.toLowerCase()).toContain('transcrip');
      expect(stdout).toContain('realtime');
    });

    it('status muestra el modo de transcripción', async () => {
      config.setTranscription('local-whisper');
      const { stdout } = await run(['status'], { config });
      expect(stdout.toLowerCase()).toContain('transcrip');
      expect(stdout).toContain('local-whisper');
    });
  });

  describe('status', () => {
    it('sin key → no configurada, incluye versión y rutas', async () => {
      const { stdout, exitCode } = await run(['status'], { config });
      expect(exitCode).toBe(0);
      expect(stdout).toContain(VERSION);
      expect(stdout).toContain(config.path());
      expect(stdout).toContain('no');
    });

    it('con key → configurada, sin revelar la key', async () => {
      const key = 'sk-test-ABCDEFGH1234';
      config.setOpenAiKey(key);
      const { stdout, exitCode } = await run(['status'], { config });
      expect(exitCode).toBe(0);
      expect(stdout).not.toContain(key);
      expect(stdout.toLowerCase()).toContain('sí');
    });

    it('sin db de memoria → 0 elementos', async () => {
      const { stdout, exitCode } = await run(['status'], { config });
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain('memoria:');
      expect(stdout).toContain('0 elementos');
    });

    it('con items en la db → N elementos', async () => {
      const dbPath = config.dataPath('memory.db');
      const store = createSqliteStore(dbPath);
      await store.memory.add({ id: 'a', type: 'short_term', content: 'uno', createdAt: 1 });
      await store.memory.add({ id: 'b', type: 'long_term_fact', content: 'dos', createdAt: 2 });
      store.close();

      const { stdout, exitCode } = await run(['status'], { config });
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain('memoria:');
      expect(stdout).toContain('2 elementos');
    });
  });

  describe('start', () => {
    it('sin key → exitCode 1 mencionando set-openai-key', async () => {
      const { stdout, exitCode } = await run(['start'], { config });
      expect(exitCode).toBe(1);
      expect(stdout).toContain('set-openai-key');
    });

    it('con key → exitCode 0', async () => {
      config.setOpenAiKey('sk-test-ABCDEFGH1234');
      const { exitCode } = await run(['start'], { config });
      expect(exitCode).toBe(0);
    });
  });

  describe('memory reset', () => {
    function seedMemory(): string {
      const dbPath = config.dataPath('memory.db');
      const store = createSqliteStore(dbPath);
      // de forma síncrona para el seed del test
      void store.memory.add({ id: 'a', type: 'short_term', content: 'uno', createdAt: 1 });
      void store.memory.add({ id: 'b', type: 'short_term', content: 'dos', createdAt: 2 });
      store.close();
      return dbPath;
    }

    it('sin --yes conserva la memoria y exitCode 0', async () => {
      seedMemory();
      const { stdout, exitCode } = await run(['memory', 'reset'], { config });
      expect(exitCode).toBe(0);
      expect(stdout).toContain('--yes');

      const status = await run(['status'], { config });
      expect(status.stdout).toContain('2 elementos');
    });

    it('con --yes deja la memoria vacía (count 0)', async () => {
      seedMemory();
      const { exitCode } = await run(['memory', 'reset', '--yes'], { config });
      expect(exitCode).toBe(0);

      const status = await run(['status'], { config });
      expect(status.stdout).toContain('0 elementos');
    });

    it('con --yes sin db → exitCode 0 e informa', async () => {
      const { stdout, exitCode } = await run(['memory', 'reset', '--yes'], { config });
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      // tras un reset sobre db inexistente, la memoria sigue a 0
      const status = await run(['status'], { config });
      expect(status.stdout).toContain('0 elementos');
    });

    it('memory subcomando desconocido → exitCode 1', async () => {
      const { exitCode } = await run(['memory', 'frobnicate'], { config });
      expect(exitCode).toBe(1);
    });
  });

  describe('config muestra privacidad', () => {
    it('config sin args muestra los flags de privacidad con sus defaults', async () => {
      const { stdout, exitCode } = await run(['config'], { config });
      expect(exitCode).toBe(0);
      expect(stdout.toLowerCase()).toContain('privacidad');
      expect(stdout.toLowerCase()).toContain('local');
      expect(stdout.toLowerCase()).toContain('transcrip');
      expect(stdout.toLowerCase()).toContain('redac');
      expect(stdout.toLowerCase()).toContain('reten');
    });

    it('set-privacy persiste un booleano y config lo refleja', async () => {
      const setRes = await run(['config', 'set-privacy', 'localOnlyMode', 'true'], { config });
      expect(setRes.exitCode).toBe(0);
      expect(config.load().privacy.localOnlyMode).toBe(true);
    });

    it('set-privacy persiste retentionDays como número', async () => {
      const setRes = await run(['config', 'set-privacy', 'retentionDays', '30'], { config });
      expect(setRes.exitCode).toBe(0);
      expect(config.load().privacy.retentionDays).toBe(30);
    });

    it('set-privacy con campo desconocido → exitCode 1', async () => {
      const { exitCode } = await run(['config', 'set-privacy', 'noExiste', 'true'], { config });
      expect(exitCode).toBe(1);
    });

    it('set-privacy con valor inválido para booleano → exitCode 1', async () => {
      const { exitCode } = await run(['config', 'set-privacy', 'localOnlyMode', 'quizás'], {
        config,
      });
      expect(exitCode).toBe(1);
    });
  });

  describe('memory gestión explícita', () => {
    // Store en memoria compartido entre llamadas a run(): simula la persistencia
    // del fichero sin tocar disco. `now` fijo para createdAt deterministas.
    function sharedStore(): { factory: () => ReturnType<typeof createSqliteStore> } {
      let store: ReturnType<typeof createSqliteStore> | undefined;
      return {
        factory(): ReturnType<typeof createSqliteStore> {
          store ??= createSqliteStore(':memory:', () => 1000);
          // El CLI cierra el store con .close(); lo neutralizamos para reusarlo.
          return new Proxy(store, {
            get(target, prop) {
              if (prop === 'close') {
                return () => undefined;
              }
              return Reflect.get(target, prop) as unknown;
            },
          }) as ReturnType<typeof createSqliteStore>;
        },
      };
    }

    it('memory add crea explicit_user_memory y memory list lo muestra', async () => {
      const { factory } = sharedStore();
      const deps = { config, storeFactory: factory };

      const add = await run(['memory', 'add', 'me gusta el café por la mañana'], deps);
      expect(add.exitCode).toBe(0);

      const list = await run(['memory', 'list'], deps);
      expect(list.exitCode).toBe(0);
      expect(list.stdout).toContain('me gusta el café por la mañana');
    });

    it('memory add sin texto → exitCode 1', async () => {
      const { factory } = sharedStore();
      const { exitCode } = await run(['memory', 'add'], { config, storeFactory: factory });
      expect(exitCode).toBe(1);
    });

    it('memory list vacía informa que no hay memoria', async () => {
      const { factory } = sharedStore();
      const { stdout, exitCode } = await run(['memory', 'list'], { config, storeFactory: factory });
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    });

    it('memory forget <id> borra el item', async () => {
      const { factory } = sharedStore();
      const deps = { config, storeFactory: factory };

      await run(['memory', 'add', 'dato a olvidar'], deps);
      const list = await run(['memory', 'list'], deps);
      // El id aparece en el listado; lo extraemos del store directamente.
      const store = factory();
      const items = await store.memory.all();
      const id = items[0]?.id ?? '';
      expect(id).toBeTruthy();
      expect(list.stdout).toContain('dato a olvidar');

      const forget = await run(['memory', 'forget', id], deps);
      expect(forget.exitCode).toBe(0);
      expect(await factory().memory.count()).toBe(0);
    });

    it('memory forget de un id inexistente → exitCode 1', async () => {
      const { factory } = sharedStore();
      const { exitCode } = await run(['memory', 'forget', 'nope'], {
        config,
        storeFactory: factory,
      });
      expect(exitCode).toBe(1);
    });

    it('memory forget sin id → exitCode 1', async () => {
      const { factory } = sharedStore();
      const { exitCode } = await run(['memory', 'forget'], { config, storeFactory: factory });
      expect(exitCode).toBe(1);
    });

    it('memory export a stdout produce JSON con memory, sessions y messages', async () => {
      const { factory } = sharedStore();
      const deps = { config, storeFactory: factory };
      await run(['memory', 'add', 'recuerda esto'], deps);

      const { stdout, exitCode } = await run(['memory', 'export'], deps);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout) as {
        memory: unknown[];
        sessions: unknown[];
        messages: unknown[];
      };
      expect(Array.isArray(parsed.memory)).toBe(true);
      expect(Array.isArray(parsed.sessions)).toBe(true);
      expect(Array.isArray(parsed.messages)).toBe(true);
      expect(parsed.memory).toHaveLength(1);
    });

    it('memory export <ruta> escribe el JSON en el fichero', async () => {
      const { factory } = sharedStore();
      const deps = { config, storeFactory: factory };
      await run(['memory', 'add', 'al fichero'], deps);

      const target = join(baseDir, 'export.json');
      const { exitCode } = await run(['memory', 'export', target], deps);
      expect(exitCode).toBe(0);
      expect(existsSync(target)).toBe(true);
      const parsed = JSON.parse(readFileSync(target, 'utf8')) as { memory: unknown[] };
      expect(parsed.memory).toHaveLength(1);
    });

    it('memory prune aplica retentionDays y borra lo anterior al umbral', async () => {
      // Store con items viejo (created_at 0) y nuevo (created_at lejano).
      let store: ReturnType<typeof createSqliteStore> | undefined;
      const factory = (): ReturnType<typeof createSqliteStore> => {
        store ??= createSqliteStore(':memory:', () => Date.now());
        return new Proxy(store, {
          get(target, prop) {
            if (prop === 'close') return () => undefined;
            return Reflect.get(target, prop) as unknown;
          },
        }) as ReturnType<typeof createSqliteStore>;
      };
      const realStore = factory();
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      await realStore.memory.add({
        id: 'viejo',
        type: 'explicit_user_memory',
        content: 'antiguo',
        createdAt: now - 60 * dayMs,
      });
      await realStore.memory.add({
        id: 'nuevo',
        type: 'explicit_user_memory',
        content: 'reciente',
        createdAt: now,
      });

      config.setPrivacy({ retentionDays: 30 });
      const prune = await run(['memory', 'prune'], {
        config,
        storeFactory: factory,
        now: () => now,
      });
      expect(prune.exitCode).toBe(0);

      const remaining = (await factory().memory.all()).map((m) => m.id);
      expect(remaining).toEqual(['nuevo']);
    });

    it('memory prune sin retención (0) informa y no borra', async () => {
      let store: ReturnType<typeof createSqliteStore> | undefined;
      const factory = (): ReturnType<typeof createSqliteStore> => {
        store ??= createSqliteStore(':memory:', () => Date.now());
        return new Proxy(store, {
          get(target, prop) {
            if (prop === 'close') return () => undefined;
            return Reflect.get(target, prop) as unknown;
          },
        }) as ReturnType<typeof createSqliteStore>;
      };
      await factory().memory.add({
        id: 'a',
        type: 'explicit_user_memory',
        content: 'queda',
        createdAt: Date.now(),
      });

      const { stdout, exitCode } = await run(['memory', 'prune'], {
        config,
        storeFactory: factory,
      });
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(await factory().memory.count()).toBe(1);
    });
  });
});
