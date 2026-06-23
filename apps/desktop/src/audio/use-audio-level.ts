import { useEffect, useState } from 'react';
import { pcm16ToFloat32, rms, type VoiceInputProvider } from '@murmur/audio';

/**
 * Calcula el nivel de audio (RMS 0..1) de un `VoiceInputProvider` mientras
 * `active`. Alimenta el `Waveform` de la cápsula con niveles reales.
 *
 * Cuando `active` pasa a `true`, arranca el input, lee chunks PCM16 y publica
 * el RMS de cada bloque; al desactivarse o desmontar, para el stream y vuelve
 * a 0. Es seguro sin input (queda en 0).
 */
export function useAudioLevel(input: VoiceInputProvider | undefined, active: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!input || !active) {
      setLevel(0);
      return;
    }

    let cancelled = false;
    let stream: { read(): AsyncIterable<Uint8Array>; stop(): Promise<void> } | null = null;

    void (async () => {
      try {
        const started = await input.start();
        if (cancelled) {
          void started.stop();
          return;
        }
        stream = started;
        for await (const chunk of started.read()) {
          if (cancelled) break;
          setLevel(Math.min(1, rms(pcm16ToFloat32(chunk))));
        }
        // Al terminar el stream NO reseteamos: el nivel refleja la última
        // medición mientras la captura siga activa. Solo el cleanup (desactivar
        // o desmontar) vuelve a 0.
      } catch {
        // Errores de captura (permiso, etc.) dejan el nivel en 0; la UI de
        // error se gestiona en otra capa (F11).
        if (!cancelled) setLevel(0);
      }
    })();

    return () => {
      cancelled = true;
      if (stream) void stream.stop();
      setLevel(0);
    };
  }, [input, active]);

  return level;
}
