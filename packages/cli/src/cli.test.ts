import { describe, it, expect } from 'vitest';
import { run, VERSION } from './cli';

describe('cli run', () => {
  it('devuelve la versión con --version', () => {
    expect(run(['--version'])).toBe(VERSION);
  });

  it('muestra la ayuda por defecto', () => {
    expect(run([])).toContain('murmur');
    expect(run([])).toContain('Comandos');
  });

  it('avisa ante un comando desconocido', () => {
    expect(run(['frobnicate'])).toContain('desconocido');
  });
});
