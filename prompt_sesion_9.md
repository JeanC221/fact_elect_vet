# Sesión 9 — sin bloqueante crítico abierto: el resto necesita preview, credenciales o una decisión de Jean

> Escrito el 2026-09-15 al cerrar `prompt_sesion_8.md`. Base: PR #26
> (`sesion8/n25-n24-a4`) ya mergeado a `main` con "Create a merge commit" —
> **`main` ya tiene el HEAD `023901eac27aea1172c0c36429c6925b826ecb10`**, no
> hace falta aplicar ningún ZIP para empezar esta sesión. Gates verificados
> en ese HEAD, del lado de Jean: `tsc` exit 0 · **49 files / 817 tests** ·
> `next build` exit 0 `(8/8)`, 20 rutas, 4 estáticas, sin el aviso de
> deprecación de `middleware` · `npm audit` 0/0. **Confirmar el HEAD real y
> remedir el baseline al clonar** — no asumir que el merge llegó limpio sin
> haberlo visto.

## Sobre el nombre de este archivo

Igual que los anteriores: `prompt_sesion_9.md` es el noveno prompt de chat
generado, no una etiqueta de fase del proyecto. La referencia válida de
alcance es la columna `#` del backlog consolidado de `PROJECT_STATE.md` — ver
`### Nombres de sesión vs. alcance — leer antes de renumerar nada`.

**La sesión anterior (`prompt_sesion_8.md`) cerró los tres hallazgos que no
tenían bloqueo externo, con Sonnet 5 Medium para N25/N24 y Opus 5 High para
A-4:**
- **N25** — cerrado documentalmente, sin cambio de código. El cap de 500 en
  `creditNote.ts` es correcto según el portal de ayuda al cliente de Siigo
  (fuente distinta de la doc de API citada en H-5). Ver `EVIDENCIA_APIS.md
  §1.12`. Queda pendiente de confirmación empírica si algún día hay un POST
  real de nota crédito (**P-2**).
- **N24** — `toCents` redondeaba mal en el borde `x.xx5`. Ahora `toCents` y
  el `round2` de `provetToSiigo.ts` comparten una sola primitiva
  (`shiftRound`/`roundTo` en `schemas/provet.ts`). Verificado empíricamente
  que unificar la aritmética no cambia ningún total ya probado (49 files /
  812 tests, cero roto, antes de escribir el fix).
- **A-4** — `src/middleware.ts` → `src/proxy.ts`. El cambio de runtime Edge →
  Node quedó **medido en los artefactos de build** (manifest, no solo el
  aviso de deprecación), no inferido. 12 comentarios obsoletos corregidos en
  el camino (Edge/`middleware.ts` referenciados donde ya no aplica).

Detalle completo de cada uno en `### Resolved — sesión 8` de
`PROJECT_STATE.md`.

**Dos mediciones que A-4 dejó pendientes y que ningún gate puede hacer —
requieren un deploy o preview real, no siguen desde esta sesión salvo que
Jean ya las tenga:**
- **Impacto de latencia/cuota de mover la frontera de Edge a Node.** El
  matcher cubre todo salvo `login` y estáticos, así que cada request paga
  ahora una invocación de función Node en vez de Edge. Mueve consumo de la
  cuota de Edge Middleware a la de Functions — interactúa con el pendiente
  de Hobby → Pro (**T-3**).
- **Cambio de comportamiento de H-8 en `page.tsx`** (arrastrado desde la
  sesión 7, sigue sin confirmar): las rutas de emisión antes lanzaban un
  `SyntaxError` crudo si un 2xx traía un body no-JSON; ahora lanzan
  explícitamente. Mismo resultado observable, mecanismo distinto — sin test
  hermano que lo cubra (Vitest usa `environment: "node"`, sin DOM).

## Por qué esta sesión y no otra — sigue siendo una elección real

Con N25/N24/A-4 cerrados, el backlog **sin bloqueo externo** quedó corto:

