import { describe, it, expect, afterEach, vi } from 'vitest';
import type { HotkeyManager } from '@murmur/core';
import { isTauri, createTauriHotkeyManager } from './tauri-hotkey-manager';

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
});

describe('isTauri', () => {
  it('es false sin runtime Tauri (jsdom/navegador)', () => {
    expect(isTauri()).toBe(false);
  });

  it('es true cuando window.__TAURI_INTERNALS__ está presente', () => {
    (globalThis as { window?: unknown }).window = { __TAURI_INTERNALS__: {} };
    expect(isTauri()).toBe(true);
  });
});

describe('createTauriHotkeyManager (fuera de Tauri)', () => {
  it('degrada a no-op seguro sin lanzar', async () => {
    const hk: HotkeyManager = createTauriHotkeyManager();
    await expect(hk.register('CommandOrControl+Shift+Space', () => {})).resolves.toBeUndefined();
    await expect(hk.unregister('CommandOrControl+Shift+Space')).resolves.toBeUndefined();
    await expect(hk.unregisterAll()).resolves.toBeUndefined();
  });

  it('valida el acelerador antes de degradar (lanza HotkeyError si es inválido)', async () => {
    const hk = createTauriHotkeyManager();
    await expect(hk.register('Foo+', () => {})).rejects.toThrow();
  });
});
