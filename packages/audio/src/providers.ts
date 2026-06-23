/** Flujo de audio como iterable asíncrono de chunks PCM. */
export interface AudioStream {
  read(): AsyncIterable<Uint8Array>;
  stop(): Promise<void>;
}

export interface VoiceInputProvider {
  readonly id: string;
  start(deviceId?: string): Promise<AudioStream>;
}

export interface VoiceOutputProvider {
  readonly id: string;
  play(chunks: AsyncIterable<Uint8Array>): Promise<void>;
  stop(): Promise<void>;
}

export interface AudioDevice {
  id: string;
  label: string;
  kind: 'input' | 'output';
}

export interface AudioDeviceManager {
  list(): Promise<AudioDevice[]>;
}

/** Placeholder funcional para Fase 0 / tests. Implementación real en Fase 4. */
export function createNullAudioDeviceManager(): AudioDeviceManager {
  return {
    list: async () => [],
  };
}
