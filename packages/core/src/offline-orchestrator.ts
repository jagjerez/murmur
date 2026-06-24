import { MurmurError, redactSensitive, type AssistantState, type Session } from '@murmur/shared';
import {
  concatChunks,
  type AudioStream,
  type VoiceInputProvider,
  type VoiceOutputProvider,
} from '@murmur/audio';
import type {
  ChatMessage,
  ChatProvider,
  ConversationStore,
  FactExtractor,
  NewMemoryItem,
  RagRetriever,
  SessionSummarizer,
} from '@murmur/rag';
import type { TranscriptionProvider } from './providers/transcription-provider';
import type { TextToSpeechProvider } from './providers/tts-provider';
import { buildSystemPrompt, type PromptLocale } from './prompt';
import type { OrchestratorPrivacy } from './orchestrator';

export type OfflineIndexingRetriever = RagRetriever & {
  index?(item: NewMemoryItem): Promise<void>;
};

export interface OfflineOrchestratorDeps {
  input: VoiceInputProvider;
  transcription: TranscriptionProvider;
  chat: ChatProvider;
  tts: TextToSpeechProvider;
  output: VoiceOutputProvider;
  conversation: ConversationStore;
  retriever?: OfflineIndexingRetriever;
  summarizer?: SessionSummarizer;
  factExtractor?: FactExtractor;
  privacy?: OrchestratorPrivacy;
  locale?: PromptLocale;
  onStateChange?: (state: AssistantState) => void;
  onTranscript?: (event: { role: 'user' | 'assistant'; text: string }) => void;
  onError?: (error: Error) => void;
  now?: () => number;
}

const CONTEXT_LIMIT = 5;

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function missing(dep: string): MurmurError {
  return new MurmurError(
    `OfflineConversationOrchestrator: falta la dependencia '${dep}' para esta operación.`,
    'ORCHESTRATOR_MISSING_DEP',
  );
}

/**
 * Orquestador de conversación **offline** por turnos: captura → STT → (prompt+RAG) → LLM → TTS →
 * reproducción, persistiendo el turno y la memoria. Equivale al `ConversationOrchestrator` realtime
 * pero sin nube. Deps inyectables; testeable con mocks.
 */
export class OfflineConversationOrchestrator {
  private state: AssistantState = 'idle';
  private readonly deps: Partial<OfflineOrchestratorDeps>;
  private readonly now: () => number;
  private currentSession: Session | undefined;
  private capture: Uint8Array[] = [];
  private inputStream: AudioStream | undefined;
  /** Promesa del bucle de captura en curso; `stopListening` la espera tras cerrar el stream. */
  private captureDone: Promise<void> | undefined;
  private playback: Promise<void> | undefined;

  constructor(deps: Partial<OfflineOrchestratorDeps> = {}) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

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

  async startSession(): Promise<Session> {
    const conversation = this.require('conversation');
    this.currentSession = conversation.createSession();
    return this.currentSession;
  }

  /**
   * Arranca la captura y acumula el audio del turno. **Contrato fire-and-forget:** con un proveedor
   * real (stream continuo) la promesa NO resuelve hasta que `stopListening` cierra el stream; el
   * consumidor debe lanzarla sin `await` bloqueante (un mock que auto-cierra el stream sí resuelve).
   */
  async startListening(deviceId?: string): Promise<void> {
    const input = this.require('input');
    this.requireSession();
    this.capture = [];
    this.setState('listening');
    const stream = await input.start(deviceId);
    this.inputStream = stream;
    this.captureDone = this.drain(stream);
    await this.captureDone;
  }

  /** Bucle de captura: vuelca los chunks del stream en `this.capture` hasta que el stream termina. */
  private async drain(stream: AudioStream): Promise<void> {
    for await (const chunk of stream.read()) {
      this.capture.push(chunk);
    }
  }

