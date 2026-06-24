import { describe, it, expect, vi } from 'vitest';
import { ModelError } from '@murmur/shared';
import { createPiperTtsProvider } from './piper-tts';

describe('createPiperTtsProvider', () => {
  it('delega en run y devuelve su PCM', async () => {
    const pcm = new Uint8Array([1, 2, 3]);
    const run = vi.fn(async (_t: string) => pcm);
    const tts = createPiperTtsProvider({ run });
    expect(await tts.synthesize('hola')).toBe(pcm);
    expect(run).toHaveBeenCalledWith('hola');
  });

  it('un fallo de run → ModelError', async () => {
    const tts = createPiperTtsProvider({
      run: async () => {
        throw new Error('piper no encontrado');
      },
    });
    await expect(tts.synthesize('x')).rejects.toBeInstanceOf(ModelError);
  });

  it('exige run', () => {
    expect(() => createPiperTtsProvider({} as never)).toThrow(ModelError);
  });
});
