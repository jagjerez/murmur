import type { AudioStream } from './providers';

/**
 * `AudioStream` alimentado por un productor (callbacks de captura de audio) y
 * consumido como `AsyncIterable`. Conecta el mundo push (Web Audio dispara
 * bloques) con el mundo pull (el consumidor itera `read()`).
 */
export interface PushPullStream extends AudioStream {
  /** Encola un chunk para el consumidor. No-op tras `end`/`fail`/`stop`. */
  push(chunk: Uint8Array): void;
  /** Señala fin de stream: la iteración termina al drenar la cola. */
  end(): void;
  /** Aborta el stream propagando `err` al consumidor. */
  fail(err: Error): void;
}

interface Waiter {
  resolve: (result: IteratorResult<Uint8Array>) => void;
  reject: (err: Error) => void;
}

/**
 * Crea un stream productor/consumidor con backpressure simple basado en cola.
 * - Si hay datos en cola, `read` los entrega inmediatamente.
 * - Si la cola está vacía, `read` espera hasta el próximo `push`/`end`/`fail`.
 */
export function createPushPullStream(): PushPullStream {
  const queue: Uint8Array[] = [];
  const waiters: Waiter[] = [];
  let ended = false;
  let error: Error | null = null;

  function flushClosed(): void {
    // Al cerrar, todo consumidor en espera con la cola vacía recibe el cierre.
    while (waiters.length > 0 && queue.length === 0) {
      const waiter = waiters.shift()!;
      if (error) waiter.reject(error);
      else waiter.resolve({ done: true, value: undefined });
    }
  }

  function push(chunk: Uint8Array): void {
    if (ended || error) return;
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve({ done: false, value: chunk });
    } else {
      queue.push(chunk);
    }
  }

  function end(): void {
    if (ended || error) return;
    ended = true;
    flushClosed();
  }

  function fail(err: Error): void {
    if (ended || error) return;
    error = err;
    ended = true;
    queue.length = 0;
    flushClosed();
  }

  async function next(): Promise<IteratorResult<Uint8Array>> {
    if (queue.length > 0) {
      return { done: false, value: queue.shift()! };
    }
    if (error) throw error;
    if (ended) return { done: true, value: undefined };
    return new Promise<IteratorResult<Uint8Array>>((resolve, reject) => {
      waiters.push({ resolve, reject });
    });
  }

  async function stop(): Promise<void> {
    queue.length = 0;
    if (!ended && !error) ended = true;
    flushClosed();
  }

  return {
    push,
    end,
    fail,
    stop,
    read(): AsyncIterable<Uint8Array> {
      return {
        [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
          return { next };
        },
      };
    },
  };
}
