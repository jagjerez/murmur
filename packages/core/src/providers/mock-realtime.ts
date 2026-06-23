import type { AssistantState } from '@murmur/shared';
import type {
  RealtimeConnectOptions,
  RealtimeModelProvider,
  RealtimeModelSession,
} from './realtime-model-provider';

/**
 * Sesión de prueba: registra todas las llamadas del orchestrator (`sendAudio`,
 * `commit`, `interrupt`, `close`) en estructuras inspeccionables, sin tocar red.
 */
export interface MockRealtimeSession extends RealtimeModelSession {
  /** Chunks pasados a `sendAudio`, en orden. */
  readonly sentAudio: Uint8Array[];
  /** Número de llamadas a `commit`. */
  readonly commits: number;
  /** Número de llamadas a `interrupt`. */
  readonly interrupts: number;
  /** Número de llamadas a `close`. */
  readonly closes: number;
}

/**
 * Provider realtime de prueba: `connect` captura las `options` (incluidos los
 * callbacks) y devuelve una `MockRealtimeSession`. Los helpers `emit*` permiten
 * dirigir los eventos del modelo desde el test, simulando lo que haría el
 * servidor realtime (estados, audio, transcripciones, fin de respuesta, error).
 */
export interface MockRealtimeProvider extends RealtimeModelProvider {
  /** Opciones de la última conexión (con los callbacks registrados). */
  readonly lastOptions: RealtimeConnectOptions | undefined;
  /** Última sesión devuelta por `connect`. */
  readonly lastSession: MockRealtimeSession | undefined;
  /** Emite un cambio de estado del modelo (`onState`). */
  emitState(state: AssistantState): void;
  /** Emite un chunk de audio del asistente (`onAudio`). */
  emitAudio(chunk: Uint8Array): void;
  /** Emite la transcripción final del usuario (`onUserTranscript`). */
  emitUserTranscript(text: string): void;
  /** Emite un delta de transcripción del asistente (`onAssistantTranscript`). */
  emitAssistantTranscript(textDelta: string): void;
  /** Señala el fin de la respuesta del modelo: emite estado `idle`. */
  emitResponseDone(): void;
  /** Emite un error del modelo (`onError`). */
  emitError(error: Error): void;
}

function createSession(): MockRealtimeSession {
  const sentAudio: Uint8Array[] = [];
  let commits = 0;
  let interrupts = 0;
  let closes = 0;
  return {
    sentAudio,
    get commits() {
      return commits;
    },
    get interrupts() {
      return interrupts;
    },
    get closes() {
      return closes;
    },
    sendAudio(chunk: Uint8Array): void {
      sentAudio.push(chunk);
    },
    commit(): void {
      commits++;
    },
    interrupt(): void {
      interrupts++;
    },
    close(): Promise<void> {
      closes++;
      return Promise.resolve();
    },
  };
}

export function createMockRealtimeProvider(): MockRealtimeProvider {
  let lastOptions: RealtimeConnectOptions | undefined;
  let lastSession: MockRealtimeSession | undefined;

  return {
    id: 'mock-realtime',
    get lastOptions() {
      return lastOptions;
    },
    get lastSession() {
      return lastSession;
    },
    connect(options: RealtimeConnectOptions): Promise<RealtimeModelSession> {
      lastOptions = options;
      const session = createSession();
      lastSession = session;
      // Simula la apertura inmediata de la conexión, como el provider real.
      options.onOpen?.();
      return Promise.resolve(session);
    },
    emitState(state: AssistantState): void {
      lastOptions?.onState?.(state);
    },
    emitAudio(chunk: Uint8Array): void {
      lastOptions?.onAudio?.(chunk);
    },
    emitUserTranscript(text: string): void {
      lastOptions?.onUserTranscript?.(text);
    },
    emitAssistantTranscript(textDelta: string): void {
      lastOptions?.onAssistantTranscript?.(textDelta);
    },
    emitResponseDone(): void {
      lastOptions?.onState?.('idle');
    },
    emitError(error: Error): void {
      lastOptions?.onError?.(error);
    },
  };
}
