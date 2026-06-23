import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
});
