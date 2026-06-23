import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '@murmur/shared';
import { ConfigStore, DEFAULT_CONFIG, DEFAULT_PRIVACY, DEFAULT_WAKE_WORD } from './config';

describe('ConfigStore', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'murmur-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('load() devuelve defaults cuando no existe el archivo', () => {
    const store = new ConfigStore(baseDir);
    const config = store.load();
    expect(config.hotkey).toBe(DEFAULT_CONFIG.hotkey);
    expect(config.model).toBe(DEFAULT_CONFIG.model);
    expect(config.voice).toBe(DEFAULT_CONFIG.voice);
    expect(config.theme).toBe(DEFAULT_CONFIG.theme);
    expect(config.openaiApiKey).toBeUndefined();
  });

  it('expone baseDir(), path() y dataPath()', () => {
    const store = new ConfigStore(baseDir);
    expect(store.baseDir()).toBe(baseDir);
    expect(store.path()).toBe(join(baseDir, 'config.json'));
    expect(store.dataPath('memory.db')).toBe(join(baseDir, 'memory.db'));
  });

  it('roundtrip: save() persiste y load() lo recupera', () => {
    const store = new ConfigStore(baseDir);
    store.save({ hotkey: 'Ctrl+Alt+M', model: 'gpt-otro' });
    const reloaded = new ConfigStore(baseDir).load();
    expect(reloaded.hotkey).toBe('Ctrl+Alt+M');
    expect(reloaded.model).toBe('gpt-otro');
    // los no tocados conservan defaults
    expect(reloaded.voice).toBe(DEFAULT_CONFIG.voice);
  });

  it('save() crea el directorio si falta y devuelve la config combinada', () => {
    const nested = join(baseDir, 'no', 'existe');
    const store = new ConfigStore(nested);
    const merged = store.save({ theme: 'dark' });
    expect(existsSync(store.path())).toBe(true);
    expect(merged.theme).toBe('dark');
    expect(merged.hotkey).toBe(DEFAULT_CONFIG.hotkey);
  });

  it('el archivo escrito tiene permisos 0600', () => {
    const store = new ConfigStore(baseDir);
    store.save({ model: 'gpt-realtime' });
    const mode = statSync(store.path()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('chmod a 0600 incluso si el archivo ya existía con otros permisos', () => {
    mkdirSync(baseDir, { recursive: true });
    const file = join(baseDir, 'config.json');
    writeFileSync(file, '{}', { mode: 0o644 });
    const store = new ConfigStore(baseDir);
    store.save({ model: 'gpt-realtime' });
    const mode = statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('setOpenAiKey() guarda la key', () => {
    const store = new ConfigStore(baseDir);
    store.setOpenAiKey('sk-test-ABCD1234');
    expect(new ConfigStore(baseDir).load().openaiApiKey).toBe('sk-test-ABCD1234');
  });

  it('JSON malformado → ConfigError', () => {
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(join(baseDir, 'config.json'), '{', 'utf8');
    const store = new ConfigStore(baseDir);
    expect(() => store.load()).toThrow(ConfigError);
  });

  it('ignora campos desconocidos con tolerancia', () => {
    mkdirSync(baseDir, { recursive: true });
    writeFileSync(
      join(baseDir, 'config.json'),
      JSON.stringify({ hotkey: 'Ctrl+X', campoRaro: 123 }),
      'utf8',
    );
    const store = new ConfigStore(baseDir);
    const config = store.load();
    expect(config.hotkey).toBe('Ctrl+X');
    expect((config as unknown as Record<string, unknown>).campoRaro).toBeUndefined();
  });

  describe('privacy', () => {
    it('load() devuelve los defaults de privacidad', () => {
      const store = new ConfigStore(baseDir);
      const { privacy } = store.load();
      expect(privacy).toEqual(DEFAULT_PRIVACY);
      expect(privacy.localOnlyMode).toBe(false);
      expect(privacy.storeTranscripts).toBe(true);
      expect(privacy.redactBeforeStore).toBe(false);
      expect(privacy.retentionDays).toBe(0);
    });

    it('setPrivacy persiste campos individuales y conserva el resto', () => {
      const store = new ConfigStore(baseDir);
      store.setPrivacy({ localOnlyMode: true, retentionDays: 30 });
      const { privacy } = new ConfigStore(baseDir).load();
      expect(privacy.localOnlyMode).toBe(true);
      expect(privacy.retentionDays).toBe(30);
      // los no tocados mantienen default
      expect(privacy.storeTranscripts).toBe(true);
      expect(privacy.redactBeforeStore).toBe(false);
    });

    it('normaliza privacidad parcial del JSON con defaults', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ privacy: { redactBeforeStore: true } }),
        'utf8',
      );
      const { privacy } = new ConfigStore(baseDir).load();
      expect(privacy.redactBeforeStore).toBe(true);
      expect(privacy.localOnlyMode).toBe(false);
      expect(privacy.storeTranscripts).toBe(true);
      expect(privacy.retentionDays).toBe(0);
    });

    it('descarta tipos inválidos de privacidad y usa defaults', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ privacy: { localOnlyMode: 'sí', retentionDays: 'mucho' } }),
        'utf8',
      );
      const { privacy } = new ConfigStore(baseDir).load();
      expect(privacy.localOnlyMode).toBe(false);
      expect(privacy.retentionDays).toBe(0);
    });

    it('retentionDays negativo se normaliza a 0', () => {
      const store = new ConfigStore(baseDir);
      store.setPrivacy({ retentionDays: -5 });
      expect(new ConfigStore(baseDir).load().privacy.retentionDays).toBe(0);
    });
  });

  describe('transcription', () => {
    it('default es realtime', () => {
      const store = new ConfigStore(baseDir);
      expect(store.load().transcription).toBe('realtime');
      expect(DEFAULT_CONFIG.transcription).toBe('realtime');
    });

    it('setTranscription persiste un modo válido', () => {
      const store = new ConfigStore(baseDir);
      store.setTranscription('whisper-api');
      expect(new ConfigStore(baseDir).load().transcription).toBe('whisper-api');
    });

    it('setTranscription con modo inválido → ConfigError y no persiste', () => {
      const store = new ConfigStore(baseDir);
      expect(() => store.setTranscription('foo' as never)).toThrow(ConfigError);
      expect(new ConfigStore(baseDir).load().transcription).toBe('realtime');
    });

    it('normaliza un transcription válido del JSON', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ transcription: 'local-whisper' }),
        'utf8',
      );
      expect(new ConfigStore(baseDir).load().transcription).toBe('local-whisper');
    });

    it('descarta transcription inválido del JSON y usa default', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ transcription: 'no-existe' }),
        'utf8',
      );
      expect(new ConfigStore(baseDir).load().transcription).toBe('realtime');
    });
  });

  describe('wakeWord', () => {
    it('load() devuelve los defaults del wake word', () => {
      const store = new ConfigStore(baseDir);
      const { wakeWord } = store.load();
      expect(wakeWord).toEqual(DEFAULT_WAKE_WORD);
      expect(wakeWord.enabled).toBe(false);
      expect(wakeWord.phrase).toBe('hey murmur');
      expect(wakeWord.sensitivity).toBe(0.5);
    });

    it('setWakeWord persiste enabled y conserva el resto', () => {
      const store = new ConfigStore(baseDir);
      store.setWakeWord({ enabled: true });
      const { wakeWord } = new ConfigStore(baseDir).load();
      expect(wakeWord.enabled).toBe(true);
      expect(wakeWord.phrase).toBe('hey murmur');
      expect(wakeWord.sensitivity).toBe(0.5);
    });

    it('setWakeWord normaliza la frase (minúsculas/trim/espacios)', () => {
      const store = new ConfigStore(baseDir);
      store.setWakeWord({ phrase: '  Hola   Murmur  ' });
      expect(new ConfigStore(baseDir).load().wakeWord.phrase).toBe('hola murmur');
    });

    it('setWakeWord persiste sensitivity válida', () => {
      const store = new ConfigStore(baseDir);
      store.setWakeWord({ sensitivity: 0.8 });
      expect(new ConfigStore(baseDir).load().wakeWord.sensitivity).toBe(0.8);
    });

    it('setWakeWord con frase vacía → ConfigError y no persiste', () => {
      const store = new ConfigStore(baseDir);
      expect(() => store.setWakeWord({ phrase: '   ' })).toThrow(ConfigError);
      expect(new ConfigStore(baseDir).load().wakeWord.phrase).toBe('hey murmur');
    });

    it('setWakeWord con sensitivity fuera de [0,1] → ConfigError y no persiste', () => {
      const store = new ConfigStore(baseDir);
      expect(() => store.setWakeWord({ sensitivity: 1.5 })).toThrow(ConfigError);
      expect(() => store.setWakeWord({ sensitivity: -0.1 })).toThrow(ConfigError);
      expect(new ConfigStore(baseDir).load().wakeWord.sensitivity).toBe(0.5);
    });

    it('normaliza wakeWord parcial del JSON con defaults', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ wakeWord: { enabled: true } }),
        'utf8',
      );
      const { wakeWord } = new ConfigStore(baseDir).load();
      expect(wakeWord.enabled).toBe(true);
      expect(wakeWord.phrase).toBe('hey murmur');
      expect(wakeWord.sensitivity).toBe(0.5);
    });

    it('descarta tipos inválidos del JSON y usa defaults; sensitivity se satura a [0,1]', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ wakeWord: { enabled: 'sí', phrase: 42, sensitivity: 9 } }),
        'utf8',
      );
      const { wakeWord } = new ConfigStore(baseDir).load();
      expect(wakeWord.enabled).toBe(false);
      expect(wakeWord.phrase).toBe('hey murmur');
      expect(wakeWord.sensitivity).toBe(1);
    });

    it('normaliza la frase del JSON; frase en blanco cae a default', () => {
      mkdirSync(baseDir, { recursive: true });
      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ wakeWord: { phrase: '  Oye   Murmur ' } }),
        'utf8',
      );
      expect(new ConfigStore(baseDir).load().wakeWord.phrase).toBe('oye murmur');

      writeFileSync(
        join(baseDir, 'config.json'),
        JSON.stringify({ wakeWord: { phrase: '   ' } }),
        'utf8',
      );
      expect(new ConfigStore(baseDir).load().wakeWord.phrase).toBe('hey murmur');
    });
  });
});
