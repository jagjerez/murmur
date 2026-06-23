/**
 * Detección de wake word ("hey murmur") como **fuente de activación** equivalente al hotkey.
 *
 * La interfaz `WakeWordDetector` desacopla la app del detector concreto: en producción un
 * detector real escucha audio localmente y, al reconocer la frase, invoca `onDetected` (que la
 * app cablea a `startCapture`, igual que el hotkey). En tests/dev usamos:
 *
 *  - `createMockWakeWordDetector()`: expone `triggerDetection()` para simular una detección.
 *  - `createNullWakeWordDetector()`: no-op (cuando el wake word está deshabilitado).
 *
 * La lógica nativa testeable del pipeline (ring buffer, energía, gate por umbral) vive en Rust
 * (`packages/native/src/wakeword.rs`); el modelo acústico real va fuera del pipeline.
 *
 * Privacidad: el wake word implica escucha continua **local**; nada se envía a la nube hasta que
 * la frase se detecta y la captura arranca (coherente con los controles de privacidad de F12).
 */

/** Callback invocado cuando se detecta la frase de activación. */
export type WakeWordDetectedHandler = () => void;

/** Detector de wake word: arranca/para la escucha y dispara `onDetected` al reconocer la frase. */
export interface WakeWordDetector {
  /**
   * Arranca la escucha. `onDetected` se invoca en cada detección de la frase. Idempotente
   * en el sentido de que un `start` posterior reemplaza el handler anterior.
   */
  start(onDetected: WakeWordDetectedHandler): Promise<void>;
  /** Detiene la escucha. Tras `stop`, no se vuelve a invocar `onDetected`. */
  stop(): Promise<void>;
  /** `true` si el detector está escuchando actualmente. */
  readonly enabled: boolean;
}

/** Detector de wake word para tests: `triggerDetection()` simula una detección. */
export interface MockWakeWordDetector extends WakeWordDetector {
  /** Simula que el modelo reconoció la frase: invoca `onDetected` si está escuchando. */
  triggerDetection(): void;
}

/**
 * Crea un detector en memoria para tests/dev. No toca hardware ni audio: `start` registra el
 * handler y marca `enabled`; `triggerDetection()` lo invoca; `stop` lo desactiva y desengancha.
 */
export function createMockWakeWordDetector(): MockWakeWordDetector {
  let handler: WakeWordDetectedHandler | null = null;
  let enabled = false;

  return {
    get enabled(): boolean {
      return enabled;
    },
    start(onDetected: WakeWordDetectedHandler): Promise<void> {
      handler = onDetected;
      enabled = true;
      return Promise.resolve();
    },
    stop(): Promise<void> {
      handler = null;
      enabled = false;
      return Promise.resolve();
    },
    triggerDetection(): void {
      if (enabled && handler !== null) {
        handler();
      }
    },
  };
}

/**
 * Detector no-op para cuando el wake word está deshabilitado. Permite inyectar siempre un
 * detector en `useMurmur` sin ramas condicionales: nunca escucha ni dispara.
 */
export function createNullWakeWordDetector(): WakeWordDetector {
  return {
    enabled: false,
    start(): Promise<void> {
      return Promise.resolve();
    },
    stop(): Promise<void> {
      return Promise.resolve();
    },
  };
}
