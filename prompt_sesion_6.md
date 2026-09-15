# Sesión 6 — sin bloqueante crítico abierto: tres candidatos, ninguno obvio

> Escrito el 2026-09-14 al cerrar `prompt_sesion_5.md`. Base verificada: el
> ZIP `sesion5_frontera_autorizacion.zip` entregado en ese chat, **aplicado y
> mergeado** sobre `main` en el commit que resulte del PR correspondiente.
> Gates en esa base antes de aplicar el ZIP: `tsc` exit 0 · **47 files / 733
> tests** · `next build` exit 0 `(8/8)`, 20 rutas, 4 estáticas · `npm audit`
> 0/0. **Confirmar el HEAD real y remedir el baseline al clonar** — no asumir
> que el merge llegó limpio sin haberlo visto.

## Sobre el nombre de este archivo

Igual que los anteriores: `prompt_sesion_6.md` es el sexto prompt de chat
generado, no una etiqueta de fase del proyecto. La referencia válida de
alcance es la columna `#` del backlog consolidado de `PROJECT_STATE.md` — ver
`### Nombres de sesión vs. alcance — leer antes de renumerar nada`.

**La sesión anterior (`prompt_sesion_5.md`, alcance "sesión 4" en el
backlog) cerró A-1, A-2 y C-12, y mitigó A-3** (TTL de sesión 24h → 8h; el
diseño completo de A-3 queda diferido a propósito, ver abajo). A-4 quedó
fuera de la sesión 4 por decisión explícita de Jean.

## Por qué esta sesión y no otra — sigue siendo una elección real

Como la sesión 4, no hay un único candidato obvio. Tres bloques válidos:

| Bloque | Contenido | Por qué podría ir primero |
|---|---|---|
| `### Higiene, desacople, CI — sesión 5` (`PROJECT_STATE.md`) | H-1 a H-14, H-19 | H-10 (CI en GitHub Actions) es, según el propio backlog, "el mayor retorno por esfuerzo" — ~15 min, corre solo en cada PR futuro. H-19 (test dedicado de `invoice_claims.ts` contra SQL real, no solo contra un mock canned) es acotado y aislado, buen warm-up |
| **A-4** (`middleware.ts` → `proxy.ts`) | Backlog: `### Frontera de autorización — sesión 4` | Diferido a propósito desde la sesión 1. **Es una decisión de arquitectura, no un `mv`**: `proxy` no soporta runtime `edge` y su runtime `nodejs` no es configurable, así que mueve TODA la frontera de autorización a Node. 29 tests ya cubren parte de esto (`middleware.test.ts`, `routeGuard.test.ts`, `routeAuthz.test.ts`) |
| **Diseño completo de A-3** | Epoch de sesión en `credentials_config`, `ALTER TABLE`, revocación real | Jean ya decidió reservar esto para su propia sesión con **Opus High** — requiere decidir si el middleware de Edge puede pagar una lectura a Postgres en cada request, y un cambio de modelo de datos que necesita el SQL exacto para que Jean lo corra a mano en Supabase |
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
  resultado que el mock decide devolver.
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
   luego el fix. Para cambios de solo-documentación (como A-2 en la sesión
   anterior), TDD no aplica — decirlo explícitamente en vez de fabricar un
   test decorativo.
4. Mutación manual después del fix (sin Stryker, no está configurado).
5. Los tres gates entre sub-paso y sub-paso: `npx tsc --noEmit`,
   `npx vitest run` completo, `env -u NODE_ENV npx next build`.
6. Entregable: **un solo ZIP** al cerrar el chat, con rutas completas,
   contenido completo de cada archivo, y SHA-256 de cada uno.
7. Al cerrar: actualizar `PROJECT_STATE.md` (backlog + sección `Resolved` +
   cadena `Last Update`/`Previous Update`) y escribir `prompt_sesion_7.md`
   para la siguiente.

**`npm run lint` es un alias de `tsc --noEmit`.** No hay ESLint. Correrlo como
tercer gate no comprueba nada nuevo.

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
  (sesión 4): Jean prefiere bloquear y revisar a mano en Provet antes que un
  "último gana" silencioso con implicación fiscal.
- **Ningún cambio de modelo de datos grande sin proponer el diseño primero y
  esperar confirmación explícita de Jean** — aplica de lleno si se abre el
  diseño completo de A-3.

## Backlog abierto que NO se toca en cualquiera de estos bloques

`C-3` + `C-15` (UI, van juntos, necesitan preview y guion de verificación
manual). `C-17` (`sum_total: .default(0)`). `H-18` (obsequios). El bloque
completo de `### Con credenciales de producción — sesión 6` si no hay
credenciales disponibles para este chat.

## Entorno

macOS, zsh. Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`. Los ZIP
se extraen solos en `~/Downloads`; se aplican con
`rsync -av --exclude '__MACOSX' ~/Downloads/<carpeta>/ .` desde la raíz, barra
final obligatoria. Merge por PR de GitHub con "Create a merge commit".

**Los dotfiles no van dentro del ZIP** — Archive Utility los descarta en la
raíz. Se entregan sueltos y renombrados, con instrucción de `cp`.
