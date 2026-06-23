# murmur — Brief de diseño del MVP

> Fecha: 2026-06-23 · Producto: murmur · Dirección: cápsula cálida · Tema: system-aware

## 1. Objetivo del MVP

Que el usuario pulse un atajo, hable y reciba respuesta por voz con baja latencia, viendo en
todo momento el estado del asistente. Cubre Fases 0–6 (fundamentos → realtime → persistencia
local). La memoria semántica (RAG) es post-MVP.

## 2. No-objetivos (MVP)

- Wake word (fases avanzadas).
- RAG / memoria de largo plazo (Fase 7+).
- Acciones del sistema / plugins (Fase 15).
- Multi-idioma de UI (más allá de español/inglés base).

## 3. Personalidad

Íntima, humana, cálida, cercana. Discreta hasta que se la llama. La onda de audio es la
protagonista; el texto, secundario.

## 4. Superficies a diseñar

1. **Cápsula flotante** — componente principal. 5 estados (`idle`, `listening`, `thinking`,
   `speaking`, `error`), dark+light, anclable (esquina / abajo-centro), arrastrable. Modos
   **push-to-talk** y **toggle**.
2. **Onboarding mínimo** — primer arranque: API key de OpenAI (se guarda en `~/.murmur/`,
   nunca en repo), permiso de micrófono, elección de hotkey.
3. **Ajustes** — micrófono, voz/modelo, hotkey, tema, estado de conexión.
4. **Errores / vacíos** — sin API key, sin micrófono, sin red, permiso denegado.

## 5. Flujos

- **Activar → hablar → responder:** hotkey → `listening` → `thinking` → `speaking` → `idle`.
- **Push-to-talk vs toggle:** mantener pulsado (PTT) o pulsar para alternar.
- **Interrupción:** el usuario puede cortar la respuesta hablando o con el hotkey.

## 6. Principios de experiencia

- Invisible hasta que se la llama.
- Feedback de estado inmediato (objetivo < 100 ms desde la pulsación).
- Respuesta por voz breve.
- Cero fricción.
- Accesibilidad: foco visible, contraste AA, navegación por teclado, `aria-label` con el
  estado.

## 7. Especificaciones visuales

Referencia: `@murmur/design-system`.

- Acento terracota `#E0916B`. Estados: idle `#9A9088`, listening `#E0916B`, thinking
  `#B79BE8`, speaking `#E6B450`, error `#D8584E`.
- Tipografía: Inter/SF (UI), JetBrains Mono (transcripción/CLI).
- Cápsula: `radius.full`, superficie glass (`--mur-glass`), sombra `--mur-shadow-glass`,
  `backdrop-filter: blur(12px)`.
- Motion por estado: `listening` respira, `thinking` pulsa, `speaking` ecualiza, `error`
  shake. Duración base 200 ms, easing `standard`.

## 8. Criterios de aceptación del diseño

- Los 5 estados son distinguibles a simple vista en dark y light.
- La cápsula no obstruye el trabajo (tamaño pequeño, arrastrable, always-on-top opcional).
- Onboarding completable sin documentación.
- Todos los estados de error tienen mensaje claro y acción de recuperación.
- Contraste AA en texto e indicadores.
