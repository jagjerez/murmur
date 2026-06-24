import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup, waitFor } from '@testing-library/react';
import {
  createMockRealtimeProvider,
  createMemoryHotkeyManager,
  createMockWakeWordDetector,
} from '@murmur/core';
import { createMockVoiceInput, createMemoryVoiceOutput } from '@murmur/audio';
import { createMockConfigClient } from './config/config-client';
import { useMurmur, type MurmurDeps } from './use-murmur';

afterEach(cleanup);

function makeDeps(overrides: Partial<MurmurDeps> = {}): MurmurDeps {
  return {
    config: createMockConfigClient({ apiKey: 'sk-test-key-abcdef' }),
    realtime: createMockRealtimeProvider(),
    input: createMockVoiceInput([new Uint8Array([1, 2])]),
    output: createMemoryVoiceOutput(),
    hotkey: createMemoryHotkeyManager(),
    ...overrides,
  };
}

describe('useMurmur', () => {
  it('arranca en idle y desconectado', () => {
    const { result } = renderHook(() => useMurmur(makeDeps()));
    expect(result.current.capsuleState).toBe('idle');
    expect(result.current.connection).toBe('idle');
    expect(result.current.transcript).toEqual([]);
  });

  it('registra el hotkey de la config', async () => {
    const hotkey = createMemoryHotkeyManager();
    const config = createMockConfigClient({
      apiKey: 'sk-test-key-abcdef',
      hotkey: 'CommandOrControl+Shift+M',
    });
    renderHook(() => useMurmur(makeDeps({ hotkey, config })));
    await waitFor(() => expect(hotkey.registered()).toContain('CommandOrControl+Shift+M'));
  });

  it('al disparar el hotkey arranca la captura (estado listening)', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({
      apiKey: 'sk-test-key-abcdef',
      hotkey: 'CommandOrControl+Shift+Space',
    });
    const { result } = renderHook(() => useMurmur(makeDeps({ hotkey, realtime, config })));

    await waitFor(() => expect(hotkey.registered()).toContain('CommandOrControl+Shift+Space'));

    await act(async () => {
      hotkey.trigger('CommandOrControl+Shift+Space');
    });

    await waitFor(() => expect(result.current.capsuleState).toBe('listening'));
    await waitFor(() => expect(result.current.connection).toBe('connected'));
  });

  it('refleja los cambios de estado del orchestrator en capsuleState', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
    const { result } = renderHook(() => useMurmur(makeDeps({ hotkey, realtime, config })));

    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
    await act(async () => {
      hotkey.trigger(hotkey.registered()[0]!);
    });
    await waitFor(() => expect(result.current.connection).toBe('connected'));

    act(() => {
      realtime.emitState('thinking');
    });
    await waitFor(() => expect(result.current.capsuleState).toBe('thinking'));

    act(() => {
      realtime.emitState('speaking');
    });
    await waitFor(() => expect(result.current.capsuleState).toBe('speaking'));
  });

  it('acumula los transcripts emitidos por el orchestrator', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
    const { result } = renderHook(() => useMurmur(makeDeps({ hotkey, realtime, config })));

    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
    await act(async () => {
      hotkey.trigger(hotkey.registered()[0]!);
    });
    await waitFor(() => expect(result.current.connection).toBe('connected'));

    act(() => {
      realtime.emitUserTranscript('hola');
      realtime.emitAssistantTranscript('qué tal');
      realtime.emitResponseDone();
    });

    await waitFor(() =>
      expect(result.current.transcript).toEqual([
        { role: 'user', text: 'hola' },
        { role: 'assistant', text: 'qué tal' },
      ]),
    );
  });

  it('stopCapture detiene la captura (commit en la sesión)', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
    const { result } = renderHook(() => useMurmur(makeDeps({ hotkey, realtime, config })));

    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
    await act(async () => {
      hotkey.trigger(hotkey.registered()[0]!);
    });
    await waitFor(() => expect(realtime.lastSession).toBeDefined());

    await act(async () => {
      await result.current.stopCapture();
    });
    expect(realtime.lastSession?.commits).toBe(1);
  });

  it('expone el error de conexión por onError', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
    const { result } = renderHook(() => useMurmur(makeDeps({ hotkey, realtime, config })));

    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
    await act(async () => {
      hotkey.trigger(hotkey.registered()[0]!);
    });
    await waitFor(() => expect(realtime.lastOptions).toBeDefined());

    act(() => {
      realtime.emitError(new Error('caída de red'));
    });
    await waitFor(() => expect(result.current.capsuleState).toBe('error'));
  });

  it('sin API key no registra el hotkey ni arranca', async () => {
    const hotkey = createMemoryHotkeyManager();
    const config = createMockConfigClient(); // sin key
    renderHook(() => useMurmur(makeDeps({ hotkey, config })));
    // Damos margen al efecto async; no debe registrar nada.
    await new Promise((r) => setTimeout(r, 20));
    expect(hotkey.registered()).toHaveLength(0);
  });

  describe('wake word', () => {
    it('con wakeWord.enabled, una detección dispara la captura (estado listening)', async () => {
      const realtime = createMockRealtimeProvider();
      const wakeWord = createMockWakeWordDetector();
      const config = createMockConfigClient({
        apiKey: 'sk-test-key-abcdef',
        wakeWord: { enabled: true },
      });
      const { result } = renderHook(() => useMurmur(makeDeps({ realtime, wakeWord, config })));

      await waitFor(() => expect(wakeWord.enabled).toBe(true));

      await act(async () => {
        wakeWord.triggerDetection();
      });

      await waitFor(() => expect(result.current.capsuleState).toBe('listening'));
      await waitFor(() => expect(result.current.connection).toBe('connected'));
    });

    it('con wakeWord deshabilitado no arranca el detector', async () => {
      const wakeWord = createMockWakeWordDetector();
      const config = createMockConfigClient({
        apiKey: 'sk-test-key-abcdef',
        wakeWord: { enabled: false },
      });
      renderHook(() => useMurmur(makeDeps({ wakeWord, config })));
      await new Promise((r) => setTimeout(r, 20));
      expect(wakeWord.enabled).toBe(false);
    });

    it('sin API key no arranca el detector aunque esté habilitado', async () => {
      const wakeWord = createMockWakeWordDetector();
      const config = createMockConfigClient({ wakeWord: { enabled: true } }); // sin key
      renderHook(() => useMurmur(makeDeps({ wakeWord, config })));
      await new Promise((r) => setTimeout(r, 20));
      expect(wakeWord.enabled).toBe(false);
    });

    it('al desmontar detiene el detector', async () => {
      const wakeWord = createMockWakeWordDetector();
      const config = createMockConfigClient({
        apiKey: 'sk-test-key-abcdef',
        wakeWord: { enabled: true },
      });
      const { unmount } = renderHook(() => useMurmur(makeDeps({ wakeWord, config })));
      await waitFor(() => expect(wakeWord.enabled).toBe(true));
      unmount();
      await waitFor(() => expect(wakeWord.enabled).toBe(false));
    });
  });

  it('pasa las tools al realtime y despacha una tool-call del modelo', async () => {
    const hotkey = createMemoryHotkeyManager();
    const realtime = createMockRealtimeProvider();
    const config = createMockConfigClient({ apiKey: 'sk-test-key-abcdef' });
    const dispatchTool = vi.fn(async () => 'resultado-tool');
    const tools = [{ type: 'function' as const, name: 'demo', description: 'd', parameters: {} }];
    const { result } = renderHook(() =>
      useMurmur(makeDeps({ hotkey, realtime, config, tools, dispatchTool })),
    );

    await waitFor(() => expect(hotkey.registered().length).toBeGreaterThan(0));
    await act(async () => {
      hotkey.trigger(hotkey.registered()[0]!);
    });
    await waitFor(() => expect(result.current.connection).toBe('connected'));

    expect(realtime.lastSession?.tools?.map((t) => t.name)).toEqual(['demo']);

    await act(async () => {
      realtime.emitToolCall({ callId: 'c1', name: 'demo', arguments: { a: 1 } });
    });

    await waitFor(() => expect(dispatchTool).toHaveBeenCalledWith('demo', { a: 1 }));
    await waitFor(() =>
      expect(realtime.lastSession?.toolResults).toEqual([
        { callId: 'c1', output: 'resultado-tool' },
      ]),
    );
  });
});
