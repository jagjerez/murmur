import { MurmurError, redactSensitive, type AssistantState } from '@murmur/shared';
import {
  createPushPullStream,
  type AudioStream,
  type PushPullStream,
  type VoiceInputProvider,
  type VoiceOutputProvider,
} from '@murmur/audio';
import type {
  ConversationStore,
  FactExtractor,
  NewMemoryItem,
  RagRetriever,
  SessionSummarizer,
} from '@murmur/rag';
import type { Session } from '@murmur/shared';
import type {
  RealtimeModelProvider,
  RealtimeModelSession,
  RealtimeTool,
  RealtimeToolCall,
} from './providers/realtime-model-provider';
import { buildSystemPrompt, type PromptLocale } from './prompt';

/** Retriever opcional que, además de recuperar, puede indexar memoria nueva. */
export type IndexingRetriever = RagRetriever & {
  index?(item: NewMemoryItem): Promise<void>;
};

export interface OrchestratorConnection {
  apiKey: string;
  model: string;
  voice?: string;
}

/**
 * Flags de privacidad que el orchestrator honra. Todos opcionales; el valor
 * efectivo por defecto es el más conservador respecto a la funcionalidad previa
 * (sin modo local, se guardan transcripciones, sin redacción) para no romper F9/F10.
 */
export interface OrchestratorPrivacy {
  /** Si `true`, no se inyecta contexto RAG en las instructions (no se envía memoria al modelo). */
  localOnlyMode?: boolean;
  /** Si `false`, no se persiste el texto de los mensajes (sí se emiten por `onTranscript`). */
  storeTranscripts?: boolean;
  /** Si `true`, se aplica `redactSensitive` al texto antes de `addMessage`. */
  redactBeforeStore?: boolean;
}

/**
 * Dependencias del orchestrator. Todas opcionales para mantener compat con F0
 * (`new ConversationOrchestrator()` arranca en `idle`); los métodos del pipeline
 * exigen las que necesitan con un error claro si faltan.
 */
export interface OrchestratorDeps {
  realtime: RealtimeModelProvider;
  input: VoiceInputProvider;
  output: VoiceOutputProvider;
  conversation: ConversationStore;
  connection: OrchestratorConnection;
  retriever?: IndexingRetriever;
  summarizer?: SessionSummarizer;
  factExtractor?: FactExtractor;
  /** Tools que el modelo puede invocar; se pasan al realtime al conectar. */
  tools?: RealtimeTool[];
  /** Ejecuta una tool por nombre con los args parseados y devuelve su salida como texto. */
  dispatchTool?: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Controles de privacidad; ver `OrchestratorPrivacy`. */
  privacy?: OrchestratorPrivacy;
  /** Idioma base de la persona del system prompt (es por defecto). */
  locale?: PromptLocale;
  onStateChange?: (state: AssistantState) => void;
  onTranscript?: (event: { role: 'user' | 'assistant'; text: string }) => void;
  onError?: (error: Error) => void;
  now?: () => number;
}

/** Compat F0: el constructor admite sólo `onStateChange`. */
export type OrchestratorEvents = Pick<OrchestratorDeps, 'onStateChange'>;

const CONTEXT_LIMIT = 5;

/**
 * Genera un UUID con la Web Crypto API (`globalThis.crypto`), disponible tanto en
 * Node (>=19) como en el webview del desktop. Evita `node:crypto`, que no resuelve
 * al bundlear el orchestrator para el navegador.
 */
function newId(): string {
  return globalThis.crypto.randomUUID();
}

function missing(dep: string): MurmurError {
  return new MurmurError(
    `ConversationOrchestrator: falta la dependencia '${dep}' para esta operación.`,
    'ORCHESTRATOR_MISSING_DEP',
  );
}

/**
 * Cerebro del pipeline de conversación: activar → capturar audio → modelo
 * realtime → reproducir → persistir turno → recuperar/guardar memoria, gobernando
 * la máquina de estados (`AssistantState`). Todas las dependencias se inyectan,
 * de modo que el flujo se testea sin red ni hardware.
 */
export class ConversationOrchestrator {
  private state: AssistantState = 'idle';
  private readonly deps: Partial<OrchestratorDeps>;
  private readonly now: () => number;

  private session: RealtimeModelSession | undefined;
  private currentSession: Session | undefined;
  /** Stream de captura activo (uno por `startListening`). */
  private inputStream: AudioStream | undefined;

  /** Stream de salida de la respuesta en curso (uno por respuesta del modelo). */
  private outputStream: PushPullStream | undefined;
  /** Promesa de la reproducción en curso (resuelve al cerrar el stream). */
  private playback: Promise<void> | undefined;
  /** Transcript del asistente acumulado para la respuesta en curso. */
  private assistantBuffer = '';

  constructor(deps: Partial<OrchestratorDeps> = {}) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  // --- Compat F0 --------------------------------------------------------------

  getState(): AssistantState {
    return this.state;
  }

  reset(): void {
    this.setState('idle');
  }

