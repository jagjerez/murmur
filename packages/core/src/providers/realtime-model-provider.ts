import type { AssistantState } from '@murmur/shared';

/** Definición de una tool que el modelo puede invocar (formato function-calling del realtime). */
export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  /** JSON Schema de los parámetros; sólo se serializa, de ahí `unknown` (desacopla de @murmur/plugins). */
  parameters: unknown;
}

/** Una llamada a tool emitida por el modelo, con los argumentos ya parseados. */
export interface RealtimeToolCall {
  /** Identificador de la llamada; debe devolverse en `sendToolResult`. */
  callId: string;
  /** Nombre de la tool (coincide con `RealtimeTool.name`). */
  name: string;
  /** Argumentos parseados del JSON enviado por el modelo. */
  arguments: Record<string, unknown>;
}

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
  /** Tools que el modelo puede invocar (function-calling). Si se omite, no se declaran tools. */
  tools?: RealtimeTool[];
  /** El modelo pidió ejecutar una tool; el host la ejecuta y responde con `sendToolResult`. */
  onToolCall?: (call: RealtimeToolCall) => void;
}

export interface RealtimeModelSession {
  sendAudio(chunk: Uint8Array): void;
  commit(): void;
  interrupt(): void;
  /** Devuelve al modelo el resultado (texto) de una tool, identificada por `callId`. */
  sendToolResult(callId: string, output: string): void;
  close(): Promise<void>;
}

/** Proveedor de modelo realtime (intercambiable: OpenAI Realtime u otros). */
export interface RealtimeModelProvider {
  readonly id: string;
  connect(options: RealtimeConnectOptions): Promise<RealtimeModelSession>;
}
