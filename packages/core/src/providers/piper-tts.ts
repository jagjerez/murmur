import { ModelError } from '@murmur/shared';
import type { TextToSpeechProvider } from './tts-provider';

/** Ejecutor del TTS local (Piper): texto → PCM16. Lo aporta el host (subproceso/comando Tauri). */
export type PiperRun = (text: string) => Promise<Uint8Array>;

export interface PiperTtsOptions {
  run: PiperRun;
}

/**
 * `TextToSpeechProvider` que delega en un `run` inyectado (Piper local). No empaqueta binario ni voz;
 * el host aporta `run`. Sin `run` lanza `ModelError`. Fallos del `run` → `ModelError`.
 */
export function createPiperTtsProvider(options: PiperTtsOptions): TextToSpeechProvider {
  if (typeof options?.run !== 'function') {
    throw new ModelError(
      'createPiperTtsProvider requiere un ejecutor `run`; el TTS local no se empaqueta aquí.',
    );
  }
  const run = options.run;
  return {
    async synthesize(text: string): Promise<Uint8Array> {
      try {
        return await run(text);
      } catch (cause) {
        throw new ModelError('El TTS local (Piper) falló al sintetizar.', { cause });
      }
    },
  };
}
