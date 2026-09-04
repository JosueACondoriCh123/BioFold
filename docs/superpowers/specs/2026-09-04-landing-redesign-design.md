# BioFold 3D — Rediseño de la landing page

Fecha: 2026-09-04
Estado: aprobado para planificación
Alcance: `/` (landing pública) y sus tests. Nada más.

## 1. Problema

La landing actual está bien construida (paleta coherente, responsive en cuatro
breakpoints, accesibilidad real, captura auténtica del laboratorio) pero no vende la tesis
del proyecto.

Fallos concretos, verificados contra `src/pages/LandingPage.tsx`:

1. WebMCP se menciona una sola vez, de pasada, en la sección 02. Es la tesis del proyecto.
2. El titular `Explore molecular structures. With clarity.` describe cualquier visor
   molecular. No comunica el modelo humano+agente en los primeros segundos.
3. Las ocho herramientas del command bus no aparecen en ninguna parte.
4. La arquitectura (command bus compartido, audit trail con `approvedByUser: true`, RLS,
   workers) es invisible, y es lo que evalúa un jurado técnico.
5. Features existentes sin anunciar: Vision Studio, proyectos persistentes, share links,
   time-travel, export de figuras y reportes.
6. Sin meta tags OG/Twitter: compartir el enlace en Discord o Devpost no genera preview.

## 2. Objetivo

Que un juez que hace scroll durante cuarenta segundos entienda tres cosas: qué es, por qué
WebMCP es esencial aquí y no decorativo, y que la implementación es real.

No objetivo: cambiar la paleta, tocar el laboratorio, el command bus, los adaptadores
WebMCP, la autenticación o Supabase.

## 3. Posicionamiento

Tesis del hero:

> Los agentes no necesitan ver tu pantalla. Necesitan manos.
> BioFold 3D expone ocho herramientas WebMCP tipadas sobre una escena molecular en vivo.
> El agente y tú ejecutáis los mismos comandos, sobre la misma escena, con el mismo
> registro de auditoría.

## 4. Estructura

| # | Sección | Rol |
|---|---|---|
| — | Hero | Tesis, panel animado de sesión, dos CTAs |
| 01 | Por qué WebMCP | El problema: los píxeles no miden ångströms |
| 02 | Lo que puedes ver | Capacidades visuales (evolución de la sección actual) |
| 03 | Un solo command bus | Diagrama SVG del modelo humano+agente |
| 04 | Las ocho herramientas | Referencia técnica como prueba de la sección 03 |
| 05 | Disciplina de evidencia | Observed / Calculated / Heuristic |
| 06 | Plataforma | RLS, auth PKCE, persistencia, share, Vision Studio |
| — | Cierre | CTA final, GitHub, demo |

Decisión de orden: las herramientas van después del diagrama, no antes. Así se leen como
evidencia de una afirmación ya establecida y no como una lista de features sueltas.

El hero queda con eyebrow, titular, un párrafo, dos CTAs y el panel. La tira
`ocho herramientas · un command bus · todo auditado` baja a la sección 01.

## 5. Hero animado

Animación DOM/SVG scriptada, no `<video>` ni `<canvas>`.

Reproduce una sesión real en bucle: llega una llamada `measure_distance` del agente,
atraviesa el command bus, aparece la medida en ångströms sobre la escena y se escribe la
línea correspondiente en el audit trail.

Restricciones que fuerzan esta decisión:

- `tests/e2e/design.spec.ts` exige `canvas` count 0 y cero peticiones a `3Dmol`,
  `geometry.worker` o `Laboratory-*` en `/`. Un visor real rompe el test y contradice el
  «zero WebGL overhead» de `SUBMISSION.md`.
- Un `.webm` de pantalla añade cerca de 1 MB y no explica el mecanismo: muestra el
  resultado, no el camino.
- DOM/SVG es nítido en el proyector del jurado a cualquier resolución.

Honestidad: usa nombres de herramienta reales derivados de `COMMAND_NAMES` y valores
reales de 4HHB (cuatro cadenas, 574 residuos, 4779 átomos) superpuestos sobre la captura
auténtica `/4hhb-preview.png`. El panel lleva una etiqueta visible que lo identifica como
recreación de la interfaz, no como la aplicación en vivo.

