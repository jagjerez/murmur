import { describe, it, expect, vi } from 'vitest';
import { base64ToPcm16, pcm16ToBase64 } from '@murmur/audio';
import { ModelError } from '@murmur/shared';
import { createOpenAIRealtimeProvider } from './openai-realtime';
import { createFakeWebSocket, type FakeWebSocket } from './fake-websocket';
import type { RealtimeConnectOptions } from './realtime-model-provider';

const API_KEY = 'sk-test-1234567890';

/** Crea un provider con WS inyectado y devuelve también una ref al WS creado. */
function setup(): {
  provider: ReturnType<typeof createOpenAIRealtimeProvider>;
  getWs: () => FakeWebSocket;
} {
  let ws: FakeWebSocket | undefined;
  const provider = createOpenAIRealtimeProvider({
    webSocketFactory: (url, protocols) => {
      ws = createFakeWebSocket(url, protocols ?? []);
      return ws;
    },
  });
  return {
    provider,
    getWs: () => {
      if (!ws) throw new Error('WebSocket no creado todavía');
      return ws;
    },
  };
}

function parseSent(ws: FakeWebSocket): Array<Record<string, unknown>> {
  return ws.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
}

const baseOptions: RealtimeConnectOptions = {
  apiKey: API_KEY,
  model: 'gpt-realtime',
  voice: 'cedar',
};

