import { describe, it, expect } from 'vitest';
import { createMockTextToSpeechProvider } from './tts-provider';

describe('createMockTextToSpeechProvider', () => {
  it('devuelve el PCM fijo dado', async () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const tts = createMockTextToSpeechProvider(pcm);
    expect(await tts.synthesize('hola')).toEqual(pcm);
  });

  it('por defecto devuelve PCM no vacío y registra el último texto', async () => {
    const tts = createMockTextToSpeechProvider();
    const out = await tts.synthesize('hola mundo');
    expect(out.length).toBeGreaterThan(0);
    expect(tts.lastText).toBe('hola mundo');
  });
});
