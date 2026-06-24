/**
 * `OpenAIRealtimeProvider` — implementación real de `RealtimeModelProvider`
 * contra la OpenAI Realtime API sobre WebSocket (F5).
 *
 * El WebSocket es inyectable (`webSocketFactory`) para poder testear todo el
 * protocolo sin red con un `FakeWebSocket`. El audio usa el formato canónico de
 * la Fase 4 (PCM16 mono 24 kHz, base64).
 *
 * AUTENTICACIÓN — la API key viaja en un subprotocolo del WebSocket
 * (`openai-insecure-api-key.<KEY>`). Esto funciona en navegador/webview, pero
 * EXPONE la key al cliente: aceptable para una app local con BYO-key. El
 * endurecimiento (token efímero / proxy nativo) se aborda en F12/F16. La key
 * NUNCA se loguea ni se incluye en los mensajes del protocolo.
 */

import { base64ToPcm16, pcm16ToBase64 } from '@murmur/audio';
import { ModelError, type AssistantState } from '@murmur/shared';
import type {
  RealtimeConnectOptions,
  RealtimeModelProvider,
  RealtimeModelSession,
} from './realtime-model-provider';

/** Subconjunto mínimo de WebSocket que usa el provider. */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
  readyState: number;
  addEventListener(type: 'open' | 'message' | 'close' | 'error', cb: (ev: unknown) => void): void;
}

/** Factory inyectable: crea un WebSocket dado url + subprotocolos. */
export type WebSocketFactory = (url: string, protocols?: string[]) => WebSocketLike;

export interface OpenAIRealtimeDeps {
  webSocketFactory?: WebSocketFactory;
}

const PROVIDER_ID = 'openai-realtime';
const REALTIME_URL = 'wss://api.openai.com/v1/realtime';
const WS_OPEN = 1;

function defaultWebSocketFactory(url: string, protocols?: string[]): WebSocketLike {
  const Ctor = (globalThis as { WebSocket?: unknown }).WebSocket;
  if (typeof Ctor !== 'function') {
    throw new ModelError('No hay WebSocket disponible en este entorno (globalThis.WebSocket).');
  }
  return new (Ctor as new (url: string, protocols?: string[]) => WebSocketLike)(url, protocols);
}

interface ServerEvent {
  type?: string;
  delta?: string;
  transcript?: string;
  error?: { message?: string } | string;
  [key: string]: unknown;
}

/**
 * Sesión realtime: registra los listeners del WS, hace el `session.update` al
 * abrir y traduce los eventos del servidor a callbacks/estado.
 */
class OpenAIRealtimeSession implements RealtimeModelSession {
  private state: AssistantState = 'idle';
  private spokeThisResponse = false;
  private closed = false;

  constructor(
    private readonly ws: WebSocketLike,
    private readonly options: RealtimeConnectOptions,
  ) {
    this.ws.addEventListener('open', () => this.handleOpen());
    this.ws.addEventListener('message', (ev) => this.handleMessage(ev));
    this.ws.addEventListener('error', () => this.handleError());
    this.ws.addEventListener('close', () => this.handleClose());
  }

  sendAudio(chunk: Uint8Array): void {
    this.send({ type: 'input_audio_buffer.append', audio: pcm16ToBase64(chunk) });
  }

  commit(): void {
    this.send({ type: 'input_audio_buffer.commit' });
    this.send({ type: 'response.create' });
  }

  interrupt(): void {
    this.send({ type: 'response.cancel' });
    this.send({ type: 'input_audio_buffer.clear' });
  }

