import { describe, it, expect, vi } from 'vitest';
import { HotkeyError } from '@murmur/shared';
import { parseAccelerator, createMemoryHotkeyManager } from './hotkey';

describe('parseAccelerator', () => {
  it('parsea y normaliza a forma canónica', () => {
    const acc = parseAccelerator('cmdorctrl+shift+space');
    expect(acc.modifiers).toEqual(['CommandOrControl', 'Shift']);
    expect(acc.key).toBe('Space');
  });

  it('normaliza alias y mayúsculas de los modificadores y ordena canónicamente', () => {
    const acc = parseAccelerator('Shift+Alt+Control+k');
    // Orden canónico: CommandOrControl, Control, Alt, Shift, Super.
    expect(acc.modifiers).toEqual(['Control', 'Alt', 'Shift']);
    expect(acc.key).toBe('K');
  });

  it('option → Alt, meta → Super, ctrl → Control, cmdorctrl → CommandOrControl', () => {
    const acc = parseAccelerator('cmdorctrl+option+meta+a');
    expect(acc.modifiers).toEqual(['CommandOrControl', 'Alt', 'Super']);
    expect(acc.key).toBe('A');
  });

  it('acepta una sola tecla sin modificadores', () => {
    const acc = parseAccelerator('F1');
    expect(acc.modifiers).toEqual([]);
    expect(acc.key).toBe('F1');
  });

  it('rechaza la cadena vacía', () => {
    expect(() => parseAccelerator('')).toThrow(HotkeyError);
    expect(() => parseAccelerator('   ')).toThrow(HotkeyError);
  });

  it('rechaza si falta la tecla final', () => {
    expect(() => parseAccelerator('Shift+')).toThrow(HotkeyError);
    expect(() => parseAccelerator('Ctrl+Shift')).toThrow(HotkeyError);
  });

  it('rechaza un modificador desconocido', () => {
    expect(() => parseAccelerator('Foo+A')).toThrow(HotkeyError);
  });

  it('rechaza modificadores duplicados (incluyendo alias equivalentes)', () => {
    expect(() => parseAccelerator('Ctrl+Ctrl+A')).toThrow(HotkeyError);
    expect(() => parseAccelerator('Ctrl+Control+A')).toThrow(HotkeyError);
  });
});

describe('createMemoryHotkeyManager', () => {
  it('register + trigger llama al handler', async () => {
    const hk = createMemoryHotkeyManager();
    const handler = vi.fn();
    await hk.register('CommandOrControl+Shift+Space', handler);
    expect(hk.registered()).toContain('CommandOrControl+Shift+Space');
    hk.trigger('CommandOrControl+Shift+Space');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('normaliza el acelerador: registrar y disparar con formas equivalentes', async () => {
    const hk = createMemoryHotkeyManager();
    const handler = vi.fn();
    await hk.register('cmdorctrl+shift+space', handler);
    // Disparar con otra forma equivalente debe llamar al handler.
    hk.trigger('CommandOrControl+Shift+Space');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('unregister deja de llamar al handler', async () => {
    const hk = createMemoryHotkeyManager();
    const handler = vi.fn();
    await hk.register('Alt+K', handler);
    await hk.unregister('Alt+K');
    expect(hk.registered()).not.toContain('Alt+K');
    hk.trigger('Alt+K');
    expect(handler).not.toHaveBeenCalled();
  });

  it('unregisterAll limpia todos los registros', async () => {
    const hk = createMemoryHotkeyManager();
    const a = vi.fn();
    const b = vi.fn();
    await hk.register('Alt+A', a);
    await hk.register('Alt+B', b);
    await hk.unregisterAll();
    expect(hk.registered()).toEqual([]);
    hk.trigger('Alt+A');
    hk.trigger('Alt+B');
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('registrar un acelerador inválido lanza HotkeyError', async () => {
    const hk = createMemoryHotkeyManager();
    await expect(hk.register('Foo+', vi.fn())).rejects.toBeInstanceOf(HotkeyError);
  });

  it('trigger de un acelerador no registrado no lanza', () => {
    const hk = createMemoryHotkeyManager();
    expect(() => hk.trigger('Alt+Z')).not.toThrow();
  });
});
