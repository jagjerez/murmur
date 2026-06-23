import { describe, it, expect } from 'vitest';
import { cosineSimilarity, float32ToBytes, bytesToFloat32 } from './vector';

describe('cosineSimilarity', () => {
  it('vectores idénticos → 1', () => {
    const a = [1, 2, 3];
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 6);
  });

  it('vectores ortogonales → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('vectores opuestos → −1', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1, 6);
  });

  it('es invariante a la escala (solo cuenta la dirección)', () => {
    expect(cosineSimilarity([1, 1], [3, 3])).toBeCloseTo(1, 6);
  });

  it('acepta Float32Array además de number[]', () => {
    const a = new Float32Array([0, 1, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 6);
  });

  it('longitudes distintas → lanza error', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });

  it('un vector cero → 0 (sin NaN)', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe('float32ToBytes / bytesToFloat32', () => {
  it('round-trip exacto preservando valores Float32', () => {
    const v = new Float32Array([1.5, -2.25, 0, 3.0, -0.5]);
    const bytes = float32ToBytes(v);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(v.length * 4);
    const back = bytesToFloat32(bytes);
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  it('acepta number[] y devuelve Float32Array equivalente', () => {
    const bytes = float32ToBytes([1, 2, 3]);
    const back = bytesToFloat32(bytes);
    expect(Array.from(back)).toEqual([1, 2, 3]);
  });

  it('serializa en little-endian', () => {
    const bytes = float32ToBytes([1]);
    // 1.0f en IEEE-754 LE = 00 00 80 3f
    expect(Array.from(bytes)).toEqual([0x00, 0x00, 0x80, 0x3f]);
  });

  it('round-trip correcto cuando el Uint8Array tiene byteOffset distinto de cero', () => {
    const v = new Float32Array([7.5, -1.25]);
    const bytes = float32ToBytes(v);
    // Simula un BLOB de SQLite incrustado en un buffer mayor con offset.
    const padded = new Uint8Array(bytes.byteLength + 8);
    padded.set(bytes, 8);
    const view = padded.subarray(8);
    const back = bytesToFloat32(view);
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  it('vector vacío round-trip a vacío', () => {
    const bytes = float32ToBytes([]);
    expect(bytes.byteLength).toBe(0);
    expect(Array.from(bytesToFloat32(bytes))).toEqual([]);
  });
});
