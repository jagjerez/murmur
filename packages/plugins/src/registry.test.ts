import { describe, it, expect, vi } from 'vitest';
import { PluginError } from '@murmur/shared';
import { createPluginRegistry } from './registry';
import type { Plugin } from './plugin';

/** Plugin de prueba que registra los args que recibió. */
function makeEchoPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: 'echo',
    description: 'Devuelve el texto recibido',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Texto a devolver' } },
      required: ['text'],
    },
    capabilities: [],
    run: vi.fn(async (args) => ({ ok: true, output: String(args.text) })),
    ...overrides,
  };
}

describe('createPluginRegistry', () => {
  it('register + list + get exponen los plugins registrados', () => {
    const registry = createPluginRegistry({ allowed: [] });
    const echo = makeEchoPlugin();
    registry.register(echo);

    expect(registry.list()).toEqual([echo]);
    expect(registry.get('echo')).toBe(echo);
    expect(registry.get('nope')).toBeUndefined();
  });

  it('register rechaza nombres duplicados', () => {
    const registry = createPluginRegistry({ allowed: [] });
    registry.register(makeEchoPlugin());
    expect(() => registry.register(makeEchoPlugin())).toThrow(PluginError);
  });

  it('dispatch ejecuta un plugin permitido y devuelve su PluginResult', async () => {
    const registry = createPluginRegistry({ allowed: [] });
    const echo = makeEchoPlugin();
    registry.register(echo);

    const result = await registry.dispatch('echo', { text: 'hola' });
    expect(result).toEqual({ ok: true, output: 'hola' });
    expect(echo.run).toHaveBeenCalledWith({ text: 'hola' }, undefined);
  });

  it('dispatch sobre un plugin inexistente lanza PluginError', async () => {
    const registry = createPluginRegistry({ allowed: [] });
    await expect(registry.dispatch('nope', {})).rejects.toThrow(PluginError);
  });

  it('dispatch deniega un plugin cuya capacidad NO está en allowed', async () => {
    const registry = createPluginRegistry({ allowed: ['clipboard:write'] });
    const plugin = makeEchoPlugin({ name: 'opener', capabilities: ['system:open'] });
    registry.register(plugin);

    await expect(registry.dispatch('opener', { text: 'x' })).rejects.toThrowError(
      /permiso denegado/i,
    );
    await expect(registry.dispatch('opener', { text: 'x' })).rejects.toThrow(PluginError);
    expect(plugin.run).not.toHaveBeenCalled();
  });

  it('dispatch permite un plugin cuyas capacidades ⊆ allowed', async () => {
    const registry = createPluginRegistry({ allowed: ['system:open', 'clipboard:write'] });
    const plugin = makeEchoPlugin({ name: 'opener', capabilities: ['system:open'] });
    registry.register(plugin);

    const result = await registry.dispatch('opener', { text: 'ok' });
    expect(result.ok).toBe(true);
  });

  it('dispatch valida los args requeridos contra el esquema (error claro)', async () => {
    const registry = createPluginRegistry({ allowed: [] });
    const plugin = makeEchoPlugin();
    registry.register(plugin);

    await expect(registry.dispatch('echo', {})).rejects.toThrow(PluginError);
    await expect(registry.dispatch('echo', {})).rejects.toThrowError(/text/);
    expect(plugin.run).not.toHaveBeenCalled();
  });

  it('dispatch valida el tipo de los args contra el esquema', async () => {
    const registry = createPluginRegistry({ allowed: [] });
    registry.register(makeEchoPlugin());

    await expect(registry.dispatch('echo', { text: 123 })).rejects.toThrow(PluginError);
  });

  it('toToolDefinitions produce el formato del realtime', () => {
    const registry = createPluginRegistry({ allowed: [] });
    const echo = makeEchoPlugin();
    registry.register(echo);

    expect(registry.toToolDefinitions()).toEqual([
      {
        type: 'function',
        name: 'echo',
        description: 'Devuelve el texto recibido',
        parameters: echo.parameters,
      },
    ]);
  });
});
