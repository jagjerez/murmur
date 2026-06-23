import { describe, it, expect, vi } from 'vitest';
import { clipboardWritePlugin } from './clipboard';

describe('clipboardWritePlugin', () => {
  it('declara nombre, capacidad y esquema', () => {
    const plugin = clipboardWritePlugin({ clipboard: { writeText: vi.fn() } });
    expect(plugin.name).toBe('clipboard_write');
    expect(plugin.capabilities).toEqual(['clipboard:write']);
    expect(plugin.parameters.required).toEqual(['text']);
  });

  it('escribe el texto en el clipboard inyectado y devuelve ok', async () => {
    const writeText = vi.fn(async () => undefined);
    const plugin = clipboardWritePlugin({ clipboard: { writeText } });

    const result = await plugin.run({ text: 'hola mundo' });

    expect(writeText).toHaveBeenCalledWith('hola mundo');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('hola mundo');
  });

  it('si el clipboard falla devuelve ok:false con el error', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('sin acceso al portapapeles');
    });
    const plugin = clipboardWritePlugin({ clipboard: { writeText } });

    const result = await plugin.run({ text: 'x' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('sin acceso al portapapeles');
  });
});
