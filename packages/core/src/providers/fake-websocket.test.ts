import { describe, it, expect, vi } from 'vitest';
import { createFakeWebSocket } from './fake-websocket';

describe('createFakeWebSocket', () => {
  it('captura la url y los subprotocolos del constructor', () => {
    const ws = createFakeWebSocket('wss://example.test/socket', ['a', 'b']);
    expect(ws.url).toBe('wss://example.test/socket');
    expect(ws.protocols).toEqual(['a', 'b']);
  });

  it('acumula los datos enviados en sent[]', () => {
    const ws = createFakeWebSocket('wss://example.test');
    ws.send('hola');
    ws.send('mundo');
    expect(ws.sent).toEqual(['hola', 'mundo']);
  });

  it('simulateOpen dispara los listeners de open y on*', () => {
    const ws = createFakeWebSocket('wss://example.test');
    const viaListener = vi.fn();
    const viaProp = vi.fn();
    ws.addEventListener('open', viaListener);
    ws.onopen = viaProp;
    ws.simulateOpen();
    expect(viaListener).toHaveBeenCalledTimes(1);
    expect(viaProp).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(1);
  });

  it('emitServerEvent dispara message con JSON.stringify del objeto', () => {
    const ws = createFakeWebSocket('wss://example.test');
    const received: unknown[] = [];
    ws.addEventListener('message', (ev) => {
      received.push((ev as { data: string }).data);
    });
    ws.emitServerEvent({ type: 'demo', value: 42 });
    expect(received).toEqual([JSON.stringify({ type: 'demo', value: 42 })]);
  });

  it('close marca cerrado y dispara close (idempotente)', () => {
    const ws = createFakeWebSocket('wss://example.test');
    const onClose = vi.fn();
    ws.addEventListener('close', onClose);
    ws.simulateOpen();
    ws.close();
    ws.close();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(3);
  });

  it('simulateError dispara los listeners de error', () => {
    const ws = createFakeWebSocket('wss://example.test');
    const onError = vi.fn();
    ws.addEventListener('error', onError);
    ws.simulateError();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('simulateClose dispara close sin enviar nada previo', () => {
    const ws = createFakeWebSocket('wss://example.test');
    const onClose = vi.fn();
    ws.onclose = onClose;
    ws.simulateClose();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(ws.readyState).toBe(3);
  });
});
