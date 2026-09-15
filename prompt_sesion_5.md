# Sesión 5 — sin bloqueante crítico abierto: elegir entre A-* o H-*

> Escrito el 2026-09-14 al cerrar `prompt_sesion_4.md`. Base verificada: el
> ZIP `sesion4_notacredito.zip` entregado en ese chat, **aplicado y mergeado**
> sobre `main` en el commit que resulte del PR correspondiente. Gates en esa
> base antes de aplicar el ZIP: `tsc` exit 0 · **46 files / 711 tests** ·
> `next build` exit 0 `(8/8)`, 20 rutas, 4 estáticas · `npm audit` 0/0.
> **Confirmar el HEAD real y remedir el baseline al clonar** — no asumir que
> el merge llegó limpio sin haberlo visto.

## Sobre el nombre de este archivo

Igual que los anteriores: `prompt_sesion_5.md` es el quinto prompt de chat
generado, no una etiqueta de fase del proyecto. La referencia válida de
alcance es la columna `#` del backlog consolidado de `PROJECT_STATE.md` —
ver `### Nombres de sesión vs. alcance — leer antes de renumerar nada`.

**La sesión anterior (`prompt_sesion_4.md`, alcance "sesión 3" en el
backlog) cerró C-8, C-9 y C-10** — nota de crédito. Con eso **no queda
ningún bloqueante marcado como crítico** en el backlog. Esta sesión es la
primera desde el inicio del proyecto que empieza sin uno.

## Por qué esta sesión y no otra — es una elección real, no una consecuencia

A diferencia de las últimas tres sesiones, no hay un único candidato obvio.
Tres bloques igual de válidos, ninguno bloqueante:

| Bloque | Contenido | Por qué podría ir primero |
|---|---|---|
| `### Frontera de autorización — sesión 4` (`PROJECT_STATE.md`) | A-1, A-2, A-3, A-4, C-12 | A-1 es la misma clase de fallo que D0 (ya corregido) y sobrevivió al chat 6a — un `employee` puede tocar el tipo de comprobante DIAN por API. A-4 (`middleware.ts` → `proxy.ts`) fue diferido a propósito desde la sesión 1 |
| `### Higiene, desacople, CI — sesión 5` (`PROJECT_STATE.md`) | H-1 a H-14, **H-19 (nuevo)** | H-10 (CI en GitHub Actions) es, según el propio backlog, "el mayor retorno por esfuerzo". H-19 es el hallazgo de esta sesión: `invoice_claims.ts` no tiene test propio, ningún mutante en su guarda SQL muere hoy |
| `P-2` (`### Con credenciales de producción — sesión 6`) | Captura del 201 crudo de nota crédito | Solo aplica si para este chat ya hay credenciales de producción de Siigo — si no las hay, este bloque no es viable todavía |

**Este prompt no elige por Jean.** Si prefieres abrir cualquiera de los tres,
o redirigir a otra cosa completamente, dilo al empezar el chat — el
protocolo de abajo aplica igual sea cual sea el bloque.

## Releer antes de tocar código

- `.clinerules`, `01_PROJECT_REQUIREMENTS.md`, `2_AGENT_WORKFLOW_RULES.md`,
  `03_UI_UX_DESIGN_SPEC.md` — gobernanza, viven en el repo, no se duplican
  en el Project.
- Si el bloque elegido es **Frontera de autorización**: `middleware.ts`,
  `routeGuard.ts`, `routeAuthz.ts` y sus tests (29 tests ya cubren parte de
  A-4) antes de tocar nada — A-4 es una decisión de arquitectura (`proxy`
  no soporta runtime `edge`), no un `mv` de archivo.
- Si el bloque elegido es **Higiene**: para H-19 en particular, mirar cómo
  `invoiceClaims.ts` mockea `getPool` en los tests de las rutas que sí lo
  usan (`invoices/route.test.ts`, `credit-notes/route.test.ts`) antes de
  decidir el formato del test nuevo — capturar la query exacta (`sql`),
  no solo el resultado que el mock decide devolver.

## Protocolo (igual que las sesiones anteriores)

1. Clonar fresco. Confirmar HEAD y medir el baseline **antes de tocar nada**.
2. Si el hallazgo elegido toca un contrato externo (Siigo/Provet), releer la
   evidencia real antes de escribir una sola línea — no asumir que la
   descripción del backlog sigue vigente sin contrastarla contra el código
   actual (exactamente lo que pasó con la premisa de `credit-notes/route.ts`
   en `prompt_sesion_4.md`, que resultó ser parcialmente inexacta).
3. TDD cuando se arregla un bug: primero un test que reproduzca el problema,
   luego el fix.
4. Mutación manual después del fix (sin Stryker, no está configurado).
5. Los tres gates entre sub-paso y sub-paso: `npx tsc --noEmit`,
   `npx vitest run` completo, `env -u NODE_ENV npx next build`.
6. Entregable: **un solo ZIP** al cerrar el chat, con rutas completas,
   contenido completo de cada archivo, y SHA-256 de cada uno.
7. Al cerrar: actualizar `PROJECT_STATE.md` (backlog + sección `Resolved` +
   cadena `Last Update`/`Previous Update`) y escribir `prompt_sesion_6.md`
   para la siguiente.

**`npm run lint` es un alias de `tsc --noEmit`.** No hay ESLint. Correrlo como
tercer gate no comprueba nada nuevo.

## Leyes que ya costaron caro (siguen vigentes)

- **`sum_total` se lee literal, NUNCA se recalcula.**
- **No asumir el shape de una respuesta externa sin evidencia.**
- **Prefijo siempre en los identificadores:** `consulta #N`, `factura #N`,
  `NC #N`, `row #N`.
- **RLS no protege nada.** Las conexiones `pg` directas la saltan.
- **`stamp.send` siempre `true` en notas crédito** (Resolución DIAN 000042).
- **La respuesta de Siigo (factura o NC) nunca se lee en raíz** — `cufe`,
  `cude`, `status` van bajo `stamp`. Ambos schemas (`siigoInvoiceResponseSchema`,
  `siigoCreditNoteResponseSchema`) son deliberadamente `.nullish()` con
  default `cufe: ""` / `status: "Draft"` — nadie ha visto nunca un `stamp`
  real poblado, para ningún tipo de documento. No "arreglar" esto a
  fail-loud sin verificar un 201 real primero (ver P-1/P-2).

## Backlog abierto que NO se toca en cualquiera de estos tres bloques

`C-3` + `C-15` (UI, van juntos, necesitan preview y guion de verificación
manual — se suma la deuda de C-16 de la sesión 3). `C-17`
(`sum_total: .default(0)`). `H-18` (obsequios). El bloque completo de
`### Con credenciales de producción — sesión 6` si no hay credenciales
disponibles para este chat.

## Entorno

macOS, zsh. Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`. Los ZIP
se extraen solos en `~/Downloads`; se aplican con
`rsync -av --exclude '__MACOSX' ~/Downloads/<carpeta>/ .` desde la raíz, barra
final obligatoria. Merge por PR de GitHub con "Create a merge commit".

**Los dotfiles no van dentro del ZIP** — Archive Utility los descarta en la
raíz. Se entregan sueltos y renombrados, con instrucción de `cp`.
