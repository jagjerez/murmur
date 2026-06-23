/**
 * Redacta datos sensibles de un texto sustituyéndolos por marcadores estables.
 *
 * Reemplaza, en este orden:
 * - emails (`ana@example.com`) → `[email]`
 * - claves tipo OpenAI (`sk-…`) → `[clave]`
 * - secuencias largas de dígitos (tarjetas/teléfonos, ≥ 7 dígitos) → `[número]`
 *
 * El resto del texto queda intacto. La función es **pura** (no muta la entrada ni
 * usa estado externo) y **determinista**. Es **idempotente** para los marcadores que
 * produce: ninguno (`[email]`, `[clave]`, `[número]`) vuelve a coincidir con los
 * patrones, así que aplicarla de nuevo no cambia el resultado.
 */
export function redactSensitive(text: string): string {
  // El orden importa: los emails contienen secuencias que podrían parecer otras
  // cosas, así que se redactan primero; las claves antes que los números porque
  // un `sk-` puede contener dígitos.
  return text
    .replace(EMAIL, '[email]')
    .replace(API_KEY, '[clave]')
    .replace(LONG_DIGITS, '[número]');
}

/** Email simple pero suficiente: `local@dominio.tld`. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Clave estilo OpenAI: `sk-` seguido de ≥ 10 caracteres de clave (letras/dígitos/_/-). */
const API_KEY = /\bsk-[A-Za-z0-9_-]{10,}\b/g;

/** Secuencia de ≥ 7 dígitos seguidos (tarjetas, teléfonos, PIN largos). */
const LONG_DIGITS = /\b\d{7,}\b/g;
