import type { PiperRun } from '@murmur/core';
import type { TauriInvoke } from './local-whisper-run';

export interface PiperRunOptions {
  invoke: TauriInvoke;
}

/** Adaptador `run` de Piper: invoca el comando Tauri `tts` y normaliza la respuesta a `Uint8Array`. */
export function createTauriPiperRun(options: PiperRunOptions): PiperRun {
  return async (text: string): Promise<Uint8Array> => {
    const bytes = await options.invoke<number[] | Uint8Array>('tts', { text });
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  };
}
