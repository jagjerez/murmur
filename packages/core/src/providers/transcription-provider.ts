export type TranscriptionMode = 'realtime' | 'whisper-api' | 'local-whisper';

/** Proveedor de transcripción (intercambiable: realtime / Whisper API / Whisper local). */
export interface TranscriptionProvider {
  readonly mode: TranscriptionMode;
  transcribe(audio: Uint8Array): Promise<string>;
}
