import type { AssistantState } from '@murmur/shared';

export interface RealtimeConnectOptions {
  apiKey: string;
  model: string;
  voice?: string;
  /** Instrucciones de sistema opcionales (placeholder; el prompt real es F10). */
  instructions?: string;
  onState?: (state: AssistantState) => void;
  onAudio?: (chunk: Uint8Array) => void;
  onError?: (error: Error) => void;
  /** Transcripción final del audio del usuario. */
  onUserTranscript?: (text: string) => void;
  /** Delta de transcripción del audio del asistente. */
  onAssistantTranscript?: (textDelta: string) => void;
  /** La conexión WebSocket se abrió y la sesión se inicializó. */
  onOpen?: () => void;
}

export interface RealtimeModelSession {
  sendAudio(chunk: Uint8Array): void;
  commit(): void;
  interrupt(): void;
  close(): Promise<void>;
}

/** Proveedor de modelo realtime (intercambiable: OpenAI Realtime u otros). */
export interface RealtimeModelProvider {
  readonly id: string;
  connect(options: RealtimeConnectOptions): Promise<RealtimeModelSession>;
}