  sendToolResult(callId: string, output: string): void {
    this.send({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: callId, output },
    });
    this.send({ type: 'response.create' });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.ws.close();
  }

  // --- Internos ---

  private send(message: Record<string, unknown>): void {
    if (this.closed) return;
    this.ws.send(JSON.stringify(message));
  }

  private setState(next: AssistantState): void {
    if (this.state === next) return;
    this.state = next;
    this.options.onState?.(next);
  }

  private handleOpen(): void {
    const session: Record<string, unknown> = {
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      modalities: ['audio', 'text'],
      turn_detection: { type: 'server_vad' },
    };
    if (this.options.voice !== undefined) session.voice = this.options.voice;
    if (this.options.instructions !== undefined) {
      session.instructions = this.options.instructions;
    }
    // `tools: []` equivale a omitirlo: no declaramos tools ni enviamos un `tool_choice` vacío.
    if (this.options.tools !== undefined && this.options.tools.length > 0) {
      session.tools = this.options.tools;
      session.tool_choice = 'auto';
    }
    this.send({ type: 'session.update', session });
    this.options.onOpen?.();
  }

  private handleError(): void {
    this.emitError(new ModelError('Fallo de conexión con OpenAI Realtime.'));
  }

  private handleClose(): void {
    // El servidor cerró: no es un error por sí mismo; la sesión queda cerrada.
    this.closed = true;
  }

  private handleMessage(ev: unknown): void {
    const data = (ev as { data?: unknown }).data;
    if (typeof data !== 'string') return;
    let event: ServerEvent;
    try {
      event = JSON.parse(data) as ServerEvent;
    } catch {
      return;
    }
    this.dispatch(event);
  }

  private dispatch(event: ServerEvent): void {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.setState('listening');
        break;
      case 'input_audio_buffer.speech_stopped':
      case 'input_audio_buffer.committed':
      case 'response.created':
        this.spokeThisResponse = false;
        this.setState('thinking');
        break;
      // Audio del asistente: nombre GA y nombre preview.
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        this.handleAudioDelta(event.delta);
        break;
      // Transcripción del asistente: nombre GA y nombre preview.
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (typeof event.delta === 'string') {
          this.options.onAssistantTranscript?.(event.delta);
        }
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (typeof event.transcript === 'string') {
          this.options.onUserTranscript?.(event.transcript);
        }
        break;
      case 'response.done':
        this.setState('idle');
        break;
      case 'error':
        this.emitError(new ModelError(`OpenAI Realtime: ${this.errorMessage(event.error)}`));
        break;
      default:
        break;
    }
  }

  private handleAudioDelta(delta: string | undefined): void {
    if (typeof delta !== 'string' || delta.length === 0) return;
    if (!this.spokeThisResponse) {
      this.spokeThisResponse = true;
      this.setState('speaking');
    }
    this.options.onAudio?.(base64ToPcm16(delta));
  }

  private errorMessage(error: ServerEvent['error']): string {
    if (typeof error === 'string') return error;
    if (error && typeof error.message === 'string') return error.message;
    return 'error desconocido';
  }

  private emitError(error: ModelError): void {
    this.setState('error');
    this.options.onError?.(error);
  }
}

function buildProtocols(apiKey: string): string[] {
  return ['realtime', `openai-insecure-api-key.${apiKey}`, 'openai-beta.realtime-v1'];
}

export function createOpenAIRealtimeProvider(deps: OpenAIRealtimeDeps = {}): RealtimeModelProvider {
  const factory = deps.webSocketFactory ?? defaultWebSocketFactory;

  return {
    id: PROVIDER_ID,
    connect(options: RealtimeConnectOptions): Promise<RealtimeModelSession> {
      const url = `${REALTIME_URL}?model=${encodeURIComponent(options.model)}`;
      let ws: WebSocketLike;
      try {
        ws = factory(url, buildProtocols(options.apiKey));
      } catch (cause) {
        return Promise.reject(
          cause instanceof ModelError
            ? cause
            : new ModelError('No se pudo crear el WebSocket de OpenAI Realtime.', { cause }),
        );
      }

      const session = new OpenAIRealtimeSession(ws, options);

      // Resolvemos en cuanto el WS está (o se considera) abierto. El protocolo
      // posterior se gestiona por callbacks; los errores van a `onError`.
      return new Promise<RealtimeModelSession>((resolve) => {
        if (ws.readyState === WS_OPEN) {
          resolve(session);
          return;
        }
        ws.addEventListener('open', () => resolve(session));
        // Un fallo de conexión también resuelve: la sesión existe y ya habrá
        // notificado el error vía `onError`. El consumidor decide cerrarla.
        ws.addEventListener('error', () => resolve(session));
        ws.addEventListener('close', () => resolve(session));
      });
    },
  };
}
