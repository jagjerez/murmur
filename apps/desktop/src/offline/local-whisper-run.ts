import { pcm16ToFloat32, resampleLinear, PCM_SAMPLE_RATE } from '@murmur/audio';
import type { LocalWhisperRun } from '@murmur/core';

/** `invoke` de Tauri inyectable (en tests, un mock). */
export type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

export interface LocalWhisperRunOptions {
  invoke: TauriInvoke;
  /** Frecuencia que espera whisper (16 kHz). */
  targetRate?: number;
}

/**
 * Adaptador `run` para `local-whisper`: convierte el PCM16 24 kHz capturado a f32 16 kHz (lo que
 * espera whisper.cpp) y delega en el comando Tauri `transcribe`, que corre whisper-rs en nativo.
 */
export function createTauriLocalWhisperRun(options: LocalWhisperRunOptions): LocalWhisperRun {
  const target = options.targetRate ?? 16000;
  return async (audio: Uint8Array): Promise<string> => {
    const f32at24 = pcm16ToFloat32(audio);
    const f32at16 = resampleLinear(f32at24, PCM_SAMPLE_RATE, target);
    return options.invoke<string>('transcribe', { samples: Array.from(f32at16) });
  };
}
