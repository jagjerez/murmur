# murmur — Spec: Fase 4 (Audio real)

- **Fecha:** 2026-06-23
- **Producto:** `murmur`
- **Estado:** Aprobado, pendiente de implementación
- **Depende de:** Fase 0 (interfaces de `@murmur/audio`), Fase 2 (cápsula/Waveform), Fase 3 (activación)

---

## 1. Resumen

Implementar la captura y reproducción de audio reales detrás de las interfaces de `@murmur/audio`.
El camino primario del MVP es **Web Audio en el webview de Tauri** (`getUserMedia` + `AudioContext`),
que es cross-platform y suficiente para baja latencia. Se añade el plumbing PCM necesario para
OpenAI Realtime (F5): PCM16 mono a 24 kHz. Todo lo determinista se testea (utilidades PCM, el
puente callback→`AsyncIterable`, providers mock); los providers Web se testean en jsdom con
`navigator.mediaDevices` y `AudioContext` mockeados. **No** se añade cpal nativo en esta fase para
no arriesgar el `cargo test` verde por dependencias de sistema (ALSA/CoreAudio); queda documentado
como vía futura detrás de las mismas interfaces.

## 2. Decisiones confirmadas

| Tema                 | Decisión                                                                                                                                                                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formato PCM canónico | Int16 little-endian, mono, **24000 Hz** (lo que espera OpenAI Realtime). Las utilidades convierten desde/hacia Float32 de Web Audio.                                                                                                                                                      |
| Utilidades PCM       | `@murmur/audio` `pcm.ts`: `float32ToPcm16`, `pcm16ToFloat32`, `resampleLinear(src, inRate, outRate)`, `concatChunks`, `chunkBytes`, `rms`, `pcm16ToBase64`/`base64ToPcm16`. Puras, sin dependencias.                                                                                      |
| Puente de stream     | `createPushPullStream()` → `AudioStream` con `push(chunk)`/`end()`/`fail(err)`; el consumidor itera `read()` (async iterable) con backpressure simple (cola). Conecta callbacks de audio con la interfaz `AudioStream`.                                                                   |
| Providers mock       | `createMockVoiceInput(chunks)` (emite chunks predefinidos), `createMemoryVoiceOutput()` (acumula lo reproducido), `createMockAudioDeviceManager(devices)`. Para tests y para el orchestrator (F9).                                                                                        |
| Providers Web        | `apps/desktop/src/audio/web-audio.ts`: `WebAudioDeviceManager` (`enumerateDevices`), `WebVoiceInputProvider` (`getUserMedia` + grafo de audio → PCM16 24k vía push-pull stream), `WebVoiceOutputProvider` (`AudioContext` reproduce chunks PCM16). Guardados para entornos sin Web Audio. |
| Nivel de audio       | Hook `useAudioLevel(input, active)` → número 0..1 (RMS) para alimentar el `Waveform` de la cápsula con niveles reales. Testeado con `createMockVoiceInput`.                                                                                                                               |
| Permisos Tauri       | Capacidad/permisos del webview para micrófono coherentes (documentar; la build nativa no se ejecuta).                                                                                                                                                                                     |
| Nativo               | cpal/native NO en esta fase; documentado como reemplazo futuro detrás de `VoiceInputProvider`/`VoiceOutputProvider`.                                                                                                                                                                      |

## 3. Entregables

- `packages/audio`: `pcm.ts`, `stream.ts` (push-pull), `mock.ts`, actualizar `providers.ts`/`index.ts`. Tests: `pcm.test.ts`, `stream.test.ts`, `mock.test.ts`.
- `apps/desktop`: `src/audio/web-audio.ts` (3 providers Web), `src/audio/use-audio-level.ts` (hook). Tests jsdom: `web-audio.test.ts`, `use-audio-level.test.ts`.
- Wiring ligero: el panel dev lista dispositivos de entrada (vía `WebAudioDeviceManager`, inyectable/mockeable) y, en captura, el `Waveform` puede reflejar el nivel real (inyectando un input). Sin romper los tests existentes.
- Documentación breve en el módulo de la decisión "Web Audio primario, cpal futuro".

## 4. Criterios de aceptación

1. `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde.
2. `cd packages/native && cargo test` verde (no se toca el crate).
3. Utilidades PCM testeadas: round-trip `float32 ↔ pcm16` (tolerancia), `resampleLinear` (longitud
   y extremos correctos), `rms` de señal conocida, base64 round-trip, `chunkBytes`/`concatChunks`.
4. `createPushPullStream`: `push` luego `read` entrega en orden; `end` termina la iteración; `fail`
   propaga error; `stop` corta. Sin fugas (la cola se vacía).
5. Providers mock funcionan (input emite chunks; output acumula; device manager devuelve la lista).
6. Providers Web (jsdom, mocks): `WebAudioDeviceManager.list()` mapea `enumerateDevices` a
   `AudioDevice[]`; `WebVoiceInputProvider.start()` pide `getUserMedia` con constraints de audio y
   produce un `AudioStream`; `stop()` libera tracks/contexto; `WebVoiceOutputProvider.play()`
   programa los buffers. Errores de permiso → `AudioError`.
7. `useAudioLevel` emite niveles 0..1 a partir de un input mock.
8. TS strict sin `any` injustificado; ESLint y Prettier limpios. Las APIs Web no rompen `vite build`
   ni los tests jsdom (uso guardado / mockeable).

## 5. Fuera de alcance

OpenAI Realtime (F5), pipeline completo (F9), cpal nativo, supresión de ruido/echo cancel avanzada
(más allá de las constraints estándar de `getUserMedia`), selección de dispositivo desde Ajustes
(F11).
