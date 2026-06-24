import { describe, it, expect, vi } from 'vitest';
import type { AssistantState } from '@murmur/shared';
import {
  createMockVoiceInput,
  createMemoryVoiceOutput,
  type MemoryVoiceOutput,
} from '@murmur/audio';
import {
  createSqliteStore,
  type RagRetriever,
  type SessionSummarizer,
  type FactExtractor,
  type MemoryItem,
  type NewMemoryItem,
} from '@murmur/rag';
import { ConversationOrchestrator } from './orchestrator';
import { createMockRealtimeProvider, type MockRealtimeProvider } from './providers/mock-realtime';

// --- Compat F0 ----------------------------------------------------------------

describe('ConversationOrchestrator (compat F0)', () => {
  it('arranca en idle', () => {
    const orch = new ConversationOrchestrator();
    expect(orch.getState()).toBe('idle');
  });

  it('notifica los cambios de estado', () => {
    const onStateChange = vi.fn();
    const orch = new ConversationOrchestrator({ onStateChange });
    orch.reset();
    expect(onStateChange).toHaveBeenCalledWith('idle');
  });
});

// --- Helpers de pipeline ------------------------------------------------------

interface Harness {
  orch: ConversationOrchestrator;
  realtime: MockRealtimeProvider;
  output: MemoryVoiceOutput;
  store: ReturnType<typeof createSqliteStore>;
  states: AssistantState[];
  transcripts: { role: 'user' | 'assistant'; text: string }[];
}

function build(
  inputChunks: Uint8Array[],
  extra: {
    retriever?: RagRetriever & { index?(item: NewMemoryItem): Promise<void> };
    summarizer?: SessionSummarizer;
    factExtractor?: FactExtractor;
  } = {},
): Harness {
  const realtime = createMockRealtimeProvider();
  const input = createMockVoiceInput(inputChunks);
  const output = createMemoryVoiceOutput();
  const store = createSqliteStore(':memory:');
  const states: AssistantState[] = [];
  const transcripts: { role: 'user' | 'assistant'; text: string }[] = [];

  const orch = new ConversationOrchestrator({
    realtime,
    input,
    output,
    conversation: store.conversation,
    connection: { apiKey: 'k', model: 'gpt-realtime', voice: 'verse' },
    onStateChange: (s) => states.push(s),
    onTranscript: (e) => transcripts.push(e),
    ...extra,
  });

  return { orch, realtime, output, store, states, transcripts };
}

