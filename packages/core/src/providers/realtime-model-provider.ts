import type { AssistantState } from '@murmur/shared';

export interface RealtimeConnectOptions {
  apiKey: string;
  model: string;
  voice?: string;
  onState?: (state: AssistantState) => void;
  onAudio?: (chunk: Uint8Array) => void;
  onError?: (error: Error) => void;
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