  protected setState(next: AssistantState): void {
    this.state = next;
    this.deps.onStateChange?.(next);
  }

  // --- Sesión -----------------------------------------------------------------

  /**
   * Crea una sesión de conversación, recupera contexto (RAG) si hay `retriever`,
   * construye el system prompt (persona cálida + contexto, vía `buildSystemPrompt`)
   * y conecta el provider realtime registrando los callbacks del pipeline.
   */
  async startSession(query = ''): Promise<Session> {
    const realtime = this.require('realtime');
    const conversation = this.require('conversation');
    const connection = this.require('connection');

    this.currentSession = conversation.createSession();
    const instructions = await this.buildInstructions(query);

    this.session = await realtime.connect({
      apiKey: connection.apiKey,
      model: connection.model,
      ...(connection.voice !== undefined ? { voice: connection.voice } : {}),
      instructions,
      // tools y onToolCall van acoplados: sólo registramos el manejador si declaramos tools
      // (sin tools el modelo no puede emitir tool-calls). Si faltara `dispatchTool`, `runToolCall`
      // hace no-op de forma segura.
      ...(this.deps.tools !== undefined
        ? {
            tools: this.deps.tools,
            onToolCall: (call: RealtimeToolCall) => this.handleToolCall(call),
          }
        : {}),
      onState: (s) => this.handleState(s),
      onAudio: (chunk) => this.handleAudio(chunk),
      onUserTranscript: (text) => this.handleUserTranscript(text),
      onAssistantTranscript: (delta) => this.handleAssistantTranscript(delta),
      onError: (err) => this.handleError(err),
    });

    return this.currentSession;
  }

  /**
   * Arranca la captura de audio y envía cada chunk PCM al modelo.
   *
   * **Contrato fire-and-forget:** la promesa que devuelve sólo resuelve cuando el
   * stream de captura termina (es decir, tras `stopListening`/`interrupt`, que cierran
   * el `inputStream`). El consumidor NO debe `await startListening()` de forma
   * bloqueante en el flujo normal: debe invocarlo y seguir (p. ej. el hotkey la lanza
   * y luego `stopListening` la cierra). Las excepciones del bucle de captura se
   * encauzan por `onError`; si se llama sin manejar la promesa, conviene un
   * `.catch(...)` para evitar rechazos sin manejar.
   */
  async startListening(deviceId?: string): Promise<void> {
    const input = this.require('input');
    const session = this.requireSession();

    const stream = await input.start(deviceId);
    this.inputStream = stream;
    this.setState('listening');
    for await (const chunk of stream.read()) {
      session.sendAudio(chunk);
    }
  }

  /** Detiene la captura y confirma el turno (commit) al modelo. */
  async stopListening(): Promise<void> {
    const session = this.requireSession();
    if (this.inputStream !== undefined) {
      await this.inputStream.stop();
      this.inputStream = undefined;
    }
    session.commit();
  }

  /**
   * Barge-in: cancela la respuesta en curso y detiene la reproducción. Descarta el
   * `assistantBuffer` acumulado para que la respuesta cancelada NO se persista cuando
   * el modelo cierre el ciclo (`onState('idle')`).
   */
  async interrupt(): Promise<void> {
    this.session?.interrupt();
    this.assistantBuffer = '';
    await this.deps.output?.stop();
    this.closeOutputStream();
  }

  /**
   * Finaliza la sesión: marca el fin en el store y, si hay `summarizer`/
   * `factExtractor`, genera `session_summary` y `long_term_fact` (indexándolos en
   * el `retriever` cuando puede, para que sean recuperables). Cierra el realtime.
   */
  async endSession(): Promise<void> {
    const conversation = this.require('conversation');
    const session = this.currentSession;
    if (session === undefined) {
      throw missing('session');
    }

    conversation.endSession(session.id);
    await this.persistMemory(conversation, session.id);

    await this.session?.close();
    this.session = undefined;
    this.currentSession = undefined;
    this.setState('idle');
  }

  /**
   * Espera a que termine la reproducción de la respuesta en curso. Útil en tests
   * para sincronizar con el consumo asíncrono del stream de salida.
   */
  async flush(): Promise<void> {
    await this.playback;
  }

  // --- Callbacks del modelo ---------------------------------------------------

  private handleState(next: AssistantState): void {
    if (next === 'idle') {
      this.completeResponse();
    }
    this.setState(next);
  }

  private handleAudio(chunk: Uint8Array): void {
    this.ensureOutputStream();
    this.outputStream?.push(chunk);
  }

  private handleUserTranscript(text: string): void {
    this.persistMessage('user', text);
    this.deps.onTranscript?.({ role: 'user', text });
  }

  private handleAssistantTranscript(delta: string): void {
    this.assistantBuffer += delta;
  }

  private handleError(err: Error): void {
    this.setState('error');
    this.closeOutputStream();
    this.deps.onError?.(err);
  }