describe('createOpenAIRealtimeProvider', () => {
  it('expone un id estable', () => {
    const { provider } = setup();
    expect(provider.id).toBe('openai-realtime');
  });

  it('connect abre el WS con la URL y subprotocolos correctos', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    expect(ws.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime');
    expect(ws.protocols).toEqual([
      'realtime',
      `openai-insecure-api-key.${API_KEY}`,
      'openai-beta.realtime-v1',
    ]);
  });

  it('al abrir envía session.update con voice/pcm16/turn_detection', async () => {
    const { provider, getWs } = setup();
    const onOpen = vi.fn();
    const sessionPromise = provider.connect({ ...baseOptions, onOpen });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    const first = parseSent(ws)[0]!;
    expect(first.type).toBe('session.update');
    const session = first.session as Record<string, unknown>;
    expect(session.voice).toBe('cedar');
    expect(session.input_audio_format).toBe('pcm16');
    expect(session.output_audio_format).toBe('pcm16');
    expect(session.modalities).toEqual(['audio', 'text']);
    expect(session.turn_detection).toEqual({ type: 'server_vad' });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('incluye instructions en session.update cuando se proporcionan', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({ ...baseOptions, instructions: 'sé breve' });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;
    const session = parseSent(ws)[0]!.session as Record<string, unknown>;
    expect(session.instructions).toBe('sé breve');
  });

  it('sendAudio envía input_audio_buffer.append con base64 del PCM', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    const session = await sessionPromise;

    const pcm = new Uint8Array([0, 1, 2, 3, 255, 128]);
    session.sendAudio(pcm);

    const last = parseSent(ws).at(-1)!;
    expect(last.type).toBe('input_audio_buffer.append');
    expect(last.audio).toBe(pcm16ToBase64(pcm));
  });

  it('commit envía input_audio_buffer.commit y luego response.create', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    const session = await sessionPromise;

    session.commit();
    const types = parseSent(ws).map((m) => m.type);
    expect(types.slice(-2)).toEqual(['input_audio_buffer.commit', 'response.create']);
  });

  it('interrupt envía response.cancel e input_audio_buffer.clear', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    const session = await sessionPromise;

    session.interrupt();
    const types = parseSent(ws).map((m) => m.type);
    expect(types).toContain('response.cancel');
    expect(types).toContain('input_audio_buffer.clear');
  });

  it('mapea eventos del servidor a los estados del asistente', async () => {
    const states: string[] = [];
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({
      ...baseOptions,
      onState: (s) => states.push(s),
    });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    ws.emitServerEvent({ type: 'input_audio_buffer.speech_started' });
    ws.emitServerEvent({ type: 'input_audio_buffer.speech_stopped' });
    ws.emitServerEvent({ type: 'response.created' });
    ws.emitServerEvent({
      type: 'response.output_audio.delta',
      delta: pcm16ToBase64(new Uint8Array([1, 2])),
    });
    ws.emitServerEvent({ type: 'response.done' });

    // setState deduplica estados idénticos consecutivos: speech_stopped y
    // response.created comparten 'thinking', así que onState se invoca una vez.
    expect(states).toEqual(['listening', 'thinking', 'speaking', 'idle']);
  });

  it('decodifica los deltas de audio (nombre GA) a bytes PCM en onAudio', async () => {
    const chunks: Uint8Array[] = [];
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({ ...baseOptions, onAudio: (c) => chunks.push(c) });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    const pcm = new Uint8Array([10, 20, 30, 40]);
    ws.emitServerEvent({ type: 'response.output_audio.delta', delta: pcm16ToBase64(pcm) });
    expect(chunks).toHaveLength(1);
    expect(Array.from(chunks[0]!)).toEqual(Array.from(base64ToPcm16(pcm16ToBase64(pcm))));
  });

  it('acepta también el nombre preview response.audio.delta', async () => {
    const chunks: Uint8Array[] = [];
    const states: string[] = [];
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({
      ...baseOptions,
      onAudio: (c) => chunks.push(c),
      onState: (s) => states.push(s),
    });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    const pcm = new Uint8Array([5, 6, 7, 8]);
    ws.emitServerEvent({ type: 'response.audio.delta', delta: pcm16ToBase64(pcm) });
    expect(chunks).toHaveLength(1);
    expect(states).toContain('speaking');
  });

  it('invoca onUserTranscript con la transcripción final del usuario', async () => {
    const onUserTranscript = vi.fn();
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({ ...baseOptions, onUserTranscript });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    ws.emitServerEvent({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'hola murmur',
    });
    expect(onUserTranscript).toHaveBeenCalledWith('hola murmur');
  });

  it('invoca onAssistantTranscript con los deltas (GA y preview)', async () => {
    const deltas: string[] = [];
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({
      ...baseOptions,
      onAssistantTranscript: (d) => deltas.push(d),
    });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    ws.emitServerEvent({ type: 'response.output_audio_transcript.delta', delta: 'hola ' });
    ws.emitServerEvent({ type: 'response.audio_transcript.delta', delta: 'mundo' });
    expect(deltas).toEqual(['hola ', 'mundo']);
  });

  it('evento error del servidor → onError(ModelError) y estado error', async () => {
    const onError = vi.fn();
    const states: string[] = [];
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({
      ...baseOptions,
      onError,
      onState: (s) => states.push(s),
    });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    ws.emitServerEvent({ type: 'error', error: { message: 'algo falló' } });
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(ModelError);
    expect(err.message).toContain('algo falló');
    expect(states).toContain('error');
  });

  it('fallo de conexión (error del WS antes de open) → onError', async () => {
    const onError = vi.fn();
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect({ ...baseOptions, onError });
    const ws = getWs();
    ws.simulateError();
    ws.simulateOpen();
    await sessionPromise;
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(ModelError);
  });

  it('close cierra el WS y es idempotente', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    const session = await sessionPromise;

    await session.close();
    await session.close();
    expect(ws.readyState).toBe(3);
  });

  it('no incluye la API key en ningún mensaje enviado', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    const session = await sessionPromise;
    session.sendAudio(new Uint8Array([1, 2, 3]));
    session.commit();
    for (const msg of ws.sent) {
      expect(msg).not.toContain(API_KEY);
    }
  });

  it('declara las tools en session.update cuando se pasan', async () => {
    const { provider, getWs } = setup();
    const tools = [{ type: 'function' as const, name: 'demo', description: 'd', parameters: {} }];
    const sessionPromise = provider.connect({ ...baseOptions, tools });
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    const update = parseSent(ws).find((m) => m.type === 'session.update')!;
    const session = update.session as Record<string, unknown>;
    expect(session.tools).toEqual(tools);
    expect(session.tool_choice).toBe('auto');
  });

  it('sin tools, session.update no incluye tools (compat F5)', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    await sessionPromise;

    const update = parseSent(ws).find((m) => m.type === 'session.update')!;
    const session = update.session as Record<string, unknown>;
    expect(session.tools).toBeUndefined();
    expect(session.tool_choice).toBeUndefined();
  });

  it('sendToolResult envía function_call_output + response.create', async () => {
    const { provider, getWs } = setup();
    const sessionPromise = provider.connect(baseOptions);
    const ws = getWs();
    ws.simulateOpen();
    const session = await sessionPromise;

    session.sendToolResult('call_1', 'son las 12');

    const sent = parseSent(ws);
    const item = sent.find((m) => m.type === 'conversation.item.create')!;
    expect(item.item).toEqual({
      type: 'function_call_output',
      call_id: 'call_1',
      output: 'son las 12',
    });
    // El resultado de la tool va inmediatamente seguido de response.create (orden y adyacencia).
    expect(sent.map((m) => m.type).slice(-2)).toEqual([
      'conversation.item.create',
      'response.create',
    ]);
  });
});