  /**
   * Cierra la captura y procesa el turno completo (STT→LLM→TTS→reproducción). A diferencia del
   * orquestador realtime, aquí `stopListening` ejecuta TODO el pipeline de forma bloqueante:
   * **debe esperarse con `await`** (si no, el turno corre en una promesa suelta). Errores de
   * cualquier etapa → estado `error` + `onError`, sin romper la sesión.
   */
  async stopListening(): Promise<void> {
    const session = this.requireSession();
    // Cierra el stream y espera a que el bucle de captura drene antes de transcribir.
    if (this.inputStream !== undefined) {
      await this.inputStream.stop();
      this.inputStream = undefined;
    }
    if (this.captureDone !== undefined) {
      await this.captureDone;
      this.captureDone = undefined;
    }
    const audio = concatChunks(this.capture);
    this.capture = [];
    try {
      this.setState('thinking');
      const userText = await this.require('transcription').transcribe(audio);
      this.persistAndEmit('user', userText);

      const messages = await this.buildMessages(session, userText);
      const assistantText = await this.require('chat').complete(messages);
      this.persistAndEmit('assistant', assistantText);

      this.setState('speaking');
      const pcm = await this.require('tts').synthesize(assistantText);
      const output = this.require('output');
      this.playback = output.play(this.once(pcm));
      await this.playback;
      this.setState('idle');
    } catch (err) {
      this.setState('error');
      this.deps.onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async endSession(): Promise<void> {
    const conversation = this.require('conversation');
    const session = this.currentSession;
    if (session === undefined) throw missing('session');
    conversation.endSession(session.id);
    await this.persistMemory(conversation, session.id);
    this.currentSession = undefined;
    this.setState('idle');
  }

  /** Espera la reproducción del turno en curso. Útil en tests si `stopListening` no se await-eó. */
  async flush(): Promise<void> {
    await this.playback;
  }

  private async *once(pcm: Uint8Array): AsyncIterable<Uint8Array> {
    yield pcm;
  }

  private persistAndEmit(role: 'user' | 'assistant', text: string): void {
    const privacy = this.deps.privacy;
    const conversation = this.deps.conversation;
    const session = this.currentSession;
    if (conversation && session && privacy?.storeTranscripts !== false) {
      const stored = privacy?.redactBeforeStore ? redactSensitive(text) : text;
      conversation.addMessage({ sessionId: session.id, role, text: stored });
    }
    this.deps.onTranscript?.({ role, text });
  }

  private async buildMessages(session: Session, userText: string): Promise<ChatMessage[]> {
    const retriever = this.deps.retriever;
    const localOnly = this.deps.privacy?.localOnlyMode === true;
    const context =
      retriever === undefined || localOnly
        ? []
        : await retriever.retrieve(userText, { limit: CONTEXT_LIMIT });
    const locale = this.deps.locale;
    const system = buildSystemPrompt({ context, ...(locale !== undefined ? { locale } : {}) });
    const history: ChatMessage[] = (this.deps.conversation?.getMessages(session.id) ?? []).map(
      (m) => ({
        role: m.role,
        content: m.text,
      }),
    );
    return [{ role: 'system', content: system }, ...history];
  }

  private async persistMemory(conversation: ConversationStore, sessionId: string): Promise<void> {
    const { summarizer, factExtractor, retriever } = this.deps;
    const index = retriever?.index?.bind(retriever);
    if (summarizer) {
      const summary = await summarizer.summarize(sessionId);
      if (summary.length > 0 && index)
        await index({
          id: newId(),
          type: 'session_summary',
          content: summary,
          createdAt: this.now(),
          sessionId,
        });
    }
    if (factExtractor) {
      const transcript = conversation
        .getMessages(sessionId)
        .map((m) => `${m.role}: ${m.text}`)
        .join('\n');
      const facts = await factExtractor.extract(transcript);
      if (index)
        for (const content of facts)
          await index({ id: newId(), type: 'long_term_fact', content, createdAt: this.now() });
    }
  }

  private require<K extends keyof OfflineOrchestratorDeps>(
    key: K,
  ): NonNullable<OfflineOrchestratorDeps[K]> {
    const value = this.deps[key];
    if (value === undefined) throw missing(String(key));
    return value as NonNullable<OfflineOrchestratorDeps[K]>;
  }

  private requireSession(): Session {
    if (this.currentSession === undefined) throw missing('session (llama a startSession primero)');
    return this.currentSession;
  }
}
