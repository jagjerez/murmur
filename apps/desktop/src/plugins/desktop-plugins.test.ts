import { describe, it, expect, vi } from 'vitest';
import { createDesktopToolHost } from './desktop-plugins';

function host() {
  return createDesktopToolHost({
    clipboard: { writeText: vi.fn(async () => undefined) },
    open: vi.fn(async () => undefined),
    now: () => 0,
  });
}

describe('createDesktopToolHost', () => {
  it('expone tool-defs de los 3 plugins de ejemplo', () => {
    const h = host();
    const names = h.tools.map((t) => t.name).sort();
    expect(names).toEqual(['clipboard_write', 'current_time', 'open_app']);
    expect(h.tools.every((t) => t.type === 'function')).toBe(true);
  });

  it('dispatchTool ejecuta el plugin permitido y devuelve su output', async () => {
    const writeText = vi.fn(async () => undefined);
    const h = createDesktopToolHost({ clipboard: { writeText }, open: vi.fn(), now: () => 0 });
    const out = await h.dispatchTool('clipboard_write', { text: 'hola' });
    expect(writeText).toHaveBeenCalledWith('hola');
    expect(out).toContain('hola');
  });

  it('current_time usa el now inyectado', async () => {
    const out = await host().dispatchTool('current_time', {});
    expect(out).toBe(new Date(0).toISOString());
  });

  it('una tool desconocida devuelve el mensaje de error (no lanza)', async () => {
    const out = await host().dispatchTool('no_existe', {});
    expect(out).toMatch(/no está registrado/i);
  });

  it('args inválidos (falta requerido) devuelven el error como texto (no lanza)', async () => {
    // clipboard_write requiere `text`; sin él, el registry lanza PluginError → se devuelve como texto.
    const out = await host().dispatchTool('clipboard_write', {});
    expect(out).toMatch(/falta el argumento/i);
  });
});
