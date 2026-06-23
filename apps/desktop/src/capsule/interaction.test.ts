import { describe, it, expect } from 'vitest';
import { nextCapture } from './interaction';

describe('nextCapture — push-to-talk', () => {
  it('press inicia la captura y pasa a listening', () => {
    expect(nextCapture('push-to-talk', false, 'press')).toEqual({
      capturing: true,
      state: 'listening',
    });
  });

  it('release mientras captura termina y pasa a thinking', () => {
    expect(nextCapture('push-to-talk', true, 'release')).toEqual({
      capturing: false,
      state: 'thinking',
    });
  });

  it('release sin captura activa no cambia nada (idle)', () => {
    expect(nextCapture('push-to-talk', false, 'release')).toEqual({
      capturing: false,
      state: 'idle',
    });
  });

  it('cancel cancela la captura y vuelve a idle', () => {
    expect(nextCapture('push-to-talk', true, 'cancel')).toEqual({
      capturing: false,
      state: 'idle',
    });
  });
});

describe('nextCapture — toggle', () => {
  it('press sin captura activa empieza a capturar (listening)', () => {
    expect(nextCapture('toggle', false, 'press')).toEqual({
      capturing: true,
      state: 'listening',
    });
  });

  it('press capturando alterna a fin de captura (thinking)', () => {
    expect(nextCapture('toggle', true, 'press')).toEqual({
      capturing: false,
      state: 'thinking',
    });
  });

  it('release no altera el estado del toggle si está capturando', () => {
    expect(nextCapture('toggle', true, 'release')).toEqual({
      capturing: true,
      state: 'listening',
    });
  });

  it('release con captura inactiva mantiene idle', () => {
    expect(nextCapture('toggle', false, 'release')).toEqual({
      capturing: false,
      state: 'idle',
    });
  });

  it('cancel siempre vuelve a idle', () => {
    expect(nextCapture('toggle', true, 'cancel')).toEqual({
      capturing: false,
      state: 'idle',
    });
  });
});
