import { describe, it, expect } from 'vitest';
import {
  float32ToPcm16,
  pcm16ToFloat32,
  resampleLinear,
  concatChunks,
  chunkBytes,
  rms,
  pcm16ToBase64,
  base64ToPcm16,
  PCM_SAMPLE_RATE,
} from './pcm';

describe('formato canónico', () => {
  it('expone el sample rate de OpenAI Realtime (24 kHz)', () => {
    expect(PCM_SAMPLE_RATE).toBe(24000);
  });
});

describe('float32ToPcm16 / pcm16ToFloat32', () => {
  it('round-trip conserva la señal dentro de tolerancia de cuantización', () => {
    const src = new Float32Array([0, 0.25, -0.25, 0.5, -0.5, 1, -1]);
    const bytes = float32ToPcm16(src);
    // 2 bytes por muestra.
    expect(bytes.byteLength).toBe(src.length * 2);
    const back = pcm16ToFloat32(bytes);
    expect(back.length).toBe(src.length);
    for (let i = 0; i < src.length; i++) {
      // Paso de cuantización ~ 1/32767.
      expect(Math.abs(back[i]! - src[i]!)).toBeLessThan(1 / 32000);
    }
  });

  it('hace clamp de valores fuera de [-1, 1]', () => {
    const bytes = float32ToPcm16(new Float32Array([2, -2]));
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getInt16(0, true)).toBe(32767);
    expect(view.getInt16(2, true)).toBe(-32768);
  });

  it('codifica little-endian', () => {
    // 0.5 * 32767 = 16383.5 → round 16384 (0x4000) little-endian → bytes [0x00, 0x40].
    const bytes = float32ToPcm16(new Float32Array([0.5]));
    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x40);
  });
});

describe('resampleLinear', () => {
  it('devuelve la misma señal si in === out', () => {
    const src = new Float32Array([0, 0.5, 1, -1]);
    const out = resampleLinear(src, 24000, 24000);
    expect(Array.from(out)).toEqual(Array.from(src));
    // No debe ser el mismo objeto (copia segura).
    expect(out).not.toBe(src);
  });

  it('al bajar 48k→24k produce aproximadamente la mitad de muestras', () => {
    const src = new Float32Array(480); // 10ms @ 48k
    for (let i = 0; i < src.length; i++) src[i] = Math.sin((i / 48000) * 2 * Math.PI * 440);
    const out = resampleLinear(src, 48000, 24000);
    expect(out.length).toBe(240); // 10ms @ 24k
  });

  it('al subir 24k→48k produce aproximadamente el doble de muestras', () => {
    const src = new Float32Array(240);
    const out = resampleLinear(src, 24000, 48000);
    expect(out.length).toBe(480);
  });

  it('conserva el primer extremo de la señal', () => {
    const src = new Float32Array([1, 0.5, 0, -0.5, -1, 0]);
    const out = resampleLinear(src, 48000, 24000);
    expect(out[0]).toBeCloseTo(1, 5);
  });

  it('devuelve vacío para entrada vacía', () => {
    expect(resampleLinear(new Float32Array(0), 48000, 24000).length).toBe(0);
  });

  it('rechaza tasas no positivas', () => {
    expect(() => resampleLinear(new Float32Array([0]), 0, 24000)).toThrow();
    expect(() => resampleLinear(new Float32Array([0]), 24000, -1)).toThrow();
  });
});

describe('rms', () => {
  it('es 0 para silencio', () => {
    expect(rms(new Float32Array(100))).toBe(0);
  });

  it('es ~1 para señal constante de amplitud 1', () => {
    expect(rms(new Float32Array([1, 1, 1, 1]))).toBeCloseTo(1, 5);
  });

  it('es ~0.707 para una onda sinusoidal de amplitud 1', () => {
    const n = 24000;
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) s[i] = Math.sin((i / n) * 2 * Math.PI * 100);
    expect(rms(s)).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('es 0 para entrada vacía', () => {
    expect(rms(new Float32Array(0))).toBe(0);
  });
});

describe('pcm16ToBase64 / base64ToPcm16', () => {
  it('round-trip preserva los bytes', () => {
    const bytes = float32ToPcm16(new Float32Array([0, 0.5, -0.5, 1, -1]));
    const b64 = pcm16ToBase64(bytes);
    expect(typeof b64).toBe('string');
    const back = base64ToPcm16(b64);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it('codifica bytes conocidos en base64 estándar', () => {
    // [0,1,2,3,4] → "AAECAwQ=".
    expect(pcm16ToBase64(new Uint8Array([0, 1, 2, 3, 4]))).toBe('AAECAwQ=');
    expect(Array.from(base64ToPcm16('AAECAwQ='))).toEqual([0, 1, 2, 3, 4]);
  });

  it('round-trip de cadena vacía', () => {
    expect(pcm16ToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToPcm16('').length).toBe(0);
  });
});

describe('chunkBytes / concatChunks', () => {
  it('chunkBytes parte en trozos del tamaño dado', () => {
    const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7]);
    const chunks = chunkBytes(buf, 3);
    expect(chunks.map((c) => Array.from(c))).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
  });

  it('chunkBytes con buffer vacío devuelve []', () => {
    expect(chunkBytes(new Uint8Array(0), 4)).toEqual([]);
  });

  it('chunkBytes rechaza tamaños no positivos', () => {
    expect(() => chunkBytes(new Uint8Array([1]), 0)).toThrow();
  });

  it('concatChunks une preservando el orden', () => {
    const out = concatChunks([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });

  it('concatChunks de lista vacía devuelve vacío', () => {
    expect(concatChunks([]).length).toBe(0);
  });

  it('chunkBytes → concatChunks es identidad', () => {
    const buf = new Uint8Array([10, 20, 30, 40, 50]);
    expect(Array.from(concatChunks(chunkBytes(buf, 2)))).toEqual(Array.from(buf));
  });
});