describe('ConversationOrchestrator (pipeline)', () => {
  it('startSession crea sesión y conecta el realtime con instructions', async () => {
    const h = build([]);
    await h.orch.startSession();

    expect(h.store.conversation.recentSessions(10)).toHaveLength(1);
    expect(h.realtime.lastOptions?.apiKey).toBe('k');
    expect(h.realtime.lastOptions?.model).toBe('gpt-realtime');
    expect(h.realtime.lastOptions?.voice).toBe('verse');
    // Sin retriever, las instrucciones son un contexto básico (definido, no vacío).
    expect(typeof h.realtime.lastOptions?.instructions).toBe('string');
  });

  it('incluye el contexto del retriever en instructions', async () => {
    const items: MemoryItem[] = [
      { id: '1', type: 'long_term_fact', content: 'al usuario le gusta el té', createdAt: 1 },
    ];
    const retriever: RagRetriever = {
      retrieve: () => Promise.resolve(items),
    };
    const h = build([], { retriever });
    await h.orch.startSession();

    expect(h.realtime.lastOptions?.instructions).toContain('al usuario le gusta el té');
  });

  it('las instructions contienen la persona cálida de murmur (buildSystemPrompt)', async () => {
    const items: MemoryItem[] = [
      { id: '1', type: 'long_term_fact', content: 'al usuario le gusta el té', createdAt: 1 },
    ];
    const retriever: RagRetriever = {
      retrieve: () => Promise.resolve(items),
    };
    const h = build([], { retriever });
    await h.orch.startSession();

    const instructions = h.realtime.lastOptions?.instructions ?? '';
    // Persona: marca + calidez + bloque de contexto "Lo que recuerdo".
    expect(instructions).toContain('murmur');
    expect(instructions).toMatch(/cálid|cercan|íntim/i);
    expect(instructions).toMatch(/Lo que recuerdo/i);
    expect(instructions).toContain('al usuario le gusta el té');
  });

  it('sin retriever las instructions son sólo la persona (sin bloque de contexto)', async () => {
    const h = build([]);
    await h.orch.startSession();

    const instructions = h.realtime.lastOptions?.instructions ?? '';
    expect(instructions).toMatch(/murmur/i);
    expect(instructions).not.toMatch(/Lo que recuerdo/i);
  });

  it('respeta el locale al construir las instructions', async () => {
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      locale: 'en',
    });
    await orch.startSession();

    const instructions = realtime.lastOptions?.instructions ?? '';
    expect(instructions).toMatch(/warm|close|intimate/i);
  });

  it('startListening envía los chunks del input al sendAudio de la sesión', async () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    const h = build([a, b]);
    await h.orch.startSession();
    await h.orch.startListening();

    expect(h.realtime.lastSession?.sentAudio).toEqual([a, b]);
  });

  it('stopListening hace commit en la sesión', async () => {
    const h = build([new Uint8Array([1])]);
    await h.orch.startSession();
    await h.orch.startListening();
    await h.orch.stopListening();

    expect(h.realtime.lastSession?.commits).toBe(1);
  });

  it('los onState del modelo conducen los estados vía onStateChange', async () => {
    const h = build([]);
    await h.orch.startSession();
    h.states.length = 0; // descartamos cambios de arranque

    h.realtime.emitState('listening');
    h.realtime.emitState('thinking');
    h.realtime.emitState('speaking');
    h.realtime.emitResponseDone();

    expect(h.states).toEqual(['listening', 'thinking', 'speaking', 'idle']);
    expect(h.orch.getState()).toBe('idle');
  });

  it('el audio del modelo llega a la salida (bytes acumulados)', async () => {
    const h = build([]);
    await h.orch.startSession();

    h.realtime.emitState('speaking');
    const c1 = new Uint8Array([10, 11]);
    const c2 = new Uint8Array([12, 13]);
    h.realtime.emitAudio(c1);
    h.realtime.emitAudio(c2);
    h.realtime.emitResponseDone();

    await h.orch.flush();

    expect(h.output.chunks()).toEqual([c1, c2]);
  });

  it('persiste el turno: mensaje de usuario y de asistente en orden', async () => {
    const h = build([]);
    const session = await h.orch.startSession();

    h.realtime.emitUserTranscript('hola, soy Ana');
    h.realtime.emitState('thinking');
    h.realtime.emitAssistantTranscript('Encantado, ');
    h.realtime.emitAssistantTranscript('Ana.');
    h.realtime.emitResponseDone();

    await h.orch.flush();

    const messages = h.store.conversation.getMessages(session.id);
    expect(messages.map((m) => ({ role: m.role, text: m.text }))).toEqual([
      { role: 'user', text: 'hola, soy Ana' },
      { role: 'assistant', text: 'Encantado, Ana.' },
    ]);
    expect(h.transcripts).toEqual([
      { role: 'user', text: 'hola, soy Ana' },
      { role: 'assistant', text: 'Encantado, Ana.' },
    ]);
  });

  it('dos turnos persisten cuatro mensajes en orden', async () => {
    const h = build([]);
    const session = await h.orch.startSession();

    h.realtime.emitUserTranscript('uno');
    h.realtime.emitAssistantTranscript('respuesta uno');
    h.realtime.emitResponseDone();

    h.realtime.emitUserTranscript('dos');
    h.realtime.emitAssistantTranscript('respuesta dos');
    h.realtime.emitResponseDone();

    await h.orch.flush();

    const messages = h.store.conversation.getMessages(session.id);
    expect(messages.map((m) => m.text)).toEqual(['uno', 'respuesta uno', 'dos', 'respuesta dos']);
  });

  it('interrupt llama a session.interrupt y output.stop', async () => {
    const h = build([]);
    await h.orch.startSession();
    h.realtime.emitState('speaking');

    await h.orch.interrupt();

    expect(h.realtime.lastSession?.interrupts).toBe(1);
    expect(h.output.stopped).toBe(true);
  });

  it('interrupt descarta el buffer del asistente: una respuesta cancelada no se persiste', async () => {
    const h = build([]);
    const session = await h.orch.startSession();

    // El asistente empezó a responder pero el usuario interrumpe (barge-in).
    h.realtime.emitState('speaking');
    h.realtime.emitAssistantTranscript('respuesta a medio');

    await h.orch.interrupt();

    // Tras el barge-in, el modelo vuelve a idle (fin del ciclo cancelado): no debe
    // persistirse ni emitirse la respuesta cancelada.
    h.realtime.emitResponseDone();
    await h.orch.flush();

    const messages = h.store.conversation.getMessages(session.id);
    expect(messages).toHaveLength(0);
    expect(h.transcripts).toHaveLength(0);
  });

  it('interrupt seguido de un turno nuevo persiste solo la respuesta nueva', async () => {
    const h = build([]);
    const session = await h.orch.startSession();

    // Respuesta interrumpida.
    h.realtime.emitState('speaking');
    h.realtime.emitAssistantTranscript('texto descartado');
    await h.orch.interrupt();

    // Turno nuevo completo.
    h.realtime.emitUserTranscript('hola de nuevo');
    h.realtime.emitAssistantTranscript('hola, dime');
    h.realtime.emitResponseDone();
    await h.orch.flush();

    const messages = h.store.conversation.getMessages(session.id);
    expect(messages.map((m) => m.text)).toEqual(['hola de nuevo', 'hola, dime']);
  });

  it('multi-turno con audio: encadena la reproducción sin perder chunks ni rechazos', async () => {
    const h = build([]);
    await h.orch.startSession();

    // Primer turno con audio.
    h.realtime.emitState('speaking');
    const a1 = new Uint8Array([1, 2]);
    h.realtime.emitAudio(a1);
    h.realtime.emitResponseDone();

    // Segundo turno con audio (nuevo stream de salida).
    h.realtime.emitState('speaking');
    const a2 = new Uint8Array([3, 4]);
    h.realtime.emitAudio(a2);
    h.realtime.emitResponseDone();

    await h.orch.flush();

    expect(h.output.chunks()).toEqual([a1, a2]);
  });

  it('onError lleva al estado error y propaga el error', async () => {
    const errors: Error[] = [];
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      onError: (e) => errors.push(e),
    });
    await orch.startSession();

    const err = new Error('fallo del modelo');
    realtime.emitError(err);

    expect(orch.getState()).toBe('error');
    expect(errors).toEqual([err]);
  });

  it('endSession finaliza la sesión y guarda summary + facts vía sink', async () => {
    const indexed: NewMemoryItem[] = [];
    const retriever: RagRetriever & { index(item: NewMemoryItem): Promise<void> } = {
      retrieve: () => Promise.resolve([]),
      index: (item) => {
        indexed.push(item);
        return Promise.resolve();
      },
    };
    const summarizer: SessionSummarizer = {
      summarize: () => Promise.resolve('resumen: el usuario se llama Ana'),
    };
    const factExtractor: FactExtractor = {
      extract: () => Promise.resolve(['el usuario se llama Ana']),
    };

    const h = build([], { retriever, summarizer, factExtractor });
    const session = await h.orch.startSession();

    h.realtime.emitUserTranscript('me llamo Ana');
    h.realtime.emitAssistantTranscript('Encantado, Ana');
    h.realtime.emitResponseDone();
    await h.orch.flush();

    await h.orch.endSession();

    const stored = h.store.conversation.getSession(session.id);
    expect(stored?.endedAt).toBeTypeOf('number');
    expect(h.realtime.lastSession?.closes).toBe(1);
    // El summarizer y el factExtractor se invocaron; sus resultados van a retriever.index.
    expect(indexed.some((i) => i.type === 'session_summary')).toBe(true);
    expect(indexed.some((i) => i.type === 'long_term_fact')).toBe(true);
  });

  it('los métodos del pipeline exigen las deps con un error claro', async () => {
    const orch = new ConversationOrchestrator();
    await expect(orch.startSession()).rejects.toThrow(/realtime|conversation|dep/i);
  });

  it('startListening sin sesión lanza error claro', async () => {
    const h = build([new Uint8Array([1])]);
    await expect(h.orch.startListening()).rejects.toThrow(/sesión|session/i);
  });
});

