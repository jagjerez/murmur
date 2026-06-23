import { describe, it, expect } from 'vitest';
import { createMockConfigClient, redactKey } from './config-client';

describe('redactKey', () => {
  it('nunca devuelve la key completa', () => {
    const full = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
    const redacted = redactKey(full);
    expect(redacted).not.toBe(full);
    expect(redacted).not.toContain('abcdefghijkl');
  });

  it('muestra solo un sufijo corto para reconocerla', () => {
    expect(redactKey('sk-1234567890ABCD')).toMatch(/ABCD$/);
    expect(redactKey('sk-1234567890ABCD')).toContain('…');
  });

  it('redacta claves cortas por completo sin filtrar caracteres', () => {
    expect(redactKey('abc')).not.toContain('abc');
  });

  it('cadena vacía no produce redacción', () => {
    expect(redactKey('')).toBe('');
  });
});

describe('createMockConfigClient', () => {
  it('arranca sin API key', async () => {
    const client = createMockConfigClient();
    const view = await client.get();
    expect(view.hasApiKey).toBe(false);
    expect(view.apiKeyHint).toBeUndefined();
  });

  it('setOpenAiKey marca hasApiKey y NO expone la key completa', async () => {
    const client = createMockConfigClient();
    const secret = 'sk-proj-SUPERSECRETVALUE0123456789';
    await client.setOpenAiKey(secret);

    const view = await client.get();
    expect(view.hasApiKey).toBe(true);
    // La vista NUNCA debe contener la key completa.
    expect(JSON.stringify(view)).not.toContain(secret);
    expect(view.apiKeyHint).toBeDefined();
    expect(view.apiKeyHint).not.toBe(secret);
  });

  it('borrar la key (cadena vacía) deja hasApiKey en false', async () => {
    const client = createMockConfigClient({ apiKey: 'sk-something-here-xyz' });
    expect((await client.get()).hasApiKey).toBe(true);
    await client.setOpenAiKey('');
    const view = await client.get();
    expect(view.hasApiKey).toBe(false);
    expect(view.apiKeyHint).toBeUndefined();
  });

  it('los setters persisten en memoria entre llamadas a get', async () => {
    const client = createMockConfigClient();

    await client.setHotkey('CommandOrControl+Shift+M');
    await client.setVoice('verse');
    await client.setModel('gpt-realtime');
    await client.setTheme('light');

    const view = await client.get();
    expect(view.hotkey).toBe('CommandOrControl+Shift+M');
    expect(view.voice).toBe('verse');
    expect(view.model).toBe('gpt-realtime');
    expect(view.theme).toBe('light');
  });

  it('respeta los valores iniciales', async () => {
    const client = createMockConfigClient({
      apiKey: 'sk-init-key-abcdef',
      hotkey: 'Control+Alt+K',
      voice: 'sol',
      model: 'gpt-realtime-mini',
      theme: 'dark',
    });
    const view = await client.get();
    expect(view.hasApiKey).toBe(true);
    expect(view.hotkey).toBe('Control+Alt+K');
    expect(view.voice).toBe('sol');
    expect(view.model).toBe('gpt-realtime-mini');
    expect(view.theme).toBe('dark');
  });

  it('expone la key completa solo vía readApiKey (uso interno, nunca al render)', async () => {
    const client = createMockConfigClient();
    const secret = 'sk-proj-readable-internal-9999';
    await client.setOpenAiKey(secret);
    expect(await client.readApiKey()).toBe(secret);
  });

  it('readApiKey devuelve undefined si no hay key', async () => {
    const client = createMockConfigClient();
    expect(await client.readApiKey()).toBeUndefined();
  });
});
