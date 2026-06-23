import { describe, it, expect } from 'vitest';
import { redactSensitive } from './redact';

describe('redactSensitive', () => {
  it('redacta direcciones de email', () => {
    expect(redactSensitive('escríbeme a ana.perez@example.com cuando puedas')).toBe(
      'escríbeme a [email] cuando puedas',
    );
  });

  it('redacta varios emails en el mismo texto', () => {
    expect(redactSensitive('uno@a.io y dos@b.org')).toBe('[email] y [email]');
  });

  it('redacta claves tipo sk-…', () => {
    expect(redactSensitive('mi clave es sk-ABCdef0123456789 vale')).toBe('mi clave es [clave] vale');
  });

  it('redacta secuencias largas de dígitos (tarjetas/teléfonos)', () => {
    expect(redactSensitive('la tarjeta es 4111111111111111 ok')).toBe('la tarjeta es [número] ok');
    expect(redactSensitive('llámame al 600123456')).toBe('llámame al [número]');
  });

  it('no toca números cortos', () => {
    expect(redactSensitive('tengo 3 gatos y 12 plantas')).toBe('tengo 3 gatos y 12 plantas');
  });

  it('deja intacto el texto normal sin datos sensibles', () => {
    const text = 'hola, ¿qué tal la mañana? hoy hace sol.';
    expect(redactSensitive(text)).toBe(text);
  });

  it('es idempotente: aplicarla dos veces da el mismo resultado', () => {
    const text = 'correo ana@x.io, clave sk-XYZ1234567 y número 5555666677778888';
    const once = redactSensitive(text);
    expect(redactSensitive(once)).toBe(once);
  });

  it('es pura: no muta su entrada y devuelve un nuevo string', () => {
    const text = 'ping foo@bar.com pong';
    const copy = `${text}`;
    redactSensitive(text);
    expect(text).toBe(copy);
  });

  it('redacta una mezcla de email, clave y número', () => {
    expect(redactSensitive('soy a@b.com, clave sk-abc123DEF456 y pin 9988776655')).toBe(
      'soy [email], clave [clave] y pin [número]',
    );
  });

  it('devuelve cadena vacía para cadena vacía', () => {
    expect(redactSensitive('')).toBe('');
  });
});
