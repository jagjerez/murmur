import { describe, it, expect, vi } from 'vitest';
import { float32ToPcm16 } from '@murmur/audio';
import { createTauriLocalWhisperRun, type TauriInvoke } from './local-whisper-run';

describe('createTauriLocalWhisperRun', () => {
  it('resamplea 24k→16k, pasa f32 al comando y devuelve el texto', async () => {
    const invoke = vi.fn(async (_cmd: string, args: { samples: number[] }) => {
      expect(args.samples.length).toBe(16); // 24 muestras @24k → 16 @16k
      return 'hola mundo';
    }) as unknown as TauriInvoke;
    const run = createTauriLocalWhisperRun({ invoke, targetRate: 16000 });
    const pcm = float32ToPcm16(new Float32Array(24).fill(0.1));
    const text = await run(pcm);
    expect(text).toBe('hola mundo');
    expect(invoke).toHaveBeenCalledWith(
      'transcribe',
      expect.objectContaining({ samples: expect.any(Array) }),
    );
  });
});