| Bloque | Contenido | Por qué podría ir primero |
|---|---|---|
| **C-3 + C-15** | `### Abiertos por la sesión 2` — tres fallos de UI en la costura del drawer (`balanced` compara contra el campo equivocado, `paidAmount` no llega al payload, `formatCOP` redondea al mostrar) + confirmación humana del neto cuando hay nota de crédito | Es lo único que queda abierto de los ocho hallazgos originales de la sesión 2 (C-11, C-1, C-2, C-3, C-4, C-5, C-6, C-7 — los otros siete ya están cerrados). **Deliberadamente diferido desde la sesión 2** a la primera sesión que tenga preview real y un guion de verificación manual — si ya lo tenés, este es candidato natural |
| **C-17** | `sum_total: z.coerce.number().default(0)` fabrica un importe donde el campo viene ausente | Tiene un desbloqueante propio: medir cuántas filas del tenant vienen sin `sum_total`. Si son cero, quitar el `.default(0)` es gratis — si no, hay que decidir qué hacer con las que sí. Necesita acceso al tenant real para medir |
| **H-18** | Líneas de obsequio (`sum_total: 0`) no se pueden representar en Siigo hoy | Requiere agregar `items.tax_base` y `items.taxpayer` al schema — no existen hoy ni en `siigo.ts` ni en `provetToSiigo.ts`. Compromiso conocido: sin esto, 4 consultas mal facturadas se cambian por 10 que dejan de emitir |
| **H-14** | Detector de anulaciones en Provet — especificado, sin incógnitas técnicas | Sigue bloqueado por una decisión de diseño que Jean no ha tomado: ¿panel admin o solo log? No tomar sin esa decisión primero |
| **Diseño completo de A-3** | Epoch de sesión en `credentials_config`, `ALTER TABLE`, revocación real | Reservado para su propia sesión con **Opus High** (confirmado tres veces — sesiones 4, 7 y 8 — no re-litigar). **A-4 quitó un bloqueante duro** (`pg` ya es alcanzable desde la frontera en Node, no lo era desde Edge) **pero no respondió la pregunta de costo** (un round trip a Postgres en cada request que matchee) — no asumir que A-4 la resolvió |
| `P-1`…`P-6` (`### Con credenciales de producción — sesión 6`) | Primera emisión real, captura de nota crédito, CSP fase 2, etc. | Solo viable si para este chat ya hay credenciales de producción de Siigo/Provet |
| `H-1` / `H-11` | Rediseño del fetch de Provet / smoke test de emisión autenticado | Bloqueados desde la sesión 7 por falta de credenciales sandbox de Provet en el entorno — confirmar primero si ya las hay |

**Este prompt no elige por Jean.** Decilo al empezar el chat — el protocolo
de abajo aplica igual sea cual sea el bloque.

**Nota de modelo:** el diseño completo de A-3 usa **Opus 5 High** desde el
arranque, según `Model_Usage` — decisión ya confirmada, no volver a
preguntar. C-3+C-15, C-17 y H-18 son candidatos claros para **Sonnet 5
Medium**: alcance acotado, sin ambigüedad de causa raíz una vez medidos. H-14
no se toma sin que Jean confirme primero el diseño (panel vs. log); una vez
confirmado, también es Sonnet Medium.

## Releer antes de tocar código

- `.clinerules`, `01_PROJECT_REQUIREMENTS.md`, `2_AGENT_WORKFLOW_RULES.md`,
  `03_UI_UX_DESIGN_SPEC.md` — gobernanza, viven en el repo, no se duplican en
  el Project.
- Si el bloque elegido es **C-3 + C-15**: `QuickEditDrawer.tsx`,
  `consultationQueue.ts` (línea 38, `formatCOP`), y el guion de verificación
  manual pendiente desde C-16/C-11/C-2 (mismo guion, misma sesión futura con
  preview — ver `PROJECT_STATE.md`). Confirmar con Jean que hay preview real
  antes de proponer el fix de UI: sin eso, no hay forma de verificar
  visualmente el render del badge/mensaje.
