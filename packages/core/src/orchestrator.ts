import { MurmurError, type AssistantState } from '@murmur/shared';
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
  MemoryItem,
  NewMemoryItem,
  RagRetriever,
  SessionSummarizer,
} from '@murmur/rag';
import type { Session } from '@murmur/shared';
import type {
  RealtimeModelProvider,
  RealtimeModelSession,
} from './providers/realtime-model-provider';

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
  onStateChange?: (state: AssistantState) => void;
  onTranscript?: (event: { role: 'user' | 'assistant'; text: string }) => void;
  onError?: (error: Error) => void;
  now?: () => number;
}

/** Compat F0: el constructor admite sólo `onStateChange`. */
export type OrchestratorEvents = Pick<OrchestratorDeps, 'onStateChange'>;

const CONTEXT_LIMIT = 5;
const BASE_INSTRUCTIONS =
  'Eres murmur, un asistente de voz cálido y conciso. Responde de forma natural y breve.';

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
   * construye unas `instructions` básicas y conecta el provider realtime
   * registrando los callbacks del pipeline.
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
      onState: (s) => this.handleState(s),
      onAudio: (chunk) => this.handleAudio(chunk),
      onUserTranscript: (text) => this.handleUserTranscript(text),
      onAssistantTranscript: (delta) => this.handleAssistantTranscript(delta),
      onError: (err) => this.handleError(err),
    });

    return this.currentSession;
  }

  /** Arranca la captura de audio y envía cada chunk PCM al modelo. */
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

  /** Barge-in: cancela la respuesta en curso y detiene la reproducción. */
  async interrupt(): Promise<void> {
    this.session?.interrupt();
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
    const conversation = this.deps.conversation;
    const session = this.currentSession;
    if (conversation && session) {
      conversation.addMessage({ sessionId: session.id, role: 'user', text });
    }
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

  /** Al terminar la respuesta: persistir el transcript del asistente y cerrar la salida. */
  private completeResponse(): void {
    const text = this.assistantBuffer;
    this.assistantBuffer = '';
    if (text.length > 0) {
      const conversation = this.deps.conversation;
      const session = this.currentSession;
      if (conversation && session) {
        conversation.addMessage({ sessionId: session.id, role: 'assistant', text });
      }
      this.deps.onTranscript?.({ role: 'assistant', text });
    }
    this.closeOutputStream();
  }

  // --- Salida de audio --------------------------------------------------------

  private ensureOutputStream(): void {
    if (this.outputStream !== undefined) return;
    const output = this.deps.output;
    if (output === undefined) return;
    const stream = createPushPullStream();
    this.outputStream = stream;
    this.playback = output.play(stream.read());
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
    const retriever = this.deps.retriever;
    if (retriever === undefined) {
      return BASE_INSTRUCTIONS;
    }
    const items = await retriever.retrieve(query, { limit: CONTEXT_LIMIT });
    if (items.length === 0) {
      return BASE_INSTRUCTIONS;
    }
    const context = items.map((i: MemoryItem) => `- ${i.content}`).join('\n');
    return `${BASE_INSTRUCTIONS}\n\nContexto relevante sobre el usuario:\n${context}`;
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
