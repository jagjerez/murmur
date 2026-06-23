/**
 * Utilidades PCM puras (sin dependencias). Formato canónico de murmur:
 * Int16 little-endian, mono, 24000 Hz — lo que espera OpenAI Realtime (F5).
 *
 * Web Audio entrega Float32 en [-1, 1] a la tasa del `AudioContext`; estas
 * utilidades convierten a/desde el formato canónico y reescalan la tasa.
 */

/** Tasa de muestreo canónica (Hz). */
export const PCM_SAMPLE_RATE = 24000;

const INT16_MAX = 32767;
const INT16_MIN = -32768;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Convierte muestras Float32 [-1, 1] a bytes PCM16 little-endian (con clamp). */
export function float32ToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) {
    const clamped = clamp(samples[i]!, -1, 1);
    // Escala asimétrica estándar: positivos a 32767, negativos a -32768.
    const value = clamped < 0 ? clamped * -INT16_MIN : clamped * INT16_MAX;
    view.setInt16(i * 2, Math.round(clamp(value, INT16_MIN, INT16_MAX)), true);
  }
  return out;
}

/** Convierte bytes PCM16 little-endian a muestras Float32 [-1, 1]. */
export function pcm16ToFloat32(bytes: Uint8Array): Float32Array {
  const count = bytes.byteLength >> 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, count * 2);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const sample = view.getInt16(i * 2, true);
    out[i] = sample < 0 ? sample / -INT16_MIN : sample / INT16_MAX;
  }
  return out;
}

/**
 * Reescala una señal mono Float32 de `inRate` a `outRate` por interpolación
 * lineal. Conserva el primer extremo; la longitud es `round(n * out / in)`.
 */
export function resampleLinear(
  samples: Float32Array,
  inRate: number,
  outRate: number,
): Float32Array {
  if (inRate <= 0 || outRate <= 0) {
    throw new RangeError('resampleLinear: las tasas deben ser positivas');
  }
  if (samples.length === 0) return new Float32Array(0);
  if (inRate === outRate) return samples.slice();

  const ratio = inRate / outRate;
  const outLength = Math.round(samples.length / ratio);
  const out = new Float32Array(outLength);
  const lastIndex = samples.length - 1;
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const left = Math.floor(srcPos);
    const right = Math.min(left + 1, lastIndex);
    const frac = srcPos - left;
    out[i] = samples[left]! * (1 - frac) + samples[right]! * frac;
  }
  return out;
}

/** Raíz cuadrática media (0..1) de una señal Float32. 0 si está vacía. */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    sum += s * s;
  }
  return Math.sqrt(sum / samples.length);
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Codifica bytes a base64 estándar. Implementación manual para funcionar igual
 * en Node y en el navegador sin depender de `Buffer`/`btoa`.
 */
export function pcm16ToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out +=
      B64_ALPHABET[(n >> 18) & 63]! +
      B64_ALPHABET[(n >> 12) & 63]! +
      B64_ALPHABET[(n >> 6) & 63]! +
      B64_ALPHABET[n & 63]!;
  }
  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i]! << 16;
    out += B64_ALPHABET[(n >> 18) & 63]! + B64_ALPHABET[(n >> 12) & 63]! + '==';
  } else if (remaining === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out +=
      B64_ALPHABET[(n >> 18) & 63]! +
      B64_ALPHABET[(n >> 12) & 63]! +
      B64_ALPHABET[(n >> 6) & 63]! +
      '=';
  }
  return out;
}

const B64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    table[B64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/** Decodifica base64 estándar a bytes. Inversa de `pcm16ToBase64`. */
export function base64ToPcm16(b64: string): Uint8Array {
  let length = b64.length;
  while (length > 0 && b64[length - 1] === '=') length--;
  const byteLength = (length * 3) >> 2;
  const out = new Uint8Array(byteLength);
  let outPos = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < length; i++) {
    const value = B64_LOOKUP[b64.charCodeAt(i)]!;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outPos++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

/** Parte un buffer en trozos de hasta `size` bytes, preservando el orden. */
export function chunkBytes(buffer: Uint8Array, size: number): Uint8Array[] {
  if (size <= 0) throw new RangeError('chunkBytes: size debe ser positivo');
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < buffer.length; i += size) {
    chunks.push(buffer.subarray(i, Math.min(i + size, buffer.length)));
  }
  return chunks;
}

/** Une varios chunks en un único buffer contiguo, preservando el orden. */
export function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
