# Sesión 7 — sin bloqueante crítico abierto: mismos candidatos menos H-10

> Escrito el 2026-09-15 al cerrar `prompt_sesion_6.md`. Base verificada: el
> ZIP `sesion6_higiene_h10.zip` + el archivo suelto
> `ci_workflow_sesion6.yml.txt` entregados en ese chat, **aplicados y
> mergeados** sobre `main` en el commit que resulte (Jean puede hacer commit
> directo o PR, a su criterio — esta vez no hubo rama).
> Gates en esa base antes de aplicar el ZIP: `tsc` exit 0 · **47 files / 733
> tests** · `next build` exit 0 `(8/8)`, 20 rutas, 4 estáticas · `npm audit`
> 0/0. **Confirmar el HEAD real y remedir el baseline al clonar** — no asumir
> que el merge llegó limpio sin haberlo visto. Confirmar también que
> `.github/workflows/ci.yml` quedó en su sitio (se entregó suelto y
> renombrado justamente porque `.github/` es un dotfolder de raíz que
> Archive Utility descarta del ZIP) y que el primer run de CI en GitHub
> Actions pasó en verde.

## Sobre el nombre de este archivo

Igual que los anteriores: `prompt_sesion_7.md` es el séptimo prompt de chat
generado, no una etiqueta de fase del proyecto. La referencia válida de
alcance es la columna `#` del backlog consolidado de `PROJECT_STATE.md` — ver
`### Nombres de sesión vs. alcance — leer antes de renumerar nada`.

**La sesión anterior (`prompt_sesion_6.md`, alcance "sesión 5" en el
backlog) cerró H-10** (CI en GitHub Actions, Node 24, `engines` en
`package.json`). Del bloque `### Higiene, desacople, CI — sesión 5` quedan
abiertos H-1 a H-9, H-11 a H-14 y H-19 — H-10 fue el único hallazgo tomado en
esa sesión, por decisión explícita de Jean al abrir el chat.

## Por qué esta sesión y no otra — sigue siendo una elección real

Los mismos bloques de `prompt_sesion_6.md`, sin H-10:

| Bloque | Contenido | Por qué podría ir primero |
|---|---|---|
| `### Higiene, desacople, CI — sesión 5` (`PROJECT_STATE.md`) | H-1 a H-9, H-11 a H-14, H-19 | H-19 (test dedicado de `invoice_claims.ts` contra SQL real, no solo contra un mock canned) es acotado y aislado, buen warm-up. H-8 (`apiClient.ts` centralizado para 12 `fetch` crudos) es el de mayor superficie del bloque |
| **A-4** (`middleware.ts` → `proxy.ts`) | Backlog: `### Frontera de autorización — sesión 4` | Diferido a propósito desde la sesión 1. **Es una decisión de arquitectura, no un `mv`**: `proxy` no soporta runtime `edge` y su runtime `nodejs` no es configurable, así que mueve TODA la frontera de autorización a Node. 29 tests ya cubren parte de esto (`middleware.test.ts`, `routeGuard.test.ts`, `routeAuthz.test.ts`) |
| **Diseño completo de A-3** | Epoch de sesión en `credentials_config`, `ALTER TABLE`, revocación real | Jean ya decidió reservar esto para su propia sesión con **Opus High** — requiere decidir si el middleware/proxy puede pagar una lectura a Postgres en cada request, y un cambio de modelo de datos que necesita el SQL exacto para que Jean lo corra a mano en Supabase |
| `P-2` (`### Con credenciales de producción — sesión 6` del backlog) | Captura del 201 crudo de nota crédito | Solo aplica si para este chat ya hay credenciales de producción de Siigo — si no las hay, este bloque no es viable todavía |

**Este prompt no elige por Jean.** Si prefieres abrir cualquiera de los
cuatro, o redirigir a otra cosa completamente, dilo al empezar el chat — el
protocolo de abajo aplica igual sea cual sea el bloque.

**Nota de modelo:** si el bloque elegido es el diseño completo de A-3,
usar **Opus 5 High** desde el arranque (ambigüedad real de arquitectura,
según `Model_Usage`). Para Higiene o A-4 (una vez decidida la arquitectura
de A-4), **Sonnet 5 Medium** por defecto, evaluando hallazgo por hallazgo.

## Releer antes de tocar código

- `.clinerules`, `01_PROJECT_REQUIREMENTS.md`, `2_AGENT_WORKFLOW_RULES.md`,
  `03_UI_UX_DESIGN_SPEC.md` — gobernanza, viven en el repo, no se duplican en
  el Project.
- Si el bloque elegido es **A-4**: `middleware.ts`, `routeGuard.ts`,
  `routeAuthz.ts` y sus tests (29 tests) antes de tocar nada. Confirmar contra
  la doc real de Next.js 16.3.4 si `proxy.ts` con runtime `nodejs` sigue
  siendo la única opción, o si algo cambió desde la migración de la sesión 1.
