import { describe, it, expect, vi } from 'vitest';
import { openAppPlugin } from './open-app';

describe('openAppPlugin', () => {
  it('declara nombre, capacidad y esquema', () => {
    const plugin = openAppPlugin({ open: vi.fn() });
    expect(plugin.name).toBe('open_app');
    expect(plugin.capabilities).toEqual(['system:open']);
    expect(plugin.parameters.required).toEqual(['target']);
  });

  it('abre el target con la función open inyectada y devuelve ok', async () => {
    const open = vi.fn(async () => undefined);
    const plugin = openAppPlugin({ open });

    const result = await plugin.run({ target: 'https://example.com' });

    expect(open).toHaveBeenCalledWith('https://example.com');
    expect(result.ok).toBe(true);
    expect(result.output).toContain('https://example.com');
  });

  it('si open falla devuelve ok:false con el error', async () => {
    const open = vi.fn(async () => {
      throw new Error('no se pudo abrir');
    });
    const plugin = openAppPlugin({ open });

    const result = await plugin.run({ target: 'app://foo' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no se pudo abrir');
  });
});
