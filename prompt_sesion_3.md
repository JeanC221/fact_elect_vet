# Sesión 3 — reconciliación e idempotencia

> Escrito el 2026-09-11 al cerrar la sesión 2. Base verificada: `main` en
> `12f149c` (merge del PR #19, C-2). Gates en esa base: `tsc` exit 0 ·
> **45 files / 664 tests** · `next build` exit 0 `(8/8)`, 20 rutas, 4 estáticas ·
> `npm audit` 0/0.

## Lee esto antes que nada

**Dos de los ocho enunciados de la sesión 2 resultaron FALSOS al medirlos.**

| Decía | Medido |
|---|---|
| C-1: sobrefacturación de **1574.04** en `consulta #4` | Ese número no existe. Nadie lo midió; salió de restar dos cifras de documentos distintos |
| C-2: la `factura #12` es "un documento positivo que **no** es nota de crédito" | Es nota de crédito: `credit_note: true`, `consultation: null` |

Los dos venían de `AUDITORIA_PROYECTO_2026-09-09.md` y
`AUDITORIA_FACT_ELECT_VET_2026-09-09.md`, que son las mismas fuentes de C-4,
C-5, C-6, C-7 y C-3. **Cada hallazgo de esta sesión arranca midiendo, no
codificando.** En C-1 el fix final fue UNA línea y todo lo demás fue medición;
descubrir que el enunciado estaba mal costó ocho turnos.

En la tabla de abajo, cada hallazgo lleva marcado si su enunciado está
contrastado contra el tenant o no.

## El tenant de pruebas NO es el de la clínica

Medido el 2026-09-11: `payer_country: "United States of America"`,
`Colorado Springs`, `TEST CLIENT`, documentos de 2021, **IVA al 12.4%** — que en
Colombia no existe. Es el entorno de demo de Provet.

- Los **contratos de la API** sí valen: qué campos existen, qué tipos tienen,
  qué joins funcionan. Eso es Provet.
- Las **cifras de impacto** no. Ninguna magnitud medida aquí describe la
  facturación de la veterinaria.
- Las **reglas de negocio** tampoco. Hay registros incoherentes hechos a mano.

Ver `PROJECT_STATE.md → ### El tenant medido NO es el de la clínica`.

## Orden obligatorio

| Orden | # | Enunciado | Estado del enunciado |
|---|---|---|---|
| 1 | **C-16** | `consulta #10` revertida entera se factura igual | **Contrastado.** Nuevo, escrito desde medición |
| 2 | **C-4** | `created_end` sin hora excluye la factura del día | **SIN contrastar** (origen N17) |
| 3 | **C-7** | Reconciliación truncada a 500 documentos | **SIN contrastar** (origen N18) |
| 4 | **C-5** | `duplicated_document` tratado como "no se creó nada" | **SIN contrastar** (origen N7) |
| 5 | **C-6** | `X-Idempotency-Key` validada después de tomar el claim | **SIN contrastar** (origen N6) |

C-4 y C-7 son la misma familia (la reconciliación miente de dos formas). C-5 y
C-6 son la misma costura (`Idempotency-Key` y claim). Agrupables de dos en dos,
**pero con los tres gates entre hallazgo y hallazgo**: uno a la vez, no dos a
la vez.

**C-3 y C-15 NO son de esta sesión.** Las dos tocan UI y van juntas en la
última, la que tenga preview y guion de verificación manual.

## Protocolo

1. Clonar fresco. Confirmar HEAD y medir el baseline **antes de tocar nada**.
2. Por cada hallazgo: **contrastar el enunciado contra el tenant primero**. Si
   no cuadra, reescribirlo y decirlo, no codificar sobre él.
3. Fase roja confirmada explícitamente antes del fix.
4. Mutación después del fix. Un mutante que sobrevive es un hueco del test:
   ciérralo o justifícalo.
5. Los tres gates entre sub-pasos: `npx tsc --noEmit`, `npx vitest run`
   completo, `env -u NODE_ENV npx next build`.
6. Entregable: ZIP con rutas completas, contenido completo de cada archivo, y
   los SHA-256 para verificar el `rsync`.

**`npm run lint` es un alias de `tsc --noEmit`.** No hay ESLint. Correrlo como
tercer gate no comprueba nada nuevo.

## Leyes que ya costaron caro

- **`sum_total` se lee literal, NUNCA se recalcula.** `quantity ×
  price_with_vat` discrepa en 6 filas del tenant: Provet embebe cargos de
  dispensación dentro de `sum` (`row #48`: 4.4502 dentro de un `sum` de
  21.4502) y aplica descuentos por `percentage_change`/`discount_amount`
  (`row #111`: −20%). Recalcular para *verificar* también está prohibido: se
  usó como evidencia en la sesión 2 y produjo una regla falsa.
- **`buildQueueFromProvet` no lanza.** Una fila corrupta dejaría la cola entera
  en blanco. El patrón es de dos capas: el mapper marca,
  `buildInvoicePayloadFromQuickEdit` lanza. Ver `CorruptInvoiceRowError`.
- **La exención de la anulación no se endurece.** `enforceTotalMatch: false`.
  Una factura ya timbrada tiene que poder anularse aunque su consulta esté
  bloqueada.
- **Prefijo siempre en los identificadores:** `consulta #10`, `factura #10`,
  `NC #19`, `row #48`. Documentos distintos con el mismo número existen y la
  conflación entre ellos es de donde salió el 1574.04 retirado.
- **No asumir el shape de una respuesta externa sin evidencia.** Dos veces en
  la sesión 2 el objeto real tenía campos que nadie había mirado: `invoice`
  expone 45 claves y ahí estaba `original_consultation`, que resolvió C-1 en
  una línea y tiró dos joins que llevaban tres turnos en discusión.

## Deuda que entra en esta sesión

- **Verificación manual del render, sin hacer.** La capa visual de C-11
  (`ConsultationQueue.tsx`, `QuickEditDrawer.tsx`) se mergeó sin verla
  renderizada, y el mensaje de `CorruptInvoiceRowError` de C-2 viaja por esa
  misma capa. **Va en la última sesión, con preview, antes del cutover.**
- **La pasada completa sobre las 39 consultas** para saber cuántas quedan
  bloqueadas en total. Solo se midieron las que tienen filas descartadas.
  Hoy importa menos: las bloqueadas son registros de demo.
- **El PR de `sesion2/c11-assert-totales` se cierra SIN mergear.** Su contenido
  (`ab1f423`) está reintegrado a mano en `PROJECT_STATE.md`.
- **Los 5.00 de `row #48` y `row #112`** siguen sin explicar. No bloquea nada
  mientras se trabaje con cabeceras y `sum_total` literal.

## Backlog abierto que NO se toca aquí

`C-15` (confirmación humana del neto, con C-3), `C-17`
(`sum_total: .default(0)`, misma clase que el `cufe: ""`), `H-18` (obsequios,
necesita `tax_base`/`taxpayer`).

## Herramientas de diagnóstico

Cinco scripts en `~/Downloads` de Jean, fuera del repo a propósito, solo GET:
`diagnose_provet_totales.mjs`, `diagnose_provet_creditnotes.mjs`,
`diagnose_provet_creditnotes_dump.mjs`, `diagnose_provet_creditnotes_raw.mjs`,
`diagnose_provet_c2.mjs`, `diagnose_provet_consultation.mjs`. Se corren con
`node --env-file=.env.local <ruta>` desde la raíz del repo.

## Entorno

macOS, zsh. Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`. Los ZIP se
extraen solos en `~/Downloads`; se aplican con
`rsync -av --exclude '__MACOSX' ~/Downloads/<carpeta>/ .` desde la raíz, barra
final obligatoria. Merge por PR de GitHub con "Create a merge commit".

**Los dotfiles no van dentro del ZIP** — Archive Utility los descarta en la
raíz. Se entregan sueltos y renombrados, con instrucción de `cp`.
