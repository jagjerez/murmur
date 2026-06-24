import { describe, it, expect, vi } from 'vitest';
import { ModelError } from '@murmur/shared';
import {
  createMockChatProvider,
  createOpenAIChatProvider,
  createOllamaChatProvider,
  type ChatMessage,
} from './chat';

describe('createMockChatProvider', () => {
  it('es determinista: delega en el responder inyectado', async () => {
    const provider = createMockChatProvider((messages) => messages.map((m) => m.content).join('|'));
    const out = await provider.complete([
      { role: 'system', content: 'a' },
      { role: 'user', content: 'b' },
    ]);
    expect(out).toBe('a|b');
  });

  it('pasa los mensajes tal cual al responder', async () => {
    const seen: ChatMessage[][] = [];
    const provider = createMockChatProvider((messages) => {
      seen.push(messages);
      return 'ok';
    });
    const msgs: ChatMessage[] = [{ role: 'user', content: 'hola' }];
    await provider.complete(msgs);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(msgs);
  });
});

describe('createOpenAIChatProvider', () => {
  function okResponse(content: string): Response {
    return {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          choices: [{ message: { role: 'assistant', content } }],
        }),
    } as unknown as Response;
  }

  it('hace POST a /v1/chat/completions con Authorization Bearer y body {model, messages}', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('respuesta'));
    const provider = createOpenAIChatProvider({
      apiKey: 'sk-test-fake-key',
      model: 'gpt-4o',
      fetchFn,
    });

    const messages: ChatMessage[] = [
      { role: 'system', content: 'eres útil' },
      { role: 'user', content: 'hola' },
    ];
    const out = await provider.complete(messages);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-test-fake-key');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as { model: string; messages: ChatMessage[] };
    expect(body.model).toBe('gpt-4o');
    expect(body.messages).toEqual(messages);
    expect(out).toBe('respuesta');
  });

  it('usa gpt-4o-mini por defecto', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('x'));
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    await provider.complete([{ role: 'user', content: 'x' }]);
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { model: string };
    expect(body.model).toBe('gpt-4o-mini');
  });

  it('reenvía temperature y maxTokens (como max_tokens) cuando se indican', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('x'));
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    await provider.complete([{ role: 'user', content: 'x' }], { temperature: 0.2, maxTokens: 128 });
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      temperature?: number;
      max_tokens?: number;
    };
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(128);
  });

  it('parsea choices[0].message.content', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse('contenido parseado'));
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    const out = await provider.complete([{ role: 'user', content: 'x' }]);
    expect(out).toBe('contenido parseado');
  });

  it('respuesta HTTP de error → ModelError', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    } as unknown as Response);
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(provider.complete([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      ModelError,
    );
  });

  it('respuesta malformada (sin choices) → ModelError', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ nope: true }),
    } as unknown as Response);
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(provider.complete([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      ModelError,
    );
  });

  it('respuesta no JSON → ModelError', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('not json')),
    } as unknown as Response);
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(provider.complete([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      ModelError,
    );
  });

  it('fallo de red (fetch rechaza) → ModelError', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'));
    const provider = createOpenAIChatProvider({ apiKey: 'sk-test-fake', fetchFn });
    await expect(provider.complete([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(
      ModelError,
    );
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
      const provider = createOpenAIChatProvider({ apiKey: secret, fetchFn });
      let thrown: unknown;
      try {
        await provider.complete([{ role: 'user', content: 'x' }]);
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

describe('createOllamaChatProvider', () => {
  it('hace POST a /api/chat y parsea message.content', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ message: { role: 'assistant', content: 'hola' } }), {
        status: 200,
      });
    }) as unknown as typeof globalThis.fetch;
    const chat = createOllamaChatProvider({ model: 'llama3', fetchFn });
    const out = await chat.complete([{ role: 'user', content: 'hey' }]);
    expect(out).toBe('hola');
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
    expect(calls[0]!.body).toMatchObject({ model: 'llama3', stream: false });
  });

  it('estado HTTP no-ok → ModelError', async () => {
    const fetchFn = (async () =>
      new Response('nope', { status: 500 })) as unknown as typeof globalThis.fetch;
    const chat = createOllamaChatProvider({ model: 'llama3', fetchFn });
    await expect(chat.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/Ollama/i);
  });
});
