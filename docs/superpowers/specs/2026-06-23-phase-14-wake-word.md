# murmur — Spec: Fase 14 (Wake word)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** F1 (config), F3 (activación por hotkey), F4 (audio), F9 (orchestrator/activación)

---

## 1. Resumen

Permitir activar murmur diciendo una **palabra de activación** ("hey murmur") además del hotkey. Como
un detector acústico real requiere un modelo/binario nativo (out of pipeline), se construye:
**(a)** una interfaz `WakeWordDetector` + mock en TS, **(b)** la lógica nativa **testeable** en Rust
(ring buffer de frames, energía, normalización de la frase, gate por umbral con score pluggable; el
modelo acústico real es un stub documentado), **(c)** el toggle en config, y **(d)** el cableado a la
activación de la app (junto al hotkey). Tests sin hardware: `cargo test` para Rust, mocks en TS.

## 2. Decisiones confirmadas

| Tema | Decisión |
| ---- | -------- |
| Config | `MurmurConfig.wakeWord`: `{ enabled: boolean (default false); phrase: string (default 'hey murmur'); sensitivity: number 0..1 (default 0.5) }`. Normalizada en `ConfigStore`; `config set-wakeword <campo> <valor>`; mostrada en `config`/`status`. |
| Interfaz TS | `WakeWordDetector { start(onDetected: () => void): Promise<void>; stop(): Promise<void>; readonly enabled: boolean }`. `createMockWakeWordDetector()` expone `triggerDetection()` para tests. `createNullWakeWordDetector()` (no-op cuando está deshabilitado). |
| Native (Rust) | Módulo `wakeword` en `packages/native`: `RingBuffer` de muestras, `frame_energy`, `normalize_phrase` (minúsculas/trim/colapso de espacios), `WakeWordGate { sensitivity }` que dispara cuando un `score` (inyectado/placeholder) supera el umbral con suficiente energía. `cargo test` cubre ring buffer, energía, normalización y la lógica del gate. El modelo acústico real (openWakeWord/porcupine) es un stub documentado, fuera del pipeline. |
| Activación | La app trata wake word y hotkey como **fuentes de activación** equivalentes: ambas disparan `startCapture`. El detector se inyecta en `useMurmur`; si `config.wakeWord.enabled`, se arranca; `onDetected` → captura. |
| Privacidad | El wake word implica escucha continua local; se documenta que el audio se procesa **localmente** hasta la detección (coherente con F12); nada se envía al modelo hasta activarse. |

## 3. Entregables

- `@murmur/cli`: `wakeWord` en `MurmurConfig`/`ConfigStore` + `config set-wakeword` + display (+ tests).
- `@murmur/core`: `src/wake-word.ts` (`WakeWordDetector`, `createMockWakeWordDetector`, `createNullWakeWordDetector`), export (+ tests).
- `packages/native`: `src/wakeword.rs` (+ `mod`) con la lógica testeable y `cargo test`.
- `apps/desktop`: `useMurmur` acepta un `wakeWord` detector inyectable; si está habilitado, lo arranca y `onDetected` dispara la captura (+ test con mock).

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde.
2. `cd packages/native && cargo test` en verde, con tests nuevos de `wakeword` (ring buffer, energía, normalización, gate por umbral/sensibilidad).
3. `createMockWakeWordDetector`: `start(onDetected)` + `triggerDetection()` llama a `onDetected`; `stop` lo desactiva. `createNullWakeWordDetector` no hace nada.
4. `ConfigStore`: `wakeWord` con defaults; `config set-wakeword enabled true` (y phrase/sensitivity) persiste y valida; `config` lo muestra.
5. App (RTL/renderHook): con `wakeWord.enabled` y detector mock inyectado, `triggerDetection()` dispara la captura (estado `listening`); deshabilitado → no arranca.
6. TS strict sin `any` injustificado; ESLint y Prettier limpios. Tests previos verdes.

## 5. Fuera de alcance

Empaquetar el modelo/binario de wake word real (F16/usuario), entrenamiento de frases personalizadas,
detección on-device de alta precisión (se deja el gate + el enchufe del score). El cableado nativo
audio→detector real no se ejecuta en el pipeline.
