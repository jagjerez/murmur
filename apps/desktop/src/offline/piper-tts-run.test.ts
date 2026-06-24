import { describe, it, expect, vi } from 'vitest';
import { createTauriPiperRun } from './piper-tts-run';
import type { TauriInvoke } from './local-whisper-run';

describe('createTauriPiperRun', () => {
  it('invoca el comando tts y devuelve PCM (Uint8Array)', async () => {
    const invoke = vi.fn(async () => [1, 2, 3, 4]) as unknown as TauriInvoke;
    const run = createTauriPiperRun({ invoke });
    const pcm = await run('hola');
    expect(Array.from(pcm)).toEqual([1, 2, 3, 4]);
    expect(invoke).toHaveBeenCalledWith('tts', { text: 'hola' });
  });
});
