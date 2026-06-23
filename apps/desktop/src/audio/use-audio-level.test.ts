import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup, waitFor, act } from '@testing-library/react';
import { createMockVoiceInput, float32ToPcm16 } from '@murmur/audio';
import { useAudioLevel } from './use-audio-level';

afterEach(cleanup);

function pcmOf(samples: number[]): Uint8Array {
  return float32ToPcm16(new Float32Array(samples));
}

describe('useAudioLevel', () => {
  it('arranca en 0 cuando no está activo', () => {
    const input = createMockVoiceInput([pcmOf([1, 1, 1, 1])]);
    const { result } = renderHook(() => useAudioLevel(input, false));
    expect(result.current).toBe(0);
  });

  it('cuando active, emite niveles 0..1 a partir de los chunks del input', async () => {
    // RMS de señal constante de amplitud 1 ≈ 1.
    const input = createMockVoiceInput([pcmOf([1, 1, 1, 1])]);
    const { result } = renderHook(() => useAudioLevel(input, true));
    await waitFor(() => expect(result.current).toBeGreaterThan(0.5));
    expect(result.current).toBeLessThanOrEqual(1);
  });

  it('un input silencioso mantiene el nivel cerca de 0', async () => {
    const input = createMockVoiceInput([pcmOf([0, 0, 0, 0])]);
    const { result } = renderHook(() => useAudioLevel(input, true));
    // Damos tiempo a que procese el chunk; el nivel debe quedarse bajo.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).toBeLessThan(0.1);
  });

  it('vuelve a 0 al desactivarse', async () => {
    const input = createMockVoiceInput([pcmOf([1, 1, 1, 1])]);
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useAudioLevel(input, active),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current).toBeGreaterThan(0.5));
    rerender({ active: false });
    await waitFor(() => expect(result.current).toBe(0));
  });

  it('sin input no hace nada y queda en 0', () => {
    const { result } = renderHook(() => useAudioLevel(undefined, true));
    expect(result.current).toBe(0);
  });
});
