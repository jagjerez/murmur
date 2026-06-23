/**
 * Providers de audio reales sobre **Web Audio** en el webview de Tauri
 * (`getUserMedia` + `AudioContext`). Es el camino primario del MVP: cross-
 * platform y de baja latencia, sin dependencias de sistema.
 *
 * Decisión de arquitectura: cpal/nativo NO se usa en esta fase para no
 * arriesgar el `cargo test` por dependencias de sistema (ALSA/CoreAudio).
 * Queda como vía futura detrás de las MISMAS interfaces
 * (`VoiceInputProvider`/`VoiceOutputProvider`/`AudioDeviceManager`), de modo
 * que sustituir Web Audio por cpal no toca al resto de la app.
 *
 * Todas las APIs Web están guardadas/mockeables: si `navigator.mediaDevices`
 * o `AudioContext` no existen (p. ej. build SSR o entorno sin permisos),
 * los métodos degradan a `[]` o lanzan `AudioError` en vez de romper.
 *
 * Permisos de micrófono (Tauri): el webview usa `getUserMedia`, que el SO
 * controla. En macOS hace falta `NSMicrophoneUsageDescription` en el bundle;
 * en Linux/Windows lo gestiona el motor del webview. El CSP de `tauri.conf.json`
 * ya permite `connect-src https: wss:` (para OpenAI Realtime en F5). La
 * configuración nativa del bundle se aborda en F16 (packaging); aquí solo se
 * implementa y testea la capa JS (la build nativa queda fuera del pipeline).
 */
import {
  PCM_SAMPLE_RATE,
  createPushPullStream,
  float32ToPcm16,
  pcm16ToFloat32,
  resampleLinear,
  type AudioDevice,
  type AudioDeviceManager,
  type AudioStream,
  type VoiceInputProvider,
  type VoiceOutputProvider,
} from '@murmur/audio';
import { AudioError } from '@murmur/shared';

/** Tamaño del bloque del `ScriptProcessor` (potencia de 2). */
const PROCESSOR_BUFFER_SIZE = 4096;

function getAudioContextCtor(): typeof AudioContext | undefined {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  // Safari heredado expone webkitAudioContext.
  const w = globalThis as { webkitAudioContext?: typeof AudioContext };
  return w.webkitAudioContext;
}

/** Enumeración de dispositivos de audio vía `navigator.mediaDevices`. */
export class WebAudioDeviceManager implements AudioDeviceManager {
  async list(): Promise<AudioDevice[]> {
    const media = globalThis.navigator?.mediaDevices;
    if (!media || typeof media.enumerateDevices !== 'function') return [];
    const devices = await media.enumerateDevices();
    const out: AudioDevice[] = [];
    for (const d of devices) {
      if (d.kind === 'audioinput') {
        out.push({ id: d.deviceId, label: d.label || 'Entrada de audio', kind: 'input' });
      } else if (d.kind === 'audiooutput') {
        out.push({ id: d.deviceId, label: d.label || 'Salida de audio', kind: 'output' });
      }
    }
    return out;
  }
}

/**
 * Captura de micrófono → PCM16 mono 24 kHz. En cada bloque del procesador,
 * convierte Float32→PCM16 y reescala de la tasa del contexto a 24 kHz, y
 * empuja al `createPushPullStream` que el consumidor itera.
 */
export class WebVoiceInputProvider implements VoiceInputProvider {
  readonly id = 'web-input';

  async start(deviceId?: string): Promise<AudioStream> {
    const media = globalThis.navigator?.mediaDevices;
    if (!media || typeof media.getUserMedia !== 'function') {
      throw new AudioError('getUserMedia no está disponible en este entorno');
    }
    const AudioCtx = getAudioContextCtor();
    if (!AudioCtx) {
      throw new AudioError('AudioContext no está disponible en este entorno');
    }

    let mediaStream: MediaStream;
    try {
      mediaStream = await media.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
    } catch (err) {
      throw new AudioError('No se pudo acceder al micrófono', { cause: err as Error });
    }

    const context = new AudioCtx();
    const source = context.createMediaStreamSource(mediaStream);
    const processor = context.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
    const stream = createPushPullStream();
    const inRate = context.sampleRate || PCM_SAMPLE_RATE;

    processor.onaudioprocess = (event: AudioProcessingEvent): void => {
      const input = event.inputBuffer.getChannelData(0);
      // Copia: el buffer del evento se reutiliza tras el callback.
      const samples = Float32Array.from(input);
      const resampled = resampleLinear(samples, inRate, PCM_SAMPLE_RATE);
      stream.push(float32ToPcm16(resampled));
    };

    source.connect(processor);
    processor.connect(context.destination);

    let stopped = false;
    const originalStop = stream.stop.bind(stream);
    stream.stop = async (): Promise<void> => {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
        source.disconnect();
      } catch {
        // El grafo puede estar ya desconectado; ignorar.
      }
      for (const track of mediaStream.getTracks()) track.stop();
      if (context.state !== 'closed') await context.close();
      await originalStop();
    };

    return stream;
  }
}

/**
 * Reproduce chunks PCM16 24 kHz encolando `AudioBufferSourceNode` en tiempos
 * contiguos para que suenen sin huecos.
 */
export class WebVoiceOutputProvider implements VoiceOutputProvider {
  readonly id = 'web-output';
  private context: AudioContext | null = null;
  private playhead = 0;

  private ensureContext(): AudioContext {
    if (this.context && this.context.state !== 'closed') return this.context;
    const AudioCtx = getAudioContextCtor();
    if (!AudioCtx) {
      throw new AudioError('AudioContext no está disponible en este entorno');
    }
    this.context = new AudioCtx();
    this.playhead = this.context.currentTime;
    return this.context;
  }

  async play(chunks: AsyncIterable<Uint8Array>): Promise<void> {
    const context = this.ensureContext();
    for await (const chunk of chunks) {
      const samples = pcm16ToFloat32(chunk);
      if (samples.length === 0) continue;
      const buffer = context.createBuffer(1, samples.length, PCM_SAMPLE_RATE);
      buffer.getChannelData(0).set(samples);
      const node = context.createBufferSource();
      node.buffer = buffer;
      node.connect(context.destination);
      const startAt = Math.max(this.playhead, context.currentTime);
      node.start(startAt);
      this.playhead = startAt + buffer.length / PCM_SAMPLE_RATE;
    }
  }

  async stop(): Promise<void> {
    const context = this.context;
    this.context = null;
    this.playhead = 0;
    if (context && context.state !== 'closed') await context.close();
  }
}
