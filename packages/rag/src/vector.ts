// Utilidades de vector puras: similitud coseno y serialización Float32 ↔ bytes.
// Sin estado ni I/O. La serialización es little-endian para guardar/leer BLOBs en SQLite.

/** Vector denso de embedding. */
export type Vector = readonly number[] | Float32Array;

/**
 * Similitud coseno entre dos vectores de la misma longitud:
 *   cos(a, b) = (a · b) / (‖a‖ · ‖b‖)
 *
 * Idénticos → 1, ortogonales → 0, opuestos → −1. Invariante a la escala.
 * Si algún vector es cero (norma 0) devuelve 0 en lugar de `NaN`.
 *
 * @throws Error si las longitudes difieren.
 */
export function cosineSimilarity(a: Vector, b: Vector): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: longitudes distintas (${a.length} vs ${b.length}); deben coincidir.`,
    );
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Serializa un vector a bytes Float32 little-endian. El `Uint8Array` resultante
 * tiene `byteLength === length * 4` y es apto para guardar como BLOB.
 */
export function float32ToBytes(vector: Vector): Uint8Array {
  const f32 = vector instanceof Float32Array ? vector : Float32Array.from(vector);
  const bytes = new Uint8Array(f32.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f32.length; i++) {
    view.setFloat32(i * 4, f32[i] as number, /* littleEndian */ true);
  }
  return bytes;
}

/**
 * Deserializa bytes Float32 little-endian a `Float32Array`. Copia los datos para
 * no depender del `byteOffset`/alineación del `Uint8Array` de entrada (los BLOBs de
 * SQLite pueden venir como vistas con offset no nulo).
 *
 * @throws Error si la longitud en bytes no es múltiplo de 4.
 */
export function bytesToFloat32(bytes: Uint8Array): Float32Array {
  if (bytes.byteLength % 4 !== 0) {
    throw new Error(`bytesToFloat32: longitud en bytes (${bytes.byteLength}) no es múltiplo de 4.`);
  }
  const count = bytes.byteLength / 4;
  const out = new Float32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    out[i] = view.getFloat32(i * 4, /* littleEndian */ true);
  }
  return out;
}
