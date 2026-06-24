import { describe, it, expect, vi } from 'vitest';
import { MODEL_CATALOG, downloadModel } from './models';

describe('model catalog', () => {
  it('incluye whisper-large-v3 con url y tamaño', () => {
    const entry = MODEL_CATALOG['whisper-large-v3'];
    expect(entry).toBeDefined();
    expect(entry!.url).toMatch(/^https:\/\//);
    expect(entry!.file).toMatch(/\.bin$/);
  });
});

describe('downloadModel', () => {
  it('descarga al destino con fetch y fs inyectados', async () => {
    const written: { path: string; bytes: number }[] = [];
    const fetchFn = (async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
      })) as unknown as typeof globalThis.fetch;
    const dest = await downloadModel('whisper-large-v3', {
      dir: '/tmp/m',
      fetchFn,
      writeFile: async (path: string, data: Uint8Array) => {
        written.push({ path, bytes: data.length });
      },
      exists: () => false,
    });
    expect(dest).toContain('ggml-large-v3.bin');
    expect(written[0]!.bytes).toBe(3);
  });

  it('si ya existe no re-descarga', async () => {
    const fetchFn = vi.fn();
    const dest = await downloadModel('whisper-large-v3', {
      dir: '/tmp/m',
      fetchFn: fetchFn as unknown as typeof globalThis.fetch,
      writeFile: async () => {},
      exists: () => true,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(dest).toContain('ggml-large-v3.bin');
  });

  it('nombre desconocido lanza error claro', async () => {
    await expect(downloadModel('no-existe', { dir: '/tmp/m' })).rejects.toThrow(
      /desconocido|unknown/i,
    );
  });

  it('estado HTTP no-ok lanza error', async () => {
    const fetchFn = (async () =>
      new Response('x', { status: 404 })) as unknown as typeof globalThis.fetch;
    await expect(
      downloadModel('whisper-large-v3', {
        dir: '/tmp/m',
        fetchFn,
        writeFile: async () => {},
        exists: () => false,
      }),
    ).rejects.toThrow(/404|descarg/i);
  });
});
