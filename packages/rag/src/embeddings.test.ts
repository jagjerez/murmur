import { describe, it, expect, vi } from 'vitest';
import { ModelError } from '@murmur/shared';
import { createMockEmbeddingProvider, createOpenAIEmbeddingProvider } from './embeddings';

function norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

describe('createMockEmbeddingProvider', () => {
  it('tiene un id estable', () => {
    const p = createMockEmbeddingProvider();
    expect(p.id).toBe('mock');
  });

  it('es determinista: mismo texto → mismo vector', async () => {
    const p = createMockEmbeddingProvider();
    const [a] = await p.embed(['hola mundo']);
    const [b] = await p.embed(['hola mundo']);
    expect(a).toEqual(b);
  });

  it('devuelve un vector por cada texto de entrada', async () => {
    const p = createMockEmbeddingProvider();
    const vs = await p.embed(['uno', 'dos', 'tres']);
    expect(vs).toHaveLength(3);
  });

  it('produce vectores normalizados (norma ≈ 1)', async () => {
    const p = createMockEmbeddingProvider();
    const [v] = await p.embed(['cualquier texto no vacío']);
    expect(norm(v!)).toBeCloseTo(1, 5);
  });

  it('respeta la dimensión por defecto (64) y la configurable', async () => {
    const def = createMockEmbeddingProvider();
    const [vd] = await def.embed(['x']);
    expect(vd).toHaveLength(64);

    const small = createMockEmbeddingProvider({ dim: 8 });
    const [vs] = await small.embed(['x']);
    expect(vs).toHaveLength(8);
  });

  it('textos distintos → vectores distintos', async () => {
    const p = createMockEmbeddingProvider();
    const [a] = await p.embed(['gatos']);
    const [b] = await p.embed(['economía cuántica']);
    expect(a).not.toEqual(b);
  });

  it('textos que comparten tokens comparten componentes (similares > disímiles)', async () => {
    const p = createMockEmbeddingProvider();
    const { cosineSimilarity } = await import('./vector');
    const [q] = await p.embed(['el perro corre por el parque']);
    const [near] = await p.embed(['el perro corre rápido']);
    const [far] = await p.embed(['integrales de contorno en física']);
    expect(cosineSimilarity(q!, near!)).toBeGreaterThan(cosineSimilarity(q!, far!));
  });
});

describe('createOpenAIEmbeddingProvider', () => {
  function okResponse(embeddings: number[][]): Response {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: embeddings.map((embedding, index) => ({ embedding, index })),
        }),
    } as unknown as Response;
  }

  it('id refleja "openai" y el modelo', () => {
    const p = createOpenAIEmbeddingProvider({ apiKey: 'sk-test-fake', fetchFn: vi.fn() });
    expect(p.id).toContain('openai');
  });

  it('hace POST a /v1/embeddings con Authorization Bearer y body {model, input}', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse([[1, 2, 3]]));
    const p = createOpenAIEmbeddingProvider({
      apiKey: 'sk-test-fake-key',
      model: 'text-embedding-3-large',
      fetchFn,
    });

    const out = await p.embed(['hola']);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test-fake-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as { model: string; input: string[] };
    expect(body.model).toBe('text-embedding-3-large');
    expect(body.input).toEqual(['hola']);
    expect(out).toEqual([[1, 2, 3]]);
  });

  it('usa text-embedding-3-small por defecto', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse([[0, 0]]));
    const p = createOpenAIEmbeddingProvider({ apiKey: 'sk-test-fake', fetchFn });
    await p.embed(['x']);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('text-embedding-3-small');
  });

  it('parsea data[].embedding en orden por index', async () => {
    // Respuesta desordenada: la API puede devolver data en cualquier orden con `index`.
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          data: [
            { embedding: [9, 9], index: 1 },
            { embedding: [1, 1], index: 0 },
          ],
        }),
    } as unknown as Response);
    const p = createOpenAIEmbeddingProvider({ apiKey: 'sk-test-fake', fetchFn });
    const out = await p.embed(['a', 'b']);
    expect(out).toEqual([
      [1, 1],
      [9, 9],
    ]);
  });

  it('respuesta HTTP de error → ModelError', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as unknown as Response);
    const p = createOpenAIEmbeddingProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(ModelError);
  });

  it('respuesta malformada (sin data) → ModelError', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nope: true }),
    } as unknown as Response);
    const p = createOpenAIEmbeddingProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(ModelError);
  });

  it('fallo de red (fetch rechaza) → ModelError', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'));
    const p = createOpenAIEmbeddingProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(p.embed(['x'])).rejects.toBeInstanceOf(ModelError);
  });

  it('la API key nunca aparece en el mensaje de error ni se loguea', async () => {
    const secret = 'sk-super-secret-key-1234567890';
    const errors: unknown[] = [];
    const logs: unknown[] = [];
    const errSpy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a));
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a) => logs.push(a));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a) => logs.push(a));
    try {
      const fetchFn = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('server error'),
      } as unknown as Response);
      const p = createOpenAIEmbeddingProvider({ apiKey: secret, fetchFn });
      let thrown: unknown;
      try {
        await p.embed(['x']);
      } catch (e) {
        thrown = e;
      }
      const msg =
        thrown instanceof Error ? `${thrown.message}\n${thrown.stack ?? ''}` : String(thrown);
      expect(msg).not.toContain(secret);
      expect(JSON.stringify(errors)).not.toContain(secret);
      expect(JSON.stringify(logs)).not.toContain(secret);
    } finally {
      errSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
