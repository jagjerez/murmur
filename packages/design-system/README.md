# @murmur/design-system

Tokens de diseño de murmur (cápsula cálida, system-aware). Fuente de verdad de color,
tipografía, espaciado, motion y del mapeo de estados del asistente.

## Uso

```ts
import { tokens, stateVisuals } from '@murmur/design-system';
import '@murmur/design-system/tokens.css'; // variables --mur-*
```

- `tokens` — objeto tipado (`color`, `font`, `space`, `radius`, `shadow`, `motion`).
- `stateVisuals[state]` — `{ color, animation, label }` para `idle | listening | thinking |
  speaking | error`.
- `tokens.css` — variables CSS `--mur-*`. Tema vía `data-theme="dark|light"` o
  `prefers-color-scheme`.

## Paleta

- Acento terracota: `#E0916B` (base).
- Estados: idle `#9A9088`, listening `#E0916B`, thinking `#B79BE8`, speaking `#E6B450`,
  error `#D8584E`.
- Tipografía: Inter/SF (UI) · JetBrains Mono (transcripción/CLI).
