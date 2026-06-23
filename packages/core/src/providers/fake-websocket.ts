/**
 * `FakeWebSocket` — doble de test reutilizable para el protocolo realtime (F5).
 *
 * Implementa el subconjunto `WebSocketLike` que usa el provider y añade helpers
 * para los tests: registra los mensajes enviados en `sent`, permite emitir
 * eventos del servidor con `emitServerEvent(obj)` y simular `open`/`close`/`error`.
 * No abre ninguna conexión real: todo ocurre en memoria, sin red.
 */

export type FakeWebSocketEventType = 'open' | 'message' | 'close' | 'error';

type Listener = (ev: unknown) => void;

export interface FakeWebSocket {
  /** URL pasada al constructor. */
  readonly url: string;
  /** Subprotocolos pasados al constructor (incluye la auth por subprotocolo). */
  readonly protocols: string[];
  /** Mensajes enviados por el cliente, en orden. */
  readonly sent: string[];
  readyState: number;

  send(data: string): void;
  close(): void;
  addEventListener(type: FakeWebSocketEventType, cb: Listener): void;

  onopen: Listener | null;
  onmessage: Listener | null;
  onclose: Listener | null;
  onerror: Listener | null;

  // Helpers de test.
  /** Dispara `open` y pasa a estado OPEN. */
  simulateOpen(): void;
  /** Dispara `message` con `{ data: JSON.stringify(obj) }`. */
  emitServerEvent(obj: unknown): void;
  /** Dispara `error`. */
  simulateError(): void;
  /** Dispara `close` y pasa a estado CLOSED. */
  simulateClose(): void;
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

export function createFakeWebSocket(url: string, protocols: string[] = []): FakeWebSocket {
  const listeners: Record<FakeWebSocketEventType, Listener[]> = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  const ws: FakeWebSocket = {
    url,
    protocols,
    sent: [],
    readyState: CONNECTING,
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,

    send(data: string): void {
      ws.sent.push(data);
    },

    close(): void {
      ws.simulateClose();
    },

    addEventListener(type: FakeWebSocketEventType, cb: Listener): void {
      listeners[type].push(cb);
    },

    simulateOpen(): void {
      ws.readyState = OPEN;
      dispatch('open', {});
    },

    emitServerEvent(obj: unknown): void {
      dispatch('message', { data: JSON.stringify(obj) });
    },

    simulateError(): void {
      dispatch('error', {});
    },

    simulateClose(): void {
      if (ws.readyState === CLOSED) return;
      ws.readyState = CLOSED;
      dispatch('close', {});
    },
  };

  function dispatch(type: FakeWebSocketEventType, ev: unknown): void {
    for (const cb of listeners[type]) cb(ev);
    const prop = (
      {
        open: ws.onopen,
        message: ws.onmessage,
        close: ws.onclose,
        error: ws.onerror,
      } as const
    )[type];
    prop?.(ev);
  }

  return ws;
}
