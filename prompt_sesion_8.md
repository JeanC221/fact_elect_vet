# Sesión 8 — sin bloqueante crítico abierto: Higiene casi agotada

> Escrito el 2026-09-15 al cerrar `prompt_sesion_7.md`. Base verificada: el
> ZIP `sesion7_higiene_completa.zip` entregado en ese chat, **no aplicado
> todavía** — Jean lo aplica con `rsync` y confirma los gates de su lado
> antes de mergear. **Reemplaza** a un ZIP intermedio
> (`sesion7_higiene_apiclient.zip`, solo H-19/H-8) entregado a mitad de la
> misma sesión — no aplicar ese, solo el final.
> Gates en esa base antes de aplicar el ZIP: `tsc` exit 0 · **49 files / 812
> tests** · `next build` exit 0 `(8/8)`, 20 rutas, 4 estáticas · `npm audit`
> 0/0. **Confirmar el HEAD real y remedir el baseline al clonar** — no asumir
> que el merge llegó limpio sin haberlo visto.

## Sobre el nombre de este archivo

Igual que los anteriores: `prompt_sesion_8.md` es el octavo prompt de chat
generado, no una etiqueta de fase del proyecto. La referencia válida de
alcance es la columna `#` del backlog consolidado de `PROJECT_STATE.md` — ver
`### Nombres de sesión vs. alcance — leer antes de renumerar nada`.

**La sesión anterior (`prompt_sesion_7.md`) cerró 11 hallazgos en un solo
chat, todos con Sonnet 5 Medium:** H-19, H-8, H-3, H-2, H-7, H-4, H-5, H-6,
H-9, H-12, H-13 (este último ya estaba resuelto de una sesión anterior —
solo le faltaba test dedicado). Detalle completo de cada uno en
`### Resolved — sesión 7, Higiene` de `PROJECT_STATE.md`.

Del bloque de Higiene original (`### Higiene, desacople, CI — sesión 5`)
**solo quedan H-1 y H-11, ambos bloqueados por falta de credenciales en el
entorno de ejecución**, no por complejidad. H-14 no se tomó a propósito: es
feature nueva (detector de anulaciones), no higiene, y requiere una decisión
de diseño (¿panel admin? ¿solo log?) que Jean no ha tomado.

**Dos hallazgos nuevos registrados en la sesión 7, sin arreglar — necesitan
tu decisión, no son continuación automática de Higiene:**

- **N24 — riesgo de redondeo real en `toCents`.** `toCents(n) =
  Math.round(n*100)` puede redondear mal justo en el borde `x.xx5` (ej.
  `1.005` → 100 en vez de 101) por el error de punto flotante de la
  multiplicación directa. `round2` en `provetToSiigo.ts` usa un truco de
  notación exponencial que sí lo evita. `toCents` se usa en los guards de
  coincidencia de totales de **C-11/C-12 — ruta crítica legal**. Cambiar la
  aritmética de un guard fiscal ya probado necesita diseño propuesto primero,
  no un fix de higiene silencioso.
- **N25 — `creditNote.ts` tiene el mismo cap de `observations` a 500** que
  tenía la factura antes de H-5, pero el doc oficial de Siigo no fija un
  número explícito para notas crédito (solo "Comentarios adicionales"). Si
  podés confirmar el límite real (Postman contra el sandbox, o soporte
  Siigo), se sube a un hallazgo H formal.

**Cambio de comportamiento de la sesión anterior a confirmar en un preview
antes de mergear (viene de H-8, no de esta sesión, pero sigue pendiente de
tu confirmación):** en `page.tsx`, las rutas de emisión (`/api/invoices`,
`/api/credit-notes`) antes lanzaban un `SyntaxError` crudo si un 2xx traía un
body no-JSON; ahora lanzan explícitamente (`Error`/`ZodError`) desde el call
site. Mismo resultado observable (falla ruidosa), mecanismo distinto — sin
test hermano de `page.tsx` que lo cubra (Vitest usa `environment: "node"`,
sin DOM).

## Por qué esta sesión y no otra — sigue siendo una elección real

| Bloque | Contenido | Por qué podría ir primero |
|---|---|---|
| **N24** (redondeo `toCents`) | Backlog, ver arriba | Es el único hallazgo de esta lista con impacto fiscal directo (C-11/C-12) — pero necesita que Jean confirme el diseño antes de tocar código, no es un fix directo |
| **A-4** (`middleware.ts` → `proxy.ts`) | Backlog: `### Frontera de autorización — sesión 4` | Diferido a propósito desde la sesión 1. **Es una decisión de arquitectura, no un `mv`**: `proxy` no soporta runtime `edge` y su runtime `nodejs` no es configurable, así que mueve TODA la frontera de autorización a Node. 29 tests ya cubren parte de esto (`middleware.test.ts`, `routeGuard.test.ts`, `routeAuthz.test.ts`) |
| **Diseño completo de A-3** | Epoch de sesión en `credentials_config`, `ALTER TABLE`, revocación real | Jean ya decidió reservar esto para su propia sesión con **Opus High** (confirmado dos veces — sesión 4 y sesión 7 — no re-litigar) — requiere decidir si el middleware/proxy puede pagar una lectura a Postgres en cada request, y un cambio de modelo de datos que necesita el SQL exacto para que Jean lo corra a mano en Supabase |
| **H-14** (detector de anulaciones) | Backlog, ver arriba | Necesita una decisión de diseño de Jean antes de cualquier código: ¿qué hace la app con lo detectado? |
| `P-1`/`P-2`/… (`### Con credenciales de producción — sesión 6`) | Primera emisión real, captura de notas crédito, etc. | Solo viable si para este chat ya hay credenciales de producción de Siigo/Provet — si no las hay, este bloque sigue sin ser viable |

