import { describe, it, expect } from 'vitest';
import { ModelError } from '@murmur/shared';
import {
  createOpenAIWhisperProvider,
  createLocalWhisperProvider,
  createMockTranscriptionProvider,
  selectTranscriptionProvider,
  type WhisperFetch,
} from './whisper';

/** Construye un `Response`-like mínimo para mockear `fetch` sin red. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

const AUDIO = new Uint8Array([1, 2, 3, 4]);

describe('createOpenAIWhisperProvider', () => {
  it('mode es whisper-api', () => {
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-XXXX',
      fetchFn: () => {
        throw new Error('no llamar');
      },
    });
    expect(provider.mode).toBe('whisper-api');
  });

  it('hace POST a /v1/audio/transcriptions con Authorization Bearer y FormData (file+model)', async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchFn: WhisperFetch = (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve(jsonResponse({ text: 'hola mundo' }));
    };

    const provider = createOpenAIWhisperProvider({ apiKey: 'sk-test-SECRET', fetchFn });
    const text = await provider.transcribe(AUDIO);

    expect(text).toBe('hola mundo');
    expect(capturedUrl).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(capturedInit?.method).toBe('POST');

    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test-SECRET');

    const body = capturedInit?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('model')).toBe('whisper-1');
    const file = body.get('file');
    expect(file).toBeInstanceOf(Blob);
  });

  it('respeta model y format inyectados', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchFn: WhisperFetch = (_url, init) => {
      capturedInit = init;
      return Promise.resolve(jsonResponse({ text: 'x' }));
    };
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-XXXX',
      model: 'whisper-large-v3',
      format: 'audio/wav',
      fetchFn,
    });
    await provider.transcribe(AUDIO);
    const body = capturedInit?.body as FormData;
    expect(body.get('model')).toBe('whisper-large-v3');
    const file = body.get('file') as Blob;
    expect(file.type).toBe('audio/wav');
  });

  it('parsea { text } de la respuesta', async () => {
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-XXXX',
      fetchFn: () => Promise.resolve(jsonResponse({ text: '  con espacios  ' })),
    });
    expect(await provider.transcribe(AUDIO)).toBe('con espacios');
  });

  it('error HTTP → ModelError', async () => {
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-XXXX',
      fetchFn: () => Promise.resolve(jsonResponse('boom', { ok: false, status: 401 })),
    });
    await expect(provider.transcribe(AUDIO)).rejects.toBeInstanceOf(ModelError);
  });

  it('respuesta sin text → ModelError', async () => {
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-XXXX',
      fetchFn: () => Promise.resolve(jsonResponse({ nope: true })),
    });
    await expect(provider.transcribe(AUDIO)).rejects.toBeInstanceOf(ModelError);
  });

  it('fallo de red (fetch rechaza) → ModelError', async () => {
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-XXXX',
      fetchFn: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    await expect(provider.transcribe(AUDIO)).rejects.toBeInstanceOf(ModelError);
  });

  it('la API key nunca aparece en el mensaje de error', async () => {
    const provider = createOpenAIWhisperProvider({
      apiKey: 'sk-test-SUPER-SECRETO',
      fetchFn: () => Promise.resolve(jsonResponse('boom', { ok: false, status: 500 })),
    });
    try {
      await provider.transcribe(AUDIO);
      expect.unreachable('debería lanzar');
    } catch (err) {
      const e = err as ModelError;
      expect(e).toBeInstanceOf(ModelError);
      expect(e.message).not.toContain('sk-test-SUPER-SECRETO');
      expect(JSON.stringify(e)).not.toContain('sk-test-SUPER-SECRETO');
    }
  });
});

describe('createLocalWhisperProvider', () => {
  it('mode es local-whisper y delega en run', async () => {
    let received: Uint8Array | undefined;
    const provider = createLocalWhisperProvider({
      run: (audio) => {
        received = audio;
        return Promise.resolve('texto local');
      },
    });
    expect(provider.mode).toBe('local-whisper');
    const text = await provider.transcribe(AUDIO);
    expect(text).toBe('texto local');
    expect(received).toBe(AUDIO);
  });

  it('sin run → error claro al construir', () => {
    expect(() => createLocalWhisperProvider({} as { run: never })).toThrow(ModelError);
  });

  it('si run lanza, propaga como ModelError', async () => {
    const provider = createLocalWhisperProvider({
      run: () => Promise.reject(new Error('binario no encontrado')),
    });
    await expect(provider.transcribe(AUDIO)).rejects.toBeInstanceOf(ModelError);
  });
});

describe('createMockTranscriptionProvider', () => {
  it('devuelve el texto dado, mode whisper-api por defecto', async () => {
    const provider = createMockTranscriptionProvider('mock-text');
    expect(provider.mode).toBe('whisper-api');
    expect(await provider.transcribe(AUDIO)).toBe('mock-text');
    expect(await provider.transcribe(new Uint8Array())).toBe('mock-text');
  });

  it('acepta un mode explícito', async () => {
    const provider = createMockTranscriptionProvider('t', 'local-whisper');
    expect(provider.mode).toBe('local-whisper');
  });
});

describe('selectTranscriptionProvider', () => {
  it('whisper-api → provider OpenAI', () => {
    const provider = selectTranscriptionProvider('whisper-api', {
      apiKey: 'sk-test-XXXX',
      fetchFn: () => Promise.resolve(jsonResponse({ text: 'x' })),
    });
    expect(provider.mode).toBe('whisper-api');
  });

  it('local-whisper → provider local', () => {
    const provider = selectTranscriptionProvider('local-whisper', {
      run: () => Promise.resolve('y'),
    });
    expect(provider.mode).toBe('local-whisper');
  });

  it('whisper-api sin apiKey → ModelError', () => {
    expect(() => selectTranscriptionProvider('whisper-api', {})).toThrow(ModelError);
  });

  it('local-whisper sin run → ModelError', () => {
    expect(() => selectTranscriptionProvider('local-whisper', {})).toThrow(ModelError);
  });

  it('realtime → provider que lanza al transcribir (lo hace el realtime)', async () => {
    const provider = selectTranscriptionProvider('realtime', {});
    expect(provider.mode).toBe('realtime');
    await expect(provider.transcribe(AUDIO)).rejects.toBeInstanceOf(ModelError);
  });
});