// --- Privacidad (F12) ---------------------------------------------------------

describe('ConversationOrchestrator (privacidad)', () => {
  function buildWithPrivacy(
    privacy: {
      localOnlyMode?: boolean;
      storeTranscripts?: boolean;
      redactBeforeStore?: boolean;
    },
    extra: { retriever?: RagRetriever } = {},
  ): {
    orch: ConversationOrchestrator;
    realtime: MockRealtimeProvider;
    store: ReturnType<typeof createSqliteStore>;
  } {
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      privacy,
      ...extra,
    });
    return { orch, realtime, store };
  }

  it('localOnlyMode no inyecta el contexto RAG en las instructions', async () => {
    const retriever: RagRetriever = {
      retrieve: () =>
        Promise.resolve([
          { id: '1', type: 'long_term_fact', content: 'al usuario le gusta el té', createdAt: 1 },
        ]),
    };
    const { orch, realtime } = buildWithPrivacy({ localOnlyMode: true }, { retriever });
    await orch.startSession();

    const instructions = realtime.lastOptions?.instructions ?? '';
    expect(instructions).toMatch(/murmur/i);
    expect(instructions).not.toMatch(/Lo que recuerdo/i);
    expect(instructions).not.toContain('al usuario le gusta el té');
  });

  it('sin localOnlyMode sí inyecta el contexto RAG', async () => {
    const retriever: RagRetriever = {
      retrieve: () =>
        Promise.resolve([
          { id: '1', type: 'long_term_fact', content: 'al usuario le gusta el té', createdAt: 1 },
        ]),
    };
    const { orch, realtime } = buildWithPrivacy({ localOnlyMode: false }, { retriever });
    await orch.startSession();

    expect(realtime.lastOptions?.instructions).toContain('al usuario le gusta el té');
  });

  it('storeTranscripts:false no persiste el texto de los mensajes', async () => {
    const { orch, realtime, store } = buildWithPrivacy({ storeTranscripts: false });
    const session = await orch.startSession();

    realtime.emitUserTranscript('hola, soy Ana');
    realtime.emitAssistantTranscript('Encantado, Ana');
    realtime.emitResponseDone();
    await orch.flush();

    expect(store.conversation.getMessages(session.id)).toHaveLength(0);
  });

  it('storeTranscripts:false (default true) sí persiste cuando no se especifica', async () => {
    const { orch, realtime, store } = buildWithPrivacy({});
    const session = await orch.startSession();

    realtime.emitUserTranscript('hola');
    realtime.emitResponseDone();
    await orch.flush();

    expect(store.conversation.getMessages(session.id).map((m) => m.text)).toEqual(['hola']);
  });

  it('redactBeforeStore redacta los mensajes antes de persistir', async () => {
    const { orch, realtime, store } = buildWithPrivacy({ redactBeforeStore: true });
    const session = await orch.startSession();

    realtime.emitUserTranscript('mi correo es ana@example.com');
    realtime.emitAssistantTranscript('apuntado: ana@example.com');
    realtime.emitResponseDone();
    await orch.flush();

    const texts = store.conversation.getMessages(session.id).map((m) => m.text);
    expect(texts).toEqual(['mi correo es [email]', 'apuntado: [email]']);
    for (const t of texts) {
      expect(t).not.toContain('ana@example.com');
    }
  });

  it('redactBeforeStore false deja el texto intacto', async () => {
    const { orch, realtime, store } = buildWithPrivacy({ redactBeforeStore: false });
    const session = await orch.startSession();

    realtime.emitUserTranscript('mi correo es ana@example.com');
    realtime.emitResponseDone();
    await orch.flush();

    expect(store.conversation.getMessages(session.id).map((m) => m.text)).toEqual([
      'mi correo es ana@example.com',
    ]);
  });
});