  /**
   * El modelo pidió ejecutar una tool. Se despacha fire-and-forget: un fallo del `dispatchTool`
   * se convierte en un output de error (que el modelo gestiona), nunca cambia el estado a `error`
   * ni rompe la sesión. Se asume una tool-call por ciclo de respuesta (varias secuenciales
   * funcionan); el fan-out de tool-calls paralelas en una misma respuesta queda fuera de alcance.
   */
  private handleToolCall(call: RealtimeToolCall): void {
    void this.runToolCall(call);
  }

  private async runToolCall(call: RealtimeToolCall): Promise<void> {
    const dispatchTool = this.deps.dispatchTool;
    // Snapshot de la sesión: si `endSession` corre durante el dispatch, `sendToolResult` sobre
    // la sesión ya cerrada es no-op seguro (el provider real lo descarta vía su guard `closed`).
    const session = this.session;
    if (dispatchTool === undefined || session === undefined) return;
    let output: string;
    try {
      output = await dispatchTool(call.name, call.arguments);
    } catch (err) {
      output = err instanceof Error ? err.message : String(err);
    }
    session.sendToolResult(call.callId, output);
  }

  /** Al terminar la respuesta: persistir el transcript del asistente y cerrar la salida. */
  private completeResponse(): void {
    const text = this.assistantBuffer;
    this.assistantBuffer = '';
    if (text.length > 0) {
      this.persistMessage('assistant', text);
      this.deps.onTranscript?.({ role: 'assistant', text });
    }
    this.closeOutputStream();
  }

  /**
   * Persiste un mensaje honrando la privacidad: si `storeTranscripts === false` no
   * guarda el texto; si `redactBeforeStore` aplica `redactSensitive` antes de
   * `addMessage`. La emisión por `onTranscript` (en la UI) ocurre fuera de aquí y
   * usa el texto original.
   */
  private persistMessage(role: 'user' | 'assistant', text: string): void {
    const privacy = this.deps.privacy;
    if (privacy?.storeTranscripts === false) {
      return;
    }
    const conversation = this.deps.conversation;
    const session = this.currentSession;
    if (!conversation || !session) {
      return;
    }
    const stored = privacy?.redactBeforeStore ? redactSensitive(text) : text;
    conversation.addMessage({ sessionId: session.id, role, text: stored });
  }

  // --- Salida de audio --------------------------------------------------------

  private ensureOutputStream(): void {
    if (this.outputStream !== undefined) return;
    const output = this.deps.output;
    if (output === undefined) return;
    const stream = createPushPullStream();
    this.outputStream = stream;
    // Encadena la reproducción del turno anterior antes de la nueva: así no se
    // solapan y, sobre todo, no quedan rechazos sin manejar al reasignar `playback`
    // en multi-turno (un fallo de un `play` previo se observa aquí).
    const previous = this.playback ?? Promise.resolve();
    this.playback = previous.catch(() => undefined).then(() => output.play(stream.read()));
  }

  private closeOutputStream(): void {
    this.outputStream?.end();
    this.outputStream = undefined;
  }

  // --- Memoria ----------------------------------------------------------------

  private async persistMemory(conversation: ConversationStore, sessionId: string): Promise<void> {
    const { summarizer, factExtractor, retriever } = this.deps;
    const index = retriever?.index?.bind(retriever);

    if (summarizer) {
      const summary = await summarizer.summarize(sessionId);
      if (summary.length > 0 && index) {
        await index({
          id: newId(),
          type: 'session_summary',
          content: summary,
          createdAt: this.now(),
          sessionId,
        });
      }
    }

    if (factExtractor) {
      const transcript = conversation
        .getMessages(sessionId)
        .map((m) => `${m.role}: ${m.text}`)
        .join('\n');
      const facts = await factExtractor.extract(transcript);
      if (index) {
        for (const content of facts) {
          await index({
            id: newId(),
            type: 'long_term_fact',
            content,
            createdAt: this.now(),
          });
        }
      }
    }
  }

  // --- Instrucciones / contexto ----------------------------------------------

  private async buildInstructions(query: string): Promise<string> {
    const locale = this.deps.locale;
    const retriever = this.deps.retriever;
    // En modo local no se recupera memoria: no se envía contexto RAG al modelo.
    const localOnly = this.deps.privacy?.localOnlyMode === true;
    const context =
      retriever === undefined || localOnly
        ? []
        : await retriever.retrieve(query, { limit: CONTEXT_LIMIT });
    return buildSystemPrompt({ context, ...(locale !== undefined ? { locale } : {}) });
  }

  // --- Utilidades de deps -----------------------------------------------------

  private require<K extends keyof OrchestratorDeps>(key: K): NonNullable<OrchestratorDeps[K]> {
    const value = this.deps[key];
    if (value === undefined) {
      throw missing(String(key));
    }
    return value as NonNullable<OrchestratorDeps[K]>;
  }

  private requireSession(): RealtimeModelSession {
    if (this.session === undefined) {
      throw missing('session (llama a startSession primero)');
    }
    return this.session;
  }
}
