/**
 * `TextToSpeechProvider` — síntesis de voz. `synthesize` devuelve PCM16 mono 24 kHz (formato
 * canónico de F4), listo para `VoiceOutputProvider.play`. Implementaciones reales (Piper) viven
 * fuera de core; aquí solo el contrato y un mock determinista para tests/offline.
 */
export interface TextToSpeechProvider {
  synthesize(text: string): Promise<Uint8Array>;
}

/** Mock determinista: devuelve `pcm` (o 8 bytes constantes) y recuerda el último texto. */
export interface MockTextToSpeechProvider extends TextToSpeechProvider {
  lastText: string | undefined;
}

export function createMockTextToSpeechProvider(pcm?: Uint8Array): MockTextToSpeechProvider {
  const fixed = pcm ?? new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const provider: MockTextToSpeechProvider = {
    lastText: undefined,
    synthesize(text: string): Promise<Uint8Array> {
      provider.lastText = text;
      return Promise.resolve(fixed);
    },
  };
  return provider;
}