**Este prompt no elige por Jean.** Decilo al empezar el chat — el protocolo
de abajo aplica igual sea cual sea el bloque.

**Nota de modelo:** si el bloque elegido es el diseño completo de A-3 o A-4
(una vez que A-4 se reconozca como decisión de arquitectura real, no un
`mv`), usar **Opus 5 High** desde el arranque, según `Model_Usage`. N24 es
ambiguo: el fix en sí es pequeño, pero el análisis de impacto sobre guards
fiscales ya probados amerita empezar con cautela — evaluarlo al ver el
alcance real una vez que Jean confirme el diseño.

## Releer antes de tocar código

- `.clinerules`, `01_PROJECT_REQUIREMENTS.md`, `2_AGENT_WORKFLOW_RULES.md`,
  `03_UI_UX_DESIGN_SPEC.md` — gobernanza, viven en el repo, no se duplican en
  el Project.
- Si el bloque elegido es **A-4**: `middleware.ts`, `routeGuard.ts`,
  `routeAuthz.ts` y sus tests (29 tests) antes de tocar nada. Confirmar contra
  la doc real de Next.js 16.3.4 si `proxy.ts` con runtime `nodejs` sigue
  siendo la única opción, o si algo cambió desde la migración de la sesión 1.
- Si el bloque elegido es **N24**: releer `toCents`/`round2`/
  `formatColombiaDate` en `schemas/provet.ts` y `provetToSiigo.ts`, y cada
  call site de `toCents` (`invoices/route.ts`, `consultationQueue.ts`,
  `creditNote.ts`) antes de proponer un fix — confirmar con Jean si
  unificarlos hacia el truco de `round2` (más seguro) cambia algún total ya
  probado en la suite existente.
- Si el bloque elegido es **diseño de A-3**: releer la nota de A-3 en
  `PROJECT_STATE.md` (sesión 4) y `sessionCookies.ts`/`jwt.ts` completos antes
  de proponer el esquema. No implementar el `ALTER TABLE` sin dárselo a Jean
  como SQL exacto para correr a mano en Supabase.
- Si el bloque elegido es **H-1 o H-11** (bloqueados en sesión 7): confirmar
  primero si ya hay credenciales sandbox de Provet/Siigo disponibles para
  este chat — si no las hay, siguen sin ser viables.

## Protocolo (igual que las sesiones anteriores)

1. Clonar fresco. Confirmar HEAD y medir el baseline **antes de tocar nada**.
2. Si el hallazgo elegido toca un contrato externo (Siigo/Provet) o de
   plataforma (Next.js/Vercel), releer la evidencia real antes de escribir una
   sola línea — no asumir que la descripción del backlog sigue vigente sin
   contrastarla contra el código y la doc actuales.
3. TDD cuando se arregla un bug: primero un test que reproduzca el problema,
   luego el fix. Para cambios de solo-configuración o solo-documentación, TDD
   no aplica — decirlo explícitamente en vez de fabricar un test decorativo.
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
   cadena `Last Update`/`Previous Update`) y escribir `prompt_sesion_9.md`
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
- **Ningún cambio de modelo de datos grande, ni de aritmética en un guard
  fiscal ya probado, sin proponer el diseño primero y esperar confirmación
  explícita de Jean** — aplica de lleno a N24 y al diseño completo de A-3.
- **Node fijado en 24** (`.github/workflows/ci.yml` + `engines` en
  `package.json`, sesión 6/H-10). Vercel deprecó Node 20 el 2026-10-01 — no
  bajar la versión sin una razón documentada.
- **No confiar en los conteos de `docs/audits/` sin recontar contra el código
  actual** — el "12 fetch en 5 archivos" de N23 no sumaba ni internamente
  (18 reales); el "tres implementaciones de America/Bogota" de L2/L4 tampoco
  (cuatro reales). `docs/audits/` es archivo histórico con afirmaciones
  falsificadas; no se ejecuta nada desde ahí — recontar siempre contra el
  código actual.
- **Un mock que decide su resultado por qué función lo llama, no por el SQL
  real enviado, no detecta un mutante que borra un guard** — lección de H-19.
  Cualquier test nuevo sobre `invoice_claims.ts` (o cualquier otra tabla) debe
  leer la query real, no solo la función bajo prueba.
- **Un fallback `?? valorCrudo` en un campo de texto que llega a Siigo
  necesita sanear igual que el camino feliz** — lección de H-12. Revisar
  cualquier `??`/`||` de texto nuevo contra `sanitizeText`.

## Backlog abierto que NO se toca en cualquiera de estos bloques

`C-3` + `C-15` (UI, van juntos, necesitan preview y guion de verificación
manual). `C-17` (`sum_total: .default(0)`). `H-18` (obsequios). El bloque
completo de `### Con credenciales de producción — sesión 6` si no hay
credenciales disponibles para este chat. `H-1`/`H-11` si tampoco hay
credenciales sandbox.

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