- Si el bloque elegido es **Higiene**: para H-19, mirar cómo
  `invoiceClaims.ts` mockea `getPool` en los tests de las rutas que sí lo usan
  (`invoices/route.test.ts`, `credit-notes/route.test.ts`) antes de decidir el
  formato del test nuevo — capturar la query exacta (`sql`), no solo el
  resultado que el mock decide devolver. Para H-8, inventariar los 12 `fetch`
  crudos en los 5 archivos antes de diseñar `apiClient.ts` — no asumir que
  todos comparten la misma forma de headers/timeout/retry.
- Si el bloque elegido es **diseño de A-3**: releer la nota de A-3 en
  `PROJECT_STATE.md` (sesión 4) y `sessionCookies.ts`/`jwt.ts` completos antes
  de proponer el esquema. No implementar el `ALTER TABLE` sin dárselo a Jean
  como SQL exacto para correr a mano en Supabase.

## Protocolo (igual que las sesiones anteriores)

1. Clonar fresco. Confirmar HEAD y medir el baseline **antes de tocar nada**.
2. Si el hallazgo elegido toca un contrato externo (Siigo/Provet) o de
   plataforma (Next.js/Vercel), releer la evidencia real antes de escribir una
   sola línea — no asumir que la descripción del backlog sigue vigente sin
   contrastarla contra el código y la doc actuales.
3. TDD cuando se arregla un bug: primero un test que reproduzca el problema,
   luego el fix. Para cambios de solo-configuración o solo-documentación (como
   H-10 en la sesión anterior), TDD no aplica — decirlo explícitamente en vez
   de fabricar un test decorativo.
4. Mutación manual después del fix (sin Stryker, no está configurado) —
   tampoco aplica a cambios de solo-configuración.
5. Los tres gates entre sub-paso y sub-paso: `npx tsc --noEmit`,
   `npx vitest run` completo, `env -u NODE_ENV npx next build`.
6. Entregable: **un solo ZIP** al cerrar el chat, con rutas completas,
   contenido completo de cada archivo, y SHA-256 de cada uno. **Si el
   entregable incluye dotfiles o dotfolders en la raíz** (`.clinerules`,
   `.gitignore`, `.env.example`, `.github/`), van **sueltos y renombrados**,
   fuera del ZIP — Archive Utility los descarta en la extracción.
7. Al cerrar: actualizar `PROJECT_STATE.md` (backlog + sección `Resolved` +
   cadena `Last Update`/`Previous Update`) y escribir `prompt_sesion_8.md`
   para la siguiente.

**`npm run lint` es un alias de `tsc --noEmit`.** No hay ESLint en el
proyecto. Correrlo como tercer gate no comprueba nada nuevo.

## Leyes que ya costaron caro (siguen vigentes)

- **`sum_total` se lee literal, NUNCA se recalcula.**
- **No asumir el shape de una respuesta externa (API o schema OpenAPI
  DOCUMENTADO-no-OBSERVADO) sin evidencia real.**
- **Prefijo siempre en los identificadores:** `consulta #N`, `factura #N`,
  `NC #N`, `row #N`.
- **RLS no protege nada.** Las conexiones `pg` directas la saltan.
- **`stamp.send` siempre `true` en notas crédito** (Resolución DIAN 000042).
- **Más de un resultado ambiguo (facturas, reconciliaciones) se falla loud,
  nunca se adivina cuál es la correcta** — precedente sentado en C-12
  (sesión 4).
- **Ningún cambio de modelo de datos grande sin proponer el diseño primero y
  esperar confirmación explícita de Jean** — aplica de lleno si se abre el
  diseño completo de A-3.
- **Node fijado en 24** (`.github/workflows/ci.yml` + `engines` en
  `package.json`, sesión 6/H-10). Vercel deprecó Node 20 el 2026-10-01 — no
  bajar la versión sin una razón documentada.

## Backlog abierto que NO se toca en cualquiera de estos bloques

`C-3` + `C-15` (UI, van juntos, necesitan preview y guion de verificación
manual). `C-17` (`sum_total: .default(0)`). `H-18` (obsequios). El bloque
completo de `### Con credenciales de producción — sesión 6` si no hay
credenciales disponibles para este chat.

## Entorno

macOS, zsh. Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`. Node
**24.15.0** local (medido en sesión 1), y ahora también fijado en CI y en
`package.json` → `engines`. Los ZIP se extraen solos en `~/Downloads`; se
aplican con `rsync -av --exclude '__MACOSX' ~/Downloads/<carpeta>/ .` desde la
raíz, barra final obligatoria. Merge por PR de GitHub con "Create a merge
commit".

**Los dotfiles y dotfolders de raíz no van dentro del ZIP** — Archive Utility
los descarta en la extracción. Se entregan sueltos y renombrados, con
instrucción explícita de `cp`/`mkdir -p` al nombre y ruta reales.
