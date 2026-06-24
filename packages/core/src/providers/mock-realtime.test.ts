import { describe, it, expect, vi } from 'vitest';
import type { AssistantState } from '@murmur/shared';
import { createMockRealtimeProvider } from './mock-realtime';
import type { RealtimeConnectOptions, RealtimeTool } from './realtime-model-provider';

const BASE: RealtimeConnectOptions = { apiKey: 'k', model: 'm' };

describe('createMockRealtimeProvider', () => {
  it('connect captura las options y devuelve una sesión', async () => {
    const provider = createMockRealtimeProvider();
    expect(provider.id).toBe('mock-realtime');
    expect(provider.lastSession).toBeUndefined();

    const session = await provider.connect({ ...BASE, instructions: 'ctx' });

    expect(provider.lastOptions?.instructions).toBe('ctx');
    expect(provider.lastSession).toBe(session);
  });

  it('registra sendAudio/commit/interrupt/close en la sesión', async () => {
    const provider = createMockRealtimeProvider();
    const session = await provider.connect(BASE);

    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4]);
    session.sendAudio(a);
    session.sendAudio(b);
    session.commit();
    session.interrupt();
    await session.close();

    expect(provider.lastSession?.sentAudio).toEqual([a, b]);
    expect(provider.lastSession?.commits).toBe(1);
    expect(provider.lastSession?.interrupts).toBe(1);
    expect(provider.lastSession?.closes).toBe(1);
  });

  it('emitState invoca onState', async () => {
    const provider = createMockRealtimeProvider();
    const states: AssistantState[] = [];
    await provider.connect({ ...BASE, onState: (s) => states.push(s) });

    provider.emitState('listening');
    provider.emitState('thinking');

    expect(states).toEqual(['listening', 'thinking']);
  });

  it('emitAudio invoca onAudio con los bytes', async () => {
    const provider = createMockRealtimeProvider();
    const chunks: Uint8Array[] = [];
    await provider.connect({ ...BASE, onAudio: (c) => chunks.push(c) });

    const bytes = new Uint8Array([9, 9]);
    provider.emitAudio(bytes);

    expect(chunks).toEqual([bytes]);
  });

  it('emitUserTranscript / emitAssistantTranscript invocan sus callbacks', async () => {
    const provider = createMockRealtimeProvider();
    const user: string[] = [];
    const assistant: string[] = [];
    await provider.connect({
      ...BASE,
      onUserTranscript: (t) => user.push(t),
      onAssistantTranscript: (t) => assistant.push(t),
    });

    provider.emitUserTranscript('hola');
    provider.emitAssistantTranscript('mundo');

    expect(user).toEqual(['hola']);
    expect(assistant).toEqual(['mundo']);
  });

  it('emitResponseDone emite el estado idle', async () => {
    const provider = createMockRealtimeProvider();
    const states: AssistantState[] = [];
    await provider.connect({ ...BASE, onState: (s) => states.push(s) });

    provider.emitResponseDone();

    expect(states).toEqual(['idle']);
  });

  it('emitError invoca onError', async () => {
    const provider = createMockRealtimeProvider();
    const errors: Error[] = [];
    await provider.connect({ ...BASE, onError: (e) => errors.push(e) });

    const err = new Error('boom');
    provider.emitError(err);

    expect(errors).toEqual([err]);
  });

  it('emite antes de connect es no-op (no lanza)', () => {
    const provider = createMockRealtimeProvider();
    expect(() => provider.emitState('idle')).not.toThrow();
    expect(() => provider.emitAudio(new Uint8Array())).not.toThrow();
  });
});

const tool: RealtimeTool = { type: 'function', name: 'demo', description: 'd', parameters: {} };

describe('createMockRealtimeProvider — function-calling', () => {
  it('la sesión captura las tools pasadas en connect', async () => {
    const provider = createMockRealtimeProvider();
    await provider.connect({ apiKey: 'k', model: 'm', tools: [tool] });
    expect(provider.lastSession?.tools).toEqual([tool]);
  });

  it('emitToolCall invoca onToolCall con la llamada', async () => {
    const provider = createMockRealtimeProvider();
    const onToolCall = vi.fn();
    await provider.connect({ apiKey: 'k', model: 'm', onToolCall });
    provider.emitToolCall({ callId: 'c1', name: 'demo', arguments: { a: 1 } });
    expect(onToolCall).toHaveBeenCalledWith({ callId: 'c1', name: 'demo', arguments: { a: 1 } });
  });

  it('sendToolResult queda registrado en toolResults', async () => {
    const provider = createMockRealtimeProvider();
    const session = await provider.connect({ apiKey: 'k', model: 'm' });
    session.sendToolResult('c1', 'resultado');
    expect(provider.lastSession?.toolResults).toEqual([{ callId: 'c1', output: 'resultado' }]);
  });
});
