import type {
  AudioDevice,
  AudioDeviceManager,
  AudioStream,
  VoiceInputProvider,
  VoiceOutputProvider,
} from './providers';
import { createPushPullStream } from './stream';

/** Provider de entrada de prueba que emite chunks predefinidos. */
export interface MockVoiceInput extends VoiceInputProvider {
  /** Último `deviceId` pasado a `start` (o `undefined`). */
  readonly lastDeviceId: string | undefined;
}

/**
 * Crea un `VoiceInputProvider` que, al arrancar, emite los `chunks` dados en
 * orden y termina. Útil para tests y para el orchestrator (F9).
 */
export function createMockVoiceInput(chunks: readonly Uint8Array[]): MockVoiceInput {
  let lastDeviceId: string | undefined;
  return {
    id: 'mock-input',
    get lastDeviceId() {
      return lastDeviceId;
    },
    async start(deviceId?: string): Promise<AudioStream> {
      lastDeviceId = deviceId;
      const stream = createPushPullStream();
      // Emite de forma síncrona: la cola conserva el orden hasta que se lea.
      for (const chunk of chunks) stream.push(chunk);
      stream.end();
      return stream;
    },
  };
}

/** Provider de salida de prueba que acumula en memoria lo reproducido. */
export interface MemoryVoiceOutput extends VoiceOutputProvider {
  /** Copia de los chunks reproducidos, en orden. */
  chunks(): Uint8Array[];
  /** `true` tras llamar a `stop`. */
  readonly stopped: boolean;
}

/** Crea un `VoiceOutputProvider` que acumula los chunks reproducidos. */
export function createMemoryVoiceOutput(): MemoryVoiceOutput {
  const recorded: Uint8Array[] = [];
  let stopped = false;
  return {
    id: 'memory-output',
    get stopped() {
      return stopped;
    },
    chunks(): Uint8Array[] {
      return recorded.slice();
    },
    async play(chunks: AsyncIterable<Uint8Array>): Promise<void> {
      for await (const chunk of chunks) recorded.push(chunk);
    },
    async stop(): Promise<void> {
      stopped = true;
    },
  };
}

/** Crea un `AudioDeviceManager` que devuelve la lista dada (vacía por defecto). */
export function createMockAudioDeviceManager(
  devices: readonly AudioDevice[] = [],
): AudioDeviceManager {
  return {
    list: async () => devices.slice(),
  };
}