describe('ConversationOrchestrator (function-calling)', () => {
  it('pasa las tools al realtime y despacha una tool-call devolviendo el resultado', async () => {
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const dispatchTool = vi.fn(async () => 'son las 12');
    const tools = [
      { type: 'function' as const, name: 'current_time', description: 'd', parameters: {} },
    ];
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      tools,
      dispatchTool,
    });

    await orch.startSession();
    expect(realtime.lastSession?.tools?.map((t) => t.name)).toEqual(['current_time']);

    realtime.emitToolCall({ callId: 'c1', name: 'current_time', arguments: { tz: 'utc' } });
    await vi.waitFor(() =>
      expect(dispatchTool).toHaveBeenCalledWith('current_time', { tz: 'utc' }),
    );
    await vi.waitFor(() =>
      expect(realtime.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'son las 12' }]),
    );
  });

  it('un dispatchTool que rechaza devuelve un output de error y no cambia a estado error', async () => {
    const realtime = createMockRealtimeProvider();
    const store = createSqliteStore(':memory:');
    const states: AssistantState[] = [];
    const dispatchTool = vi.fn(async () => {
      throw new Error('boom');
    });
    const orch = new ConversationOrchestrator({
      realtime,
      input: createMockVoiceInput([]),
      output: createMemoryVoiceOutput(),
      conversation: store.conversation,
      connection: { apiKey: 'k', model: 'm' },
      tools: [{ type: 'function' as const, name: 'x', description: 'd', parameters: {} }],
      dispatchTool,
      onStateChange: (s) => states.push(s),
    });

    await orch.startSession();
    realtime.emitToolCall({ callId: 'c1', name: 'x', arguments: {} });

    await vi.waitFor(() =>
      expect(realtime.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'boom' }]),
    );
    expect(states).not.toContain('error');
  });
});