- Si el bloque elegido es **C-17**: medir primero cuántas filas del tenant
  vienen sin `sum_total` antes de decidir el fix — no asumir que son cero.
- Si el bloque elegido es **H-18**: releer `API_SIIGO_REFERENCIA_COMPLETA.md
  §3.1` para `tax_base`/`taxpayer` antes de tocar el schema.
- Si el bloque elegido es **H-14**: confirmar la decisión de diseño con Jean
  (panel admin vs. solo log) antes de escribir una sola línea.
- Si el bloque elegido es **diseño de A-3**: releer la nota de A-3 en
  `PROJECT_STATE.md` (sesiones 4 y 8) y `sessionCookies.ts`/`jwt.ts`
  completos antes de proponer el esquema. No implementar el `ALTER TABLE`
  sin dárselo a Jean como SQL exacto para correr a mano en Supabase.
- Si el bloque elegido es **H-1 o H-11**: confirmar primero si ya hay
  credenciales sandbox de Provet/Siigo disponibles para este chat — si no
  las hay, siguen sin ser viables.

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
   cadena `Last Update`/`Previous Update`) y escribir `prompt_sesion_10.md`
   para la siguiente — **antes** de dar la sesión por cerrada, no como
   ocurrencia tardía.

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
  explícita de Jean.**
- **Node fijado en 24** (`.github/workflows/ci.yml` + `engines` en
  `package.json`, sesión 6/H-10). Vercel deprecó Node 20 el 2026-10-01 — no
  bajar la versión sin una razón documentada.
- **No confiar en los conteos de `docs/audits/` sin recontar contra el código
  actual** — `docs/audits/` es archivo histórico con afirmaciones
  falsificadas; no se ejecuta nada desde ahí.
- **Un mock que decide su resultado por qué función lo llama, no por el SQL
  real enviado, no detecta un mutante que borra un guard** — lección de H-19.
- **Un fallback `?? valorCrudo` en un campo de texto que llega a Siigo
  necesita sanear igual que el camino feliz** — lección de H-12.
- **`proxy.ts` corre SIEMPRE en Node y su runtime no es configurable** —
  confirmado en vivo en la sesión 8, no volver a tratarlo como incierto.
- **Un comentario que afirma algo falso sobre el código sobrevive sesiones
  si nadie lo corrige** — lección de A-2 (el "hash irreversible" que se usó
  de argumento para no priorizar D1). Los 12 comentarios de `middleware`/Edge
  corregidos en la sesión 8 son la aplicación de esta misma lección, no un
  caso nuevo.

## Backlog abierto que NO se toca en cualquiera de estos bloques

El bloque completo de `### Con credenciales de producción — sesión 6` si no
hay credenciales disponibles para este chat. `H-1`/`H-11` si tampoco hay
credenciales sandbox. `H-14` sin decisión de diseño de Jean.

## Entorno

macOS, zsh. Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`. Node
**24.15.0** local, fijado en CI y en `package.json` → `engines`. Los ZIP se
extraen solos en `~/Downloads`; se aplican con
`rsync -av --exclude '__MACOSX' ~/Downloads/<carpeta>/ .` desde la raíz,
barra final obligatoria. Merge por PR de GitHub con "Create a merge commit".

**Ojo con renames** (como el de `middleware.ts` → `proxy.ts` en la sesión
8): `rsync` copia el archivo nuevo pero no borra el viejo. Si un entregable
renombra un archivo, el prompt de cierre de esa sesión debe decir
explícitamente cuáles borrar a mano — y quien aplique el ZIP debe hacerlo
antes de correr los gates, no después.

**Los dotfiles y dotfolders de raíz no van dentro del ZIP** — Archive Utility
los descarta en la extracción. Se entregan sueltos y renombrados, con
instrucción explícita de `cp`/`mkdir -p` al nombre y ruta reales.
