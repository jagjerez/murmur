import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioError } from '@murmur/shared';
import { WebAudioDeviceManager, WebVoiceInputProvider, WebVoiceOutputProvider } from './web-audio';

// --- Mocks de Web Audio ---------------------------------------------------

interface FakeProcessor {
  onaudioprocess:
    | ((e: { inputBuffer: { getChannelData(ch: number): Float32Array } }) => void)
    | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>;
}

class FakeAudioContext {
  sampleRate = 48000;
  state = 'running';
  close = vi.fn(async () => {
    this.state = 'closed';
  });
  resume = vi.fn(async () => {});
  destination = {};
  currentTime = 0;
  createMediaStreamSource = vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() }));
  lastProcessor: FakeProcessor | null = null;
  createScriptProcessor = vi.fn((): FakeProcessor => {
    const proc: FakeProcessor = {
      onaudioprocess: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    this.lastProcessor = proc;
    return proc;
  });
  createBuffer = vi.fn((channels: number, length: number, rate: number) => ({
    channels,
    length,
    rate,
    getChannelData: () => new Float32Array(length),
  }));
  createBufferSource = vi.fn(() => ({
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  }));
}

let lastContext: FakeAudioContext | null = null;
function installAudioContext(): void {
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => {
      lastContext = new FakeAudioContext();
      return lastContext;
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  lastContext = null;
});

// --- WebAudioDeviceManager ------------------------------------------------

describe('WebAudioDeviceManager', () => {
  it('mapea enumerateDevices a AudioDevice[] filtrando por kind', async () => {
    const enumerateDevices = vi.fn(async () => [
      { deviceId: 'in-1', kind: 'audioinput', label: 'Mic 1' },
      { deviceId: 'out-1', kind: 'audiooutput', label: 'Speaker 1' },
      { deviceId: 'cam-1', kind: 'videoinput', label: 'Cam 1' },
    ]);
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices } });

    const manager = new WebAudioDeviceManager();
    const devices = await manager.list();
    expect(devices).toEqual([
      { id: 'in-1', label: 'Mic 1', kind: 'input' },
      { id: 'out-1', label: 'Speaker 1', kind: 'output' },
    ]);
  });

  it('etiqueta vacía recibe un fallback legible', async () => {
    const enumerateDevices = vi.fn(async () => [
      { deviceId: 'in-1', kind: 'audioinput', label: '' },
    ]);
    vi.stubGlobal('navigator', { mediaDevices: { enumerateDevices } });
    const devices = await new WebAudioDeviceManager().list();
    expect(devices[0]!.label.length).toBeGreaterThan(0);
  });

  it('sin navigator.mediaDevices devuelve []', async () => {
    vi.stubGlobal('navigator', {});
    await expect(new WebAudioDeviceManager().list()).resolves.toEqual([]);
  });
});

// --- WebVoiceInputProvider ------------------------------------------------

describe('WebVoiceInputProvider', () => {
  let getUserMedia: ReturnType<typeof vi.fn>;
  let track: FakeTrack;

  beforeEach(() => {
    installAudioContext();
    track = { stop: vi.fn() };
    getUserMedia = vi.fn(async () => ({ getTracks: () => [track] }));
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  });

  it('start pide getUserMedia con constraints de audio mono y produce un AudioStream', async () => {
    const provider = new WebVoiceInputProvider();
    expect(provider.id).toBe('web-input');
    const stream = await provider.start();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const constraints = getUserMedia.mock.calls[0]![0] as { audio: Record<string, unknown> };
    expect(constraints.audio).toMatchObject({
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    });
    expect(typeof stream.read).toBe('function');
    expect(typeof stream.stop).toBe('function');
    await stream.stop();
  });

  it('pasa el deviceId en las constraints cuando se indica', async () => {
    const provider = new WebVoiceInputProvider();
    const stream = await provider.start('mic-7');
    const constraints = getUserMedia.mock.calls[0]![0] as { audio: { deviceId?: unknown } };
    expect(constraints.audio.deviceId).toEqual({ exact: 'mic-7' });
    await stream.stop();
  });

  it('un bloque de audio capturado se convierte a PCM16 24k y se entrega', async () => {
    const provider = new WebVoiceInputProvider();
    const stream = await provider.start();
    const ctx = lastContext!;
    // Simula un bloque: 4 muestras a 48k → 2 muestras a 24k → 4 bytes.
    const block = new Float32Array([0, 0.5, -0.5, 1]);
    const reader = stream.read()[Symbol.asyncIterator]();
    const pending = reader.next();
    ctx.lastProcessor!.onaudioprocess!({
      inputBuffer: { getChannelData: () => block },
    });
    const result = await pending;
    expect(result.done).toBe(false);
    expect(result.value.byteLength).toBe(4); // 2 muestras * 2 bytes
    await stream.stop();
  });

  it('stop libera tracks y cierra el contexto', async () => {
    const provider = new WebVoiceInputProvider();
    const stream = await provider.start();
    const ctx = lastContext!;
    await stream.stop();
    expect(track.stop).toHaveBeenCalledTimes(1);
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it('error de permiso (getUserMedia rechaza) → AudioError', async () => {
    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'));
    const provider = new WebVoiceInputProvider();
    await expect(provider.start()).rejects.toBeInstanceOf(AudioError);
  });

  it('sin getUserMedia disponible → AudioError', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} });
    const provider = new WebVoiceInputProvider();
    await expect(provider.start()).rejects.toBeInstanceOf(AudioError);
  });
});

// --- WebVoiceOutputProvider -----------------------------------------------

describe('WebVoiceOutputProvider', () => {
  beforeEach(() => {
    installAudioContext();
  });

  it('play decodifica PCM16 y agenda buffers en el contexto', async () => {
    const provider = new WebVoiceOutputProvider();
    expect(provider.id).toBe('web-output');
    async function* chunks(): AsyncIterable<Uint8Array> {
      // 2 muestras PCM16 = 4 bytes.
      yield new Uint8Array([0, 0, 0xff, 0x7f]);
    }
    await provider.play(chunks());
    const ctx = lastContext!;
    expect(ctx.createBuffer).toHaveBeenCalled();
    expect(ctx.createBufferSource).toHaveBeenCalled();
  });

  it('stop cierra el contexto si estaba abierto', async () => {
    const provider = new WebVoiceOutputProvider();
    async function* chunks(): AsyncIterable<Uint8Array> {
      yield new Uint8Array([0, 0]);
    }
    await provider.play(chunks());
    const ctx = lastContext!;
    await provider.stop();
    expect(ctx.close).toHaveBeenCalled();
  });

  it('stop sin reproducir nada no lanza', async () => {
    const provider = new WebVoiceOutputProvider();
    await expect(provider.stop()).resolves.toBeUndefined();
  });
});