La animación respeta `prefers-reduced-motion`: con la preferencia activa se muestra el
estado final estático, sin ciclo.

Si más adelante se graba un `.webm` real del laboratorio, encaja en la sección 03 sin
rehacer el hero.

## 6. Dirección visual

Se mantiene la paleta verde-oscura existente. El dashboard, el laboratorio y las pantallas
de auth ya la usan; cambiarla solo en la landing rompería la coherencia del recorrido.

- Tipografía: `Inter` variable para texto e `IBM Plex Mono` para nombres de herramienta y
  valores científicos, con las pilas de sistema actuales como fallback. Hoy la landing
  depende de la fuente del sistema y se ve distinta en cada máquina.
- Profundidad: glow radial sutil en el hero, textura de rejilla al dos por ciento de
  opacidad, bordes con gradiente en las tarjetas de las secciones 03 y 04.
- Escala de espaciado unificada en custom properties. Hoy hay valores sueltos
  (80/72/56/48/44/36) repartidos por `platform.css`.
- Micro-animaciones de entrada con `IntersectionObserver`, escalonadas, desactivadas bajo
  `prefers-reduced-motion`.

## 7. Estructura de archivos

`src/pages/LandingPage.tsx` es hoy un archivo donde cada sección es una sola línea de JSX
de varios cientos de caracteres. Se reescribe dividido en componentes con una
responsabilidad cada uno:

```
src/features/landing/
  LandingHero.tsx          hero y panel animado
  SessionReplay.tsx        la animación scriptada, aislada y testeable
  WhyWebmcpSection.tsx     01
  CapabilitiesSection.tsx  02
  CommandBusSection.tsx    03, incluye el SVG inline
  ToolsSection.tsx         04
  EvidenceSection.tsx      05
  PlatformSection.tsx      06
  ClosingSection.tsx       cierre
  landingContent.ts        copy y datos de las ocho herramientas, tipados
  landing.css              estilos de landing
  index.ts
```

`src/pages/LandingPage.tsx` queda como composición de esas piezas.

Los estilos de landing salen de `src/platform.css`, que hoy mezcla en 318 líneas los
estilos de seis pantallas distintas. `platform.css` conserva header, footer, brand,
botones, campos de formulario y las pantallas de auth y dashboard.

`landingContent.ts` deriva los nombres de las ocho herramientas de `COMMAND_NAMES`
(`src/core/commandContracts.ts:120`) en vez de duplicarlos como literales, para que la
landing no pueda desincronizarse del contrato real.

## 8. index.html

- Meta OG: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`.
- Twitter card `summary_large_image`.
- `canonical`.
- JSON-LD `SoftwareApplication`.
- Imagen OG de 1200×630 generada a partir de la captura existente.

## 9. Tests

Assertions que cambian al cambiar el copy:

- `tests/platform/pages.test.tsx:40` — texto exacto del `h1`.
- `tests/platform/pages.test.tsx:42` — `document.title`.
- `tests/e2e/design.spec.ts:16` — texto exacto del `h1`.
- `tests/e2e/platform.spec.ts:55` — patrón del título.

Invariantes que deben seguir pasando sin modificarlas:

- `canvas` count 0 en `/`.
- Cero workers y cero peticiones a `3Dmol`, `geometry.worker` o `Laboratory-*` en `/`.
- `document.modelContext.registerTool` no se invoca en `/`.
- Sin overflow horizontal a 1440, 1000, 720 y 390 px.
- Cero errores de consola en las seis pantallas.
- El `h1` recibe foco al montar.
- Los CTA apuntan a `/signup`.

Tests nuevos:

- `SessionReplay` muestra el estado final y no arranca ciclo bajo `prefers-reduced-motion`.
- Los nombres de herramienta renderizados en la sección 04 coinciden con `COMMAND_NAMES`.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Las fuentes web añaden latencia al primer render | `preconnect`, `display=swap`, fallback a la pila de sistema actual |
| La animación distrae del contenido | Un solo ciclo visible, sin autoplay agresivo, estado estático bajo reduced-motion |
| El panel recreado se confunde con la app en vivo | Etiqueta explícita de recreación en el propio panel |
| Regresión de accesibilidad al reestructurar | Se conservan skip link, `aria-labelledby` por sección, foco en `h1` y focus rings |
