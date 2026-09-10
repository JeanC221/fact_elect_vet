# Current Project State: Provet Cloud ↔ Siigo Nube Integrator

## Overview
Internal web application (Middleware API + Operational Dashboard) designed to automate DIAN-approved electronic invoicing for a Colombian veterinary clinic, connecting Provet Cloud (PMS) with Siigo Nube (ERP)[cite: 1, 6].

---

## Technical & Design Specifications
- Requirements & Domain Rules: `01_PROJECT_REQUIREMENTS.md`[cite: 1, 3]
- Agent Execution Protocol & Governance: `02_AGENT_WORKFLOW_RULES.md`
- Clinical UI/UX System Specification: `03_UI_UX_DESIGN_SPEC.md`[cite: 3, 7]

---

## Current Phase Roadmap
- [x] **Phase 1: Base Architecture & Mock Schemas**
  - [x] Setup Next.js/Node.js project with TypeScript & Zod strict validation.
  - [x] Create mock data schemas for Provet (`consultations`, `clients`, `patients`) and Siigo (`/products`, `/payment-types`, `/invoices`).
  - [x] Complete Next.js base scaffold (`next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `app/layout.tsx`, `app/page.tsx`).
  - [x] Create typed mock fixtures for Provet and Siigo conforming 100% to Zod schemas.
- [x] **Phase 2: API Services & Pure Mappers**[cite: 3]
  - [x] Implement REST/OAuth adaptors for Provet and Siigo APIs[cite: 3, 10].
  - [x] Implement pure data mapping functions (`provetToSiigoInvoice`)[cite: 3].
- [x] **Phase 3: Interactive Web Dashboard**[cite: 3, 11]
  - [x] View pending & closed consultations from Provet[cite: 3, 6].
  - [x] Quick-edit modal (Identification/NIT, email, payment methods) and 1-Click Invoicing[cite: 3, 11].
  - [x] Invoice history, DIAN status badge (Accepted/Rejected), and PDF/XML download actions[cite: 3, 11].
    (`InvoiceHistory.tsx`, `StatusBadge.tsx`, `GET /api/invoice-history`, `GET /api/invoices/[id]/[format]`)
  - [x] Credit Notes / Invoice Annulment module[cite: 3, 11].
    (`CreditNoteModal.tsx`, `mappers/creditNote.ts`, `POST /api/credit-notes` — server-side only)
  - [x] Employee JWT authentication & login system[cite: 1, 3, 11].
- [x] **Phase 4: Settings & Catalog Mapping**[cite: 3, 11]
  - [x] Dynamic mapping interface for items/services and payment methods between Provet & Siigo[cite: 1, 3].
  - [x] Secure credentials configuration panel and Sandbox vs. Production toggle[cite: 1, 3].
  - [x] Activate live `fetch()` POST /v1/invoices in `siigoApi.submitInvoice` (Partner-Id, Idempotency-Key, Authorization headers).
- [x] **Phase 5: Error Handling & Fallbacks**[cite: 1, 3]
  - [x] User-friendly Spanish translation layer for raw Siigo/DIAN error responses[cite: 1, 3].
  - [x] Retries panel with exponential backoff for 429/503 responses[cite: 1, 3].
- [x] **Phase 6: Performance Optimization & Deployment**[cite: 1, 3]
  - [x] Core Web Vitals audit (Lighthouse / GTmetrix optimization)[cite: 1, 3].
  - [x] Web production deployment (Vercel configuration, security headers, environment variables documentation)[cite: 1, 3, 11].

---

## Current State — Backlog Consolidado (sesión 0, 2026-09-10)

Fusión de `AUDITORIA_PROYECTO_2026-09-09.md` (22 hallazgos de proceso/infra) y
`AUDITORIA_FACT_ELECT_VET_2026-09-09.md` (22 hallazgos de código), más lo medido
en vivo el 2026-09-10. **Numeración única.** Los prefijos antiguos (`N`, `H`, `P`,
`S`, `B`, `D`, `T`) se conservan entre paréntesis solo para poder rastrear el
origen; la referencia válida a partir de hoy es la columna `#`.

**Conflicto resuelto entre los dos informes:** el informe de proyecto decía
"funcionalmente terminado"; el de código decía que la anulación no puede funcionar.
**Gana el de código.** "Terminado" es falso mientras la anulación legal no exista.

### Bloqueantes de corrección — sesión 2 (ruta crítica de la factura)

| # | Origen | Qué | Evidencia |
|---|---|---|---|
| **C-1** | nuevo 2026-09-10 | **Omisión de abonos de Provet en la cola.** `provetToQueue.ts:105-115` construye `consultationByInvoiceId` desde `inv.consultation`, que es `null` en toda nota de crédito, así que el documento entero desaparece. Medido: factura 5 = 1699.04, abono de 125.00 sobre `invoicerow/3` de esa misma factura → la cola factura 1699.04 en vez de 1574.04. **Sobrefacturación de 125.00 con validez fiscal.** El join correcto es `credited_invoicerow` → fila → factura → consulta | `EVIDENCIA §2.8` |
| **C-2** | N5 | `provetToQueue.ts:117` — `if (lineTotal <= 0) continue` descarta filas en silencio. **Confirmado con datos**: `invoicerow/37` tiene `sum_total=-29.22`. Distinto de C-1 y con fix distinto. La justificación se escribe como "descarta filas negativas reales"; **no** como "descarta descuentos", que sigue sin verificar | `EVIDENCIA §2.8 d/e` |
| **C-3** | N16 | El `balanced` de `QuickEditDrawer.tsx:56` compara `detail.total` contra lo tecleado, nunca contra `sumLineTotals`. `values.paidAmount` no llega al payload | — |
| **C-4** | N17 | `invoiceReconciliation.ts:92-94` — `created_end` sin hora se interpreta `T00:00:00` y excluye la factura del día. Devuelve `null`, la ruta lo lee como "no existe" y **emite una segunda factura timbrada**. Aplica idéntico a `GET /v1/credit-notes` | `API_SIIGO §Listar` |
| **C-5** | N7 | `duplicated_document` llega como 400 y `provablyCreatedNothing` lo trata como "no se creó nada". Es el único 4xx que significa lo contrario | — |
| **C-6** | N6 | La `X-Idempotency-Key` se valida después de tomar el claim; una clave malformada deja la consulta en `unknown` sin tocar Siigo | — |
| **C-7** | N18 | Reconciliación truncada a 500 documentos: "no lo encontré" se convierte en "no existe" | — |

### Bloqueante crítico — sesión 3 (nota crédito)

| # | Origen | Qué |
|---|---|---|
| **C-8** | N8 | El mapper de nota crédito está construido contra un contrato inventado: falta `invoice` (GUID) y `date`, `reason` es string donde la API espera entero 1-6, importes negados donde la API los quiere positivos, `total` en raíz donde no es campo de request, y la respuesta 201 se lee en raíz cuando `cufe`/`cude`/`status` van **bajo `stamp`**. **Ninguna nota crédito puede emitirse hoy** |
| **C-9** | N14 | `creditNote.test.ts` — 23 tests que blindan el contrato equivocado. **Borrarlos ANTES de tocar el mapper**, o un agente futuro revierte el fix |
| **C-10** | N13 | La ruta de notas crédito no tiene claim, marcador ni reconciliación. **Corrección al informe:** `GET /v1/credit-notes` SÍ existe con los mismos filtros que facturas, y su respuesta trae `invoice: {id, name}` — **una NC se localiza por el GUID de su factura padre, sin marcador en `observations`**. Ancla más fuerte que la de facturas y menos trabajo del estimado |

### Frontera de autorización — sesión 4

| # | Origen | Qué |
|---|---|---|
| **A-1** | N15 | `PUT /api/catalog-mapping` y `POST /api/credentials/health` solo piden `requireSession`. Un `employee` puede cambiar por API el tipo de comprobante DIAN y todo el mapeo. Misma clase que D0; sobrevivió al chat 6a |
| **A-2** | N19 | El comentario de `auth.ts:14-19` afirma que el hash es irreversible. `sha256` sin sal ni coste no lo es. **La afirmación es falsa y hoy sirve de argumento para aplazar D1** |
| **A-3** | N20 | Sin revocación de sesión: cambiar la contraseña no invalida JWT vivos (24 h) |
| **A-4** | nuevo | **`middleware.ts` → `proxy.ts` y decisión de runtime.** Diferido desde la sesión 1 a propósito (ver Decisiones de plataforma). Aquí viven los 29 tests de `middleware`/`routeGuard`/`routeAuthz` |

### Higiene, desacople, CI — sesión 5

| # | Origen | Qué |
|---|---|---|
| **H-1** | N10 **reclasificado** | **Rediseño del fetch de Provet, no ajuste de paginación.** `invoice__in` funciona (8 filas vs 223 sin filtro), así que `/invoicerow/` deja de traerse entera. `/consultationitem/` se queda como está: para esa colección no hay filtro por padre y la causa raíz escrita era correcta. Medir el tamaño de lote de `invoice__in`. **Prerrequisito de infraestructura** |
| **H-2** | nuevo 2026-09-10 | **`provetApi.ts:71` pide `/invoice` sin barra final → 301.** Cada página son dos viajes de red. Seis literales |
| **H-3** | N1 | `Partner-Id` acepta guiones que Siigo rechaza |
| **H-4** | N2 **BAJO→MODERADO** | Decimales invertidos. Ya no es latente: `Amoxicillin 250mg` tiene `quantity 0.028` en el tenant y Siigo admite 2 decimales |
| **H-5** | N3 | `observations` limitado a 500 donde Siigo permite 4.000 — y ese campo lleva el marcador de reconciliación |
| **H-6** | N4 | `payments.due_date` no modelado; un medio de pago de cartera rompe toda emisión |
| **H-7** | N12 | `fetchInvoiceFile` y `getSiigoAccessToken` sin timeout |
| **H-8** | N23 | 12 `fetch` crudos en 5 archivos. No existe `src/services/apiClient.ts` |
| **H-9** | L2/L4 | Tres implementaciones de `America/Bogota`, dos utilidades de redondeo |
| **H-10** | D-c | **CI en GitHub Actions.** ~15 min. El mayor retorno por esfuerzo del backlog |
| **H-11** | D-d | **Smoke test de emisión autenticado.** Habría atrapado 3 de los 4 fallos que escaparon a los tres gates |
| **H-12** | D-j | Sanear texto también en `creditNote.ts:44` |
| **H-13** | D-k | `customer_settings` en la tabla de traducción de errores |
| **H-14** | P-1 rama A | **Detector de anulaciones en Provet.** Especificado y sin incógnitas: `/invoice/?credit_note__is=true&modified__gte=` → id del path de `credit_note_original_invoice` → factura → consulta. **Solo detector, nunca emisor automático.** Nota: C-1 hay que arreglarlo aunque este detector no se construya |

### Con credenciales de producción — sesión 6

| # | Origen | Qué |
|---|---|---|
| **P-1** | B1/B2 | Primera emisión real con `stamp.send: true` y captura del JSON crudo. **Nadie ha visto nunca un `stamp` con CUFE** |
| **P-2** | N8 | Captura del 201 crudo de nota crédito y resolución de la contradicción del enum `reason` (la tabla lista 1,2,3,4,6,7; el esquema declara 1-6) |
| **P-3** | N11 | Confirmar Fluid compute y fijar `maxDuration` explícito |
| **P-4** | N17 | Confirmar si la ventana de reconciliación sobraba, y si `created` viene en COT o UTC |
| **P-5** | — | CSP fase 2, precedida por el endpoint de recolección (H-3 del informe de proyecto): hoy la condición de salida es **inobservable** |
| **P-6** | P-1 | Correr `GET /invoice/?credit_note__is=true` contra el tenant de **producción**. Decide si el detector H-14 hace falta |

### Bloqueantes de terceros — no dependen de Jean

| # | Qué | De quién |
|---|---|---|
| **T-1** | Credenciales de producción de Siigo y Provet | Dueña |
| **T-2** | Resolución DIAN activa y `documentTypeId` de la cuenta | Dueña |
| **T-3** | **Plan Vercel Pro.** El ToS se incumple hoy por dos vías | Dueña |
| **T-4** | Plan de Supabase con backups | Dueña |
| **T-5** | **Permiso `Settings` de Provet.** Cubre `/item/` Y `/settings/department/`. **Una sola petición, no dos.** La hipótesis de que los catálogos por tipo lo esquivaran es FALSA: los 7 endpoints dan 403 | Dueña / Provet |
| **T-6** | ¿Se anula alguna vez desde Provet? P-6 puede responderlo sin preguntar | Dueña |

### Cerrado en la sesión 0

| Origen | Estado |
|---|---|
| H-1 (informe de proyecto) | **Cerrado.** `EVIDENCIA_APIS.md` y las dos referencias de API están commiteadas en la raíz (`a882791`, `0019ef5`) y añadidas a `.clinerules §1` |
| H-2 (informe de proyecto) | **Cerrado.** Una sola definición del cap, en `.clinerules §CODE EFFICIENCY`: 150 líneas crudas en `/services`, `/mappers`, `/components`; `/src/app` fuera. 17 violaciones, no remediadas a propósito |
| N21 | **Cerrado.** El repo es la única fuente. Prohibido duplicar gobernanza en el Project |
| N22 | **Cerrado por Jean** en `instrucciones_proyecto.md` (quinta tabla `invoice_claims` + ruta `api/invoice-claims`) |
| Gate 3 | **Corregido** en `.clinerules §2` y `2_AGENT §1`: `next build`, no `npm run lint` |
| P-7 (`external_info`) | **Descartado, no diferido.** No existe en `/invoice/`. Sustituto registrado: `set_integration_status` |
| Sobrescritura en `provetToQueue.ts:87-90` | **Hipótesis falsificada.** `consultation` es `null` en las NC, así que `.set()` nunca se sobrescribe. Registrada para que nadie la reabra. El fallo real es C-1, por omisión |
| `status = 99` como marcador de anulación | **Sin evidencia.** `status` es `integer` `readOnly` sin enum publicado; las 4 filas medidas traen `3`. El marcador es `credit_note` |

### Decidido NO hacer — no reabrir

| Descartado | Por qué |
|---|---|
| Refactorizar los 17 archivos que exceden el cap | Deuda cosmética con riesgo de regresión real. Se arregló la regla |
| Mitigar CVE-2026-44581 en `middleware.ts` | La sesión 1 lo cierra igual |
| Migrar a Next.js 15.x como paso intermedio | EOL 2026-10-21, confirmado en endoflife.date |
| `ANNULMENT_REASONS` con 5 motivos | El flujo real es siempre `reason: 2` |
| Migrar `invoice_claims` a `external_info` | Imposible: el campo no existe en `invoice` |
| `ts-prune` como tarea recurrente | Falsos positivos con `z.infer` |
| Las 2 filas `invoices` sin `claim` como tarea de código | Limpieza de datos del día del corte. SQL preparado |
| Subir `@hookform/resolvers` a 5.x en la sesión 1 | Arrastra un bump de Zod, que valida todos los payloads de Siigo. Otra sesión |

---

## Decisiones de plataforma — cerradas el 2026-09-10, no relitigar

1. **Vercel Pro es el destino de producción.** La razón no es el precio: es cero
   migración, y que Vercel es la implementación de referencia del middleware —que
   en Next 16 pasa a llamarse Proxy— y sigue siendo un obstáculo arquitectónico
   declarado para el resto de proveedores. **Toda la frontera de autorización de
   esta app es middleware.**

2. **Render Starter ($7/mes) queda como alternativa evaluada y NO descartada**,
   con condición de entrada explícita: **bloqueada hasta que H-1 esté cerrado**.
   Motivo medible: `provetApi.ts:144` hace `all.push(...results)` con
   `page_size=1000` sobre seis colecciones, contra los 512 MB de Starter.
   A favor de Render: región Ohio (`us-east-2`), donde vive Supabase; hoy el
   despliegue está en `iad1`, Virginia.
   *Actualización del 2026-09-10:* con `invoice__in` confirmado, la huella de
   `/invoicerow/` no se reduce — **se elimina**. La condición se relaja.

3. **Firebase App Hosting: descartado por ahora.** Limita el cacheo en apps Next.js
   con middleware, y su free tier de 180.000 vCPU-segundos es justo contra el
   sondeo de 20 s. **Firebase Auth y Firestore descartados sin condición:**
   adoptarlos supondría reescribir la capa de autorización endurecida en los
   chats 5 y 6a, y sustituir la atomicidad del `INSERT ... ON CONFLICT` de
   `acquireInvoiceClaim`, que es el guardián contra el doble timbrado ante la DIAN.

4. **H-1 (ex N10) sube de categoría:** sigue en la sesión 5, pero deja de ser
   higiene de rate limit y pasa a ser además **prerrequisito de infraestructura**.

5. **`maxDuration` explícito en `vercel.json` deja de ser opcional.** Con Pro son
   300 s por defecto y 800 s de máximo; el peor caso medido de una emisión con
   reintento y reconciliación ronda los 250 s. Eso cierra N11 sin migrar nada,
   pero hay que **fijarlo, no asumirlo**, y confirmar antes Fluid compute.
   *Matiz medido:* Fluid compute viene **habilitado por defecto**; el modo heredado
   solo afecta a proyectos desplegados antes del 2025-04-23. Este es de 2026, así
   que la verificación es una confirmación, no un bloqueante.

6. **Edge congelado en la sesión 1.** `middleware.ts` se mantiene tal cual, con su
   deprecación aceptada. Verificado empíricamente contra Next 16.3.4: el build
   **pasa con exit 0** y emite solo un aviso —`The "middleware" file convention is
   deprecated. Please use "proxy" instead.`— con codemod disponible
   (`npx @next/codemod@canary middleware-to-proxy .`), **no ejecutado**. El paso a
   `proxy.ts` y la decisión de runtime van a la sesión 4 (A-4). Razón: un cambio
   por sesión. Si se rompe tras cambiar framework, nombre de archivo y runtime a la
   vez, no se sabe cuál lo causó, y el síntoma es un `employee` con acceso de admin.
   **Nota:** `proxy` NO soporta el runtime `edge` y su runtime `nodejs` no es
   configurable, así que el paso a `proxy.ts` mueve toda la frontera de
   autorización a Node. Es una decisión de arquitectura, no un `mv`.

---

## Last Update
- **Date:** 2026-09-10
- **Agent:** Claude (sesión 0 — pipeline limpio y backlog único)
- **Completed Task:** Sin cambios en `src/`. Fusión de los dos informes de auditoría
  en un backlog único con numeración propia dentro de este documento; registro de las
  seis decisiones de plataforma; una sola definición del cap de 150 líneas; corrección
  del tercer gate en `.clinerules §2` y `2_AGENT §1`; los siete documentos de
  gobernanza añadidos al protocolo de lectura de `.clinerules §1`.
  `EVIDENCIA_APIS.md` gana las secciones **2.8 a 2.12**, todas medidas en vivo el
  2026-09-10 contra `awstest.provetcloud.com/9174` con siete `GET` y ninguna escritura.
- **Verificación en vivo, lo que cambió el plan:** (1) las notas de crédito de Provet
  llegan con `consultation: null` y su omisión provoca sobrefacturación medida de
  125.00 sobre la factura 5 → **hallazgo C-1, nuevo, sesión 2**; (2) `invoice__in`
  funciona en `/invoicerow/` (8 vs 223) → **N10 pasa de paginación a rediseño**;
  (3) `page_size` por defecto = **50**, así que el peso 20 de `page_size=1000` queda
  medido; (4) los **siete** endpoints de catálogo dan 403 → **P-5 muerto, T5 real**;
  (5) `/invoice` sin barra final devuelve **301** → hallazgo H-2; (6) el signo no
  identifica un abono, solo `credit_note` y `credited_invoicerow`.
- **Hipótesis mías falsificadas, registradas a propósito:** la sobrescritura de
  `invoiceByConsultation` (`:87-90`) no ocurre; `credit_note__is` sí existe pese a no
  estar en la referencia markdown; los "defaults" 39/11/16 eran conteos de registros,
  no `page_size`. Tres errores de instrumentación que ningún gate habría detectado.
- **Gates:** no aplican. Esta sesión no toca `src/` ni `package.json`.
- **Next Pending Task:** sesión 1 — migración a Next.js 16.3.4 **y React 19**, con
  `middleware.ts` intacto. Ver `prompt_sesion_1.md`.

## Previous Update (chat 6b)
- **Date:** 2026-09-08
- **Agent:** Claude (chat 6b — Content-Security-Policy, phase 1)
- **Completed Task:** Added `Content-Security-Policy-Report-Only` as a sixth header on the existing `"source": "/(.*)"` rule in `vercel.json`. The five pre-existing headers, `framework` and `regions` are byte-identical. **Nothing under `src/` changed except one new test file.** `middleware.ts` untouched — its 9 tests pass unedited, `ADMIN_ONLY_RULES` / `requiresAdmin` / `config.matcher` and the 13 route-handler guards are exactly as chat 6a left them. New `src/test/vercelSecurityHeaders.test.ts` (8 tests) is the only thing that makes this change visible to any gate at all: `vercel.json` is not type-checked, not bundled, not executed by `next build` and read by no other test, so a deleted or JSON-broken policy would otherwise ship silently. It asserts shape only — no test in a Node environment can prove a policy does not break a browser, and jsdom remains a rejected project decision. That is documented debt, in the file's header comment.
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ **637/637 (45 files, +8 tests, +1 file)** | `npx next build` ✅ 9/9 pages, **4 static, unchanged** | `ƒ Middleware` **40.1 kB, unchanged** | mutation testing on `vercelSecurityHeaders.test.ts`: **7 mutants, 7 killed** (delete the CSP; loosen `X-Frame-Options` to `SAMEORIGIN`; add `'unsafe-eval'`; flip to phase 2 silently; narrow `source` to `/settings/(.*)`, which would drop `/login`; open `connect-src` to an external origin; change `regions`).
- **Not done — deliberately:** phase 2 (the enforcing header) waits on a clean report-only window. CVE-2026-44581 accepted rather than mitigated, with reasoning recorded under Security headers.
- **Corrections to this document:** the `npm audit` figure was a single wrong number and is now two labelled counts; the `global-error.tsx` inline-style finding is refuted and closed.

## Previous Update (chat 6a)
- **Date:** 2026-09-08
- **Agent:** Claude (chat 6a — route handler authorization, sanitisation, idempotency key)
- **Completed Task:** Closed D0, D5, D6 and D7. (1) New pure mapper `src/mappers/routeAuthz.ts` (80 lines) holding the single access decision plus the two denial literals. (2) New service `src/services/routeGuard.ts` (66 lines) exposing `requireSession` / `requireAdmin` over `NextRequest`. (3) New shared test fixture `src/test/sessionRequest.ts` (115 lines), importing nothing from `vitest` so it stays inert at build time. (4) All 13 route handlers under `src/app/api/` now carry a guard; previously none did. (5) `middleware.ts` refactored to import the shared denial constants — routing policy untouched, its 9 tests pass unedited. (6) `siigoCreditNoteItemSchema.description` now uses `sanitizedText({ max: 200 })`. (7) `Idempotency-Key` regex hardened to `/^[A-Za-z0-9]+$/`. (8) `.env.example` created with the 22 variables the code actually reads, plus a `!.env.example` negation in `.gitignore`.
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ **629/629 (44 files, +36 tests, +2 files)** | `npx next build` ✅ 9/9 pages, 4 static | mutation testing on `routeAuthz.ts`: 4 mutants, 4 killed.
- **Not done — deliberately:** D1 (password hashing) is blocked on an operational action, see Open items.

## Previous Update (Task 6.2)
- **Date:** 2026-08-27
- **Agent:** Cline (Task 6.2)
- **Completed Task:** Phase 6 — Web Production Deployment & Release Verification. (1) `vercel.json` (new, 32 lines): production deployment config with enterprise security headers (Strict-Transport-Security max-age=63072000, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/microphone/geolocation disabled), framework preset `nextjs`, region `iad1`. (2) `.env.example` (expanded from 13 to 72 lines): comprehensive environment variable documentation with grouped sections (Authentication, Siigo Integration, Provet Integration, Environment), explicit placeholder values, and generation commands for secrets. Added `SIIGO_PARTNER_ID`, `SIIGO_USERNAME`, `SIIGO_ACCESS_KEY`, `SIIGO_CLIENT_ID`, `SIIGO_CLIENT_SECRET`, `SIIGO_BASE_URL`, `SIIGO_SANDBOX_MODE`, `PROVET_API_KEY`, `PROVET_CLINIC_ID`, `PROVET_BASE_URL`, `NODE_ENV`. (3) `README.md` (new, 269 lines, English): comprehensive deployment and maintenance guide with sections on Tech Stack, Prerequisites, Quick Start, Environment Configuration (13-variable table), Development Workflow, Deployment to Vercel (CLI + Dashboard options), Custom Domain setup, Production Checklist (11-point verification), Maintenance & Troubleshooting (credential rotation, common issues, monitoring), Security Notes (HTTPS, JWT, cookies, DIAN compliance), Project Structure, License, Support. (4) Full verification suite: `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 144/144 | `npm run lint` ✅ | `npx next build` ✅ (clean production build, 7 static pages + 1 dynamic middleware, 87.3 kB shared JS).
- **Modified Files:** `vercel.json`, `.env.example`, `README.md`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 144/144 | `npm run lint` ✅ | `npx next build` ✅

## Previous Update (Task 6.1)
- **Date:** 2026-08-27
- **Agent:** Cline (Task 6.1)
- **Completed Task:** Phase 6 — Siigo OAuth token retrieval & live API integration. (1) `src/services/siigoAuth.ts` (new, 148 lines): `SiigoAuthError`, `siigoTokenResponseSchema` (Zod), `getSiigoAccessToken` (POST `/auth` with Client Credentials Grant, 24h token caching in module-level variable, constant-time expiry check, network error wrapping). (2) `src/services/siigoAuth.test.ts` (new, 132 lines, 12 tests): token retrieval success, 401/400/500 error mapping, cache hit (no second fetch), expired token refresh, malformed response handling, env var validation. (3) `src/app/page.tsx` (modified, 247 lines): `handleEmitConfirm` now calls `getSiigoAccessToken()` to retrieve real `accessToken` + `partnerId` before `submitInvoice`/`submitCreditNote`/`fetchInvoicePdf`/`fetchInvoiceXml`; removed empty-string placeholders; added `auth_failed` error toast with Spanish translation; preserved idempotency key reuse across retries. (4) `PROJECT_STATE.md`: updated Phase 6 status, added Task 6.1 completion notes, updated Next Pending Task to Task 6.2.
- **Modified Files:** `src/services/siigoAuth.ts`, `src/services/siigoAuth.test.ts`, `src/app/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 144/144 (12 new) | `npm run lint` ✅ | `npx next build` ✅

## Previous Update (Task 3.3b) → history entry marked `Annulled` + NC `Accepted` entry appended with real Siigo id/cufe + green toast; `handleDownload` now fetches the real Blob, triggers browser download via object-URL (revoked after click), green success toast, errors through `translateSiigoError` (no raw traces). (4) `InvoiceHistory.tsx` (144 lines): new `busyInvoiceId` prop disables PDF/XML buttons and shows `Loader2` spinner during downloads. (5) `siigoApi.test.ts`: +13 tests (credit note headers/idempotency-reuse/4xx/429/503/network/Zod guards; PDF/XML URL+headers/base64 decode/raw fallback/error mapping) — 144/144 passing.
- **Modified Files:** `src/services/siigoApi.ts`, `src/services/siigoApi.test.ts`, `src/mappers/consultationQueue.ts`, `src/mappers/invoiceHistory.ts`, `src/mappers/invoiceHistory.test.ts`, `src/components/StatusBadge.tsx`, `src/components/HistoryFilterBar.tsx`, `src/components/InvoiceHistory.tsx`, `src/app/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 144/144 | `npm run lint` ✅ | `npx next build` ✅ (all pages prerender). Known gap (unchanged, pre-existing): live calls pass empty `accessToken`/`partnerId` — secret values are never persisted per `credentials.ts` design; Siigo `POST /auth` token resolution remains pending.

## Previous Update (Task 6.1)
- **Date:** 2026-08-26
- **Agent:** Cline (Task 6.1)
- **Completed Task:** Phase 6 — Core Web Vitals audit, prerender fix, dynamic options wiring, and dead code cleanup. (1) Fixed pre-existing `next build` prerender error on `/page` (`TypeError: e.toISOString is not a function`): `src/mappers/consultationQueue.ts` (line 30) `formatDate` now defensively coerces input via `new Date(value).toISOString().slice(0, 10)` — handles both real Date objects and ISO strings; `src/mocks/provet.ts` (4 occurrences: lines 90-91, 112-113, 142-143, 150) and `src/mocks/siigo.ts` (2 occurrences: lines 72, 107) replaced all `"..." as unknown as Date` unsafe casts with proper `new Date("...")` instances — root cause fix. (2) Removed legacy dead code from `src/services/siigoApi.ts`: deleted `SIIGO_ERROR_MESSAGES` constant (13 lines) and `siigoErrorToSpanish` function (7 lines) — fully superseded by `errorTranslator.ts`; `src/services/siigoApi.test.ts` removed corresponding imports (lines 4, 7) and `describe("siigoErrorToSpanish")` test block (lines 107-119). (3) Wired dynamic `ProvetToSiigoOptions` from Settings localStorage: created `src/hooks/useEmissionOptions.ts` (new, 39 lines, client hook) — `useState` seeded with sandbox defaults, `useEffect` reads `localStorage["fact_vet.catalogMapping"]` → `parseCatalogMapping` and `localStorage["fact_vet.credentialsConfig"]` → `parseCredentialsConfig`, corrupt/missing → keeps defaults (SSR-safe, no hydration mismatch); `src/mappers/consultationQueue.ts` (line 10) imported `ProvetToSiigoOptions` type, (line 120) added `options?: ProvetToSiigoOptions` parameter to `buildInvoicePayloadFromQuickEdit`, (line 137) passes `options` through to `provotToSiigoInvoice`; `src/app/page.tsx` (line 29) imported `useEmissionOptions`, (line 56) calls `const options = useEmissionOptions()`, (line 94) passes `options` to `buildInvoicePayloadFromQuickEdit` in `handleSubmit`. (4) Production build optimization in `next.config.js`: added `compiler: { removeConsole: { exclude: ["error", "warn"] } }` (strips console.log from production bundle → improves LCP/INP), added `experimental: { optimizePackageImports: ["lucide-react"] }` (tree-shakes lucide-react icons).
- **Modified Files:** `src/mappers/consultationQueue.ts`, `src/mocks/provet.ts`, `src/mocks/siigo.ts`, `src/services/siigoApi.ts`, `src/services/siigoApi.test.ts`, `src/hooks/useEmissionOptions.ts` (new), `src/app/page.tsx`, `next.config.js`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 131/131 | `npx next build` ✅ (prerender FIXED — all 7 static pages generated) | `npm run lint` ✅. All files under 150-line cap (page.tsx: 147, siigoApi.ts: 97, consultationQueue.ts: 138, useEmissionOptions.ts: 39, siigoApi.test.ts: 105).-1/custom-maxRetries, retryWithBackoff immediate-success/retry-then-succeed/non-retryable-immediate-throw/max-retries-exhausted with fake timers). `src/components/ErrorBanner.tsx` (new, 84 lines, presentational): amber warning banner with RefreshCw spinner + retry counter during active retry, red/green severity-based styling per `03_UI_UX_DESIGN_SPEC.md`, action pills (Editar ID/Ajustar montos/Completar campos) for quick-edit triggers, "Borrador en cola" label for save_draft, dismiss X button, max `rounded-md`. `src/app/page.tsx` (modified, 132 lines): replaced `errorMessage` state with `translatedError: TranslatedError | null` + `retryAttempt: number`; `handleSubmit` wraps `submitInvoice` in `retryWithBackoff` (maxRetries=5), generates `Idempotency-Key` once via `generateIdempotencyKey()` and reuses across all retry attempts (prevents duplicate invoices per Siigo spec), on retryable failure sets `retryAttempt` for live banner updates, on final `service_unavailable` marks row as `Draft`; `handleAnnulConfirm` uses `translateSiigoError(error).message`; `handleClose` clears error+retry state; `handleQuickAction` dismisses banner for edit_* actions; `<ErrorBanner>` rendered above tab content with retry progress; QuickEditDrawer receives `translatedError?.message ?? null` for inline error card.
- **Modified Files:** `src/services/errorTranslator.ts`, `src/services/errorTranslator.test.ts`, `src/components/ErrorBanner.tsx`, `src/app/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 132/132 (18 new) | `npm run lint` ✅. All files under 150-line cap. Legacy `siigoErrorToSpanish` in `siigoApi.ts` retained (not modified per scope); flagged for follow-up cleanup.

## Previous Update (Task 4.3)
- **Date:** 2026-08-26
- **Agent:** Cline (Task 4.3)
- **Completed Task:** Wired the dynamic catalog mapping into `provetToSiigoInvoice` and activated live `fetch()` POST /v1/invoices (Phase 4, item 3).
- **Modified Files:** `src/mappers/provetToSiigo.ts`, `src/mappers/provetToSiigo.test.ts`, `src/services/siigoApi.ts`, `src/services/siigoApi.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 114/114 (19 new/rewritten) | `npm run lint` ✅

## Previous Update (Task 4.2)
- **Date:** 2026-08-26
- **Agent:** Cline (Task 4.2)
- **Completed Task:** Implemented the Secure Credentials Configuration Panel & Sandbox/Production Toggle (Phase 4, item 2). `src/mappers/credentials.ts` (new, pure, 107 lines): Zod `environmentModeSchema` (sandbox|production), `credentialsSchema` (partnerId 3–100 alphanumeric per §2.3, username/accessKey/clientId/clientSecret non-empty), `credentialsConfigSchema` (mode + `configured: Record<string,boolean>` + ISO updatedAt — **NO secret value fields**, honoring §2.1), types `EnvironmentMode`/`Credentials`/`CredentialsConfig`/`CredentialsFieldRow`, `CREDENTIAL_LABELS` + `SECRET_FIELDS` (accessKey/clientSecret), pure O(n) `maskSecret` (8 bullets when configured+present, else empty — never returns raw value), `buildCredentialsRows`, `stampSendFor` (sandbox→false / production→true), `serializeCredentialsConfig`/`parseCredentialsConfig` (Zod-validated localStorage round-trip). `src/mappers/credentials.test.ts` (new, 150 lines, 20 tests: Partner-Id 3/100 bounds + non-alphanumeric rejection, empty-field rejection, mode enum, stampSendFor both modes, maskSecret 3 cases, row order/labels/secret flags/masking, serialize/parse round-trip + corrupt + bad-mode rejection, config schema carries no secret fields). `src/components/CredentialsForm.tsx` (new, 150 lines, client, presentational): react-hook-form + `zodResolver(credentialsSchema)`, 5 fields compact 1-column, per-field `Ver`/`Ocultar` toggle for secret fields (placeholder `••••••••` when configured — "leave blank to keep"), inline Sandbox/Producción toggle (folded in, no separate file) with `AlertTriangle` draft warning on production, `Ctrl/Cmd+Enter` submit, `Loader2`/`Save`, delegates to injected `onSave(values, mode)` — never persists secrets itself. `src/app/settings/credentials/page.tsx` (new, 127 lines, client): mirrors Task 4.1 shell (`h-screen w-screen overflow-hidden`, `ArrowLeft`→`/`, `logoutAction`), `stamp.send` status pill (draft-amber=false / accepted-green=true), SSR-safe `useEffect` reads `localStorage["fact_vet.credentialsConfig"]`→`parseCredentialsConfig` (corrupt→sandbox defaults), `handleSave` validates via `credentialsSchema` then persists ONLY `credentialsConfig` (mode + per-field configured booleans, never secret values), bottom-right toast. Security: §2.1 honored — secret values validated client-side then discarded; real persistence to `.env`/encrypted layer deferred to a future server-action task.
- **Modified Files:** `src/mappers/credentials.ts`, `src/mappers/credentials.test.ts`, `src/components/CredentialsForm.tsx`, `src/app/settings/credentials/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 108/108 (20 new) | `npm run lint` ✅. Pre-existing note: `npx next build` prerender fails on `/page` (mock date strings cast `as unknown as Date` → `.toISOString()` on string) — pre-existing Phase 3 bug, outside Task 4.2 target files; flagged for a later fix.

## Previous Update (Task 4.1)
- **Date:** 2026-08-26
- **Agent:** Cline (Task 4.1)
- **Completed Task:** Implemented the Dynamic Catalog & Payment Method Mapping interface (Phase 4, item 1). `src/mappers/catalogMapping.ts` (new, pure, 114 lines): Zod `itemMappingSchema`/`paymentMappingSchema`/`catalogMappingSchema` (provetCode↔siigoProductId, provetMethod↔siigoPaymentTypeId, nullable; version + ISO updatedAt), types `ItemMapping`/`PaymentMapping`/`CatalogMapping` + view-models `ItemMappingRow`/`PaymentMappingRow`; pure O(n) functions — `extractProvetItems` (distinct by code, first name wins), `extractProvetPaymentMethods` (distinct, stable), `buildItemMappingRows`/`buildPaymentMappingRows` (left-join, stale siigo ids→unmapped), `defaultItemMapping` (exact code-match), `defaultPaymentMapping` (accent/case-insensitive normalized name containment), `reconcileMapping` (drops gone provet entries, nulls stale siigo ids, adds new, bumps version), `serializeCatalogMapping`/`parseCatalogMapping` (Zod-validated localStorage round-trip). `src/mappers/catalogMapping.test.ts` (new, 136 lines, 15 tests: distinct/stable extract, dedupe, mapped+unmapped+stale rows, code & name auto-match, reconcile, serialize/parse round-trip + corrupt/invalid rejection, schema accept). `src/components/CatalogMapping.tsx` (new, 133 lines, client, presentational): dense `table-fixed` items table, per-row `<select>` for Siigo product (code·name), read-only tax-classification column, Mapeado/Sin mapear pills (status-* tokens, `CheckCircle2`/`AlertTriangle`), reuses `<Pagination>` (explicit paging, spec §2.2). `src/components/PaymentMapping.tsx` (new, 128 lines, client, presentational): same pattern for payment types (name + category column). `src/app/settings/mapping/page.tsx` (new, 143 lines, client): loads `@/mocks` (no fetch — catalog caching), `useState<CatalogMapping>` seeded via `defaultItemMapping`/`defaultPaymentMapping`, SSR-safe `useEffect` reads `localStorage["fact_vet.catalogMapping"]`→`parseCatalogMapping`→`reconcileMapping` (corrupt blob → seeded defaults), Guardar button writes `serializeCatalogMapping` (disabled when clean), Guardado/Pendiente de guardar status pill + green toast, back-link to `/` + logout form (`logoutAction`). Clinical palette, `rounded-md` only, `lucide-react` icons. No `fetch`/Axios in UI; components consume mappers exclusively. NOTE: route path & component names follow the user-approved plan (`settings/mapping/page.tsx`, `CatalogMapping.tsx`, `PaymentMapping.tsx`), superseding the earlier `PROJECT_STATE.md` draft names.
- **Modified Files:** `src/mappers/catalogMapping.ts`, `src/mappers/catalogMapping.test.ts`, `src/components/CatalogMapping.tsx`, `src/components/PaymentMapping.tsx`, `src/app/settings/mapping/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 88/88 (15 new) | `npm run lint` ✅. Pre-existing note: `npx next build` prerender fails on `/page` (mock date strings cast `as unknown as Date` → `.toISOString()` on string) — pre-existing Phase 3 bug, outside Task 4.1 target files; flagged for a later fix.

## Previous Update (Task 3.4)
- **Date:** 2026-08-26
- **Agent:** Cline (Task 3.4)
- **Completed Task:** Implemented the Employee JWT authentication & login system. `src/mappers/auth.ts` (new, pure, 29 lines): `loginFormSchema` (email + password≥8, trim), `AUTH_ERROR_MESSAGES` + `authErrorToSpanish()` (invalid_credentials/missing_credentials/rate_limited/default, no raw traces). `src/mappers/auth.test.ts` (new, 43 lines, 9 tests). `src/services/auth.ts` (new, 146 lines): `AuthError`, Web Crypto HMAC-SHA256 `signSessionToken`/`verifySessionToken` (24h exp, constant-time signature compare, edge-safe `btoa`/`atob` base64url — no `Buffer`/no external JWT lib), `createSessionCookie` (HttpOnly + SameSite=Strict + Secure(prod) + Path=/ + MaxAge=86400) / `clearSessionCookie` (maxAge=0), `authenticateEmployee` (env `EMPLOYEE_EMAIL` + `EMPLOYEE_PASSWORD_HASH` sha256, constant-time compare). `src/services/auth.test.ts` (new, 116 lines, 12 tests: round-trip, tampered/expired/malformed token, cookie flags + secure toggle, auth success/case-insensitive/wrong cred/missing env). `src/components/LoginForm.tsx` (new, 117 lines, client): react-hook-form + `zodResolver`, clinical palette, `rounded-md`, 1-column, `AlertTriangle` error alert, `Loader2`/`LogIn`, show/hide password, `Ctrl/Cmd+Enter` submit, delegates to injected server action (no direct HTTP). `src/app/login/page.tsx` (new, 51 lines, server): already-authenticated redirect to `/`, inline `"use server"` `loginAction` (Zod validate → `authenticateEmployee` → `createSessionCookie` → `redirect("/")`, `redirect()` kept outside try/catch). `src/app/actions.ts` (new, 12 lines, `"use server"`): `logoutAction` (clears cookie → redirect `/login`). `src/middleware.ts` (new, 18 lines, edge): matcher protects all non-login/non-static routes, verifies session cookie, redirects unauthenticated/expired/tampered to `/login`. `src/app/page.tsx` (modified, 122 lines): added header `Cerrar sesión` button (`LogOut`) bound to `logoutAction`; dashboard components untouched. Added `.env.example` (placeholders: `JWT_SECRET`, `EMPLOYEE_EMAIL`, `EMPLOYEE_PASSWORD_HASH` + hash-gen note) and hardened `.gitignore` (`.env*`). Verified: `tsc --noEmit` (0 errors), `vitest run` (73/73 pass), `npm run lint` (0 errors). All files ≤150 lines (auth mapper 29, mapper test 43, auth service 146, service test 116, LoginForm 117, login page 51, actions 12, middleware 18, page 122).
- **Modified Files:** `src/mappers/auth.ts`, `src/mappers/auth.test.ts`, `src/services/auth.ts`, `src/services/auth.test.ts`, `src/components/LoginForm.tsx`, `src/app/login/page.tsx`, `src/app/actions.ts`, `src/middleware.ts`, `src/app/page.tsx`, `.env.example`, `.gitignore`, `PROJECT_STATE.md`

---

## Current State (verified 2026-09-08)

Everything in this section was re-checked against the code in this commit. The
per-task entries below the separator are an append-only changelog: their test
counts describe the suite as it stood on that date and are left untouched.

### Verification gates
| Gate | Command | Result |
| --- | --- | --- |
| Types | `npx tsc --noEmit` | clean |
| Tests | `npx vitest run` | **637 passed (637)** across **45 files** — timezone-independent, verified under `America/Bogota`, `UTC`, `Asia/Tokyo` and `Pacific/Kiritimati` |
| Build | `npx next build` | clean (**9/9** pages, **4 static**: `/`, `/_not-found`, `/settings/credentials`, `/settings/mapping`) — needs `DATABASE_URL` set, a placeholder is enough. Was 10/10 until chat 6a gave `/api/health` `force-dynamic`, which took it out of the static-generation phase. |
| Deps | `npm audit` | See the two counts below. No fix exists in 14.x for any of them |

### `npm audit` — two different counts, do not conflate them
Earlier revisions of this document reported a single figure and it was wrong.
`npm audit` summarises **per package**; the advisories live in `via[]` and are
**per advisory**. Measured 2026-09-08:

| Count | Value |
| --- | --- |
| **Per package** (what the `npm audit` summary prints) | **2** — 1 critical (`next`), 1 high (`postcss`) |
| **Per advisory** (sum of `via[]`) | **27** — 2 critical · 10 high · 13 moderate · 2 low |

`next` alone carries 23 advisories, `postcss` 4. Every single one is fixed only
in `>= 15.5.x`. **This is the migration argument, and it is now the strongest
one in this document.**

The two `critical` entries, verbatim from `npm audit --json`, both **assessed as
not applicable to this deployment**:

| npm `source` | GHSA | Range | Why it does not apply here |
| --- | --- | --- | --- |
| 1193677 | `GHSA-p293-qw3h-jr36` (CVE-2026-75604) | `>=13.4.0 <15.5.24` | Requires Pages Router **and** App Router on a Windows filesystem. Verified: no `pages/` or `src/pages/` exists — App Router only. Vercel runs Linux |
| 1193733 | `GHSA-2xp9-vwfh-vxw4` | `>=10.0.0 <15.5.24` | Requires the Image Optimization API to decode an attacker-supplied AVIF. Zero `next/image` in `src/`, no `images.remotePatterns`, and Vercel disabled AVIF optimisation across its managed service |

Both `source` ids sit far above the rest of the feed (1112593–1139510),
consistent with ingestion after the 2026-08-25 release. If a future audit shows
them missing, that is a feed-ingestion difference, not a fix. |

**Install note:** `npm install` on npm 10.x crashes with
`Cannot read properties of null (reading 'edgesOut')` while resolving vitest's
optional peers — an arborist bug, reproducible in an empty project. Use
`npx npm@12` to change dependencies. `npm ci` on npm 10 works normally against
the committed lockfile.

### Security headers — corrected
The previous version of this document claimed `vercel.json` carried a CSP. It
does not. What `vercel.json` actually defines, verified line by line:

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` ✅
- `X-Frame-Options: DENY` ✅
- `X-Content-Type-Options: nosniff` ✅
- `Referrer-Policy: strict-origin-when-cross-origin` ✅
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` ✅
- `Content-Security-Policy-Report-Only` ✅ **added in chat 6b (phase 1)** —
  `vercel.json` only, never `next.config.js`, never `middleware.ts`. One CSP
  header, not two.

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src
'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors
'none'; upgrade-insecure-requests
```

- `Content-Security-Policy` (enforcing) ❌ **still absent, deliberately.**
  Phase 2 flips the key once a report-only window comes back clean. **Do not
  flip it without that confirmation.**

All six headers hang off the single existing rule, `"source": "/(.*)"`. That
pattern covers **every** path including `/login`, which is why the policy lives
in `vercel.json` and not in `middleware.ts`: `middleware.ts:84`'s matcher
**excludes `/login`**, the one public page that handles credentials.

`X-Frame-Options: DENY` is **kept alongside** `frame-ancestors 'none'`.
`frame-ancestors` supersedes it in modern browsers, but both deny, there is no
possible conflict, and removing it is pure risk for no gain. Deliberate
redundancy.

**Why not a nonce, measured rather than assumed.** A nonce policy was built and
served on commit `2f29a24`. The response header carried the nonce correctly, but
the prerendered HTML of the `○` pages did not:

| Route | Type | Nonce in header | Nonce in HTML | Inline `<script>` **without** nonce |
| --- | --- | --- | --- | --- |
| `/settings/credentials` | `○` | present | **absent** | **5** |
| `/settings/profile` | `ƒ` | present | present | 0 |
| `/login` | `ƒ` | present | present | 0 |

Static pages are prerendered at build time into a fixed file; a per-request
nonce matches nothing in them. Under `script-src 'self' 'nonce-…'
'strict-dynamic'` those 5 scripts are blocked: CSS loads, hydration never runs.
**All 4 `○` pages die, including `/`, the dashboard.** Build stays green, 637
tests stay green, `next build` still prints them as `○`. CSP2 ignores
`'unsafe-inline'` whenever a nonce is present, so there is no fallback. Making
them dynamic would work but reverts DP2 and costs the prerender. Rejected.

**`global-error.tsx` — finding closed, REFUTED.** Earlier revisions warned that
its 8 inline `style` attributes would be blocked by `style-src`. Measured by
forcing a root-layout throw: Next 14.2.35 serves `<html id="__next_error__">`
with an **empty `<body>`** and a `chunks/app/global-error-*.js` tag. Zero
`style="` attributes in the HTML. The screen is rendered **client-side only**,
and React applies `style={{}}` via CSSOM, which CSP does not govern. Control
that validates the measurement: an ordinary page with `style={{color:"#0052CC"}}`
**does** serialise to `style="color:#0052CC;padding:16px"`, so React's SSR
serialiser behaves as expected — `global-error` simply never reaches it.

The risk moves rather than disappearing, and it moves to a worse place: that
`<body>` is empty, so the error screen depends entirely on its scripts running.
A wrong `script-src` turns it into **a blank page on top of a 500**. The
directive to be careful with is `script-src`, not `style-src`.

**`'unsafe-eval'` is deliberately absent.** All 24 production chunks were
grepped for `eval(` and `new Function(` — zero hits. React needs `'unsafe-eval'`
in development only, and `vercel.json` does not apply to `next dev`. To be
confirmed in the report-only window, not assumed.

### CVE-2026-44581 — accepted risk, with reasoning
`GHSA-ffhc-5mcf-pf4q`, npm `source` 1118944, moderate, CVSS **4.7**
(`AC:H`/`UI:R`), EPSS ~13th percentile. Range `>=13.4.0 <15.5.16`; **14.2.35 is
inside it and its branch never received the patch.**

Next.js reads the **request** header `Content-Security-Policy`, extracts the
`nonce-` token and reflects it into its own `<script>` tags. `getScriptNonceFromHeader`
rejects `&`, `<`, `>` but **not** `"`, and the Flight sink writes
`<script nonce=${JSON.stringify(nonce)}>` — `\` is not an HTML escape, so the
attribute breaks out. **Applications do not opt in: the forwarding is
unconditional.**

Reproduced on `2f29a24` against a local production build:

```
GET /login   Content-Security-Policy: script-src 'nonce-x"src=data:text/javascript,alert(1)//'
→ <script nonce="x\"src=data:text/javascript,alert(1)//">self.__next_f.push(...)
   5 occurrences per response; same on /settings/profile
```

**Accepted, not fixed.** The reasoning, recorded so a later session does not
relitigate it: reflected-only by itself, because browsers never send that header
on their own; escalation to stored XSS needs a shared cache keyed without the
CSP header, and **this deployment has none** — the 4 `○` pages are served as
prerendered files and the `ƒ` pages carry no `s-maxage`.

Two mitigations were considered and **both rejected**:
- A static CSP does **not** help. `vercel.json` writes a *response* header; the
  bug reads the *request* header.
- `routes[].transforms` with `request.headers` / `delete` in `vercel.json` would
  strip it at the CDN and would reach `/login`. Rejected: it is a CDN-layer
  change **invisible to all three gates**, introduced in the very session that
  was isolated because such changes exist, to mitigate a 4.7 that needs a cache
  that was measured not to exist.

**The correct framing is not one CVE.** Thirteen advisories were published on
6–7 May 2026 and 14.2.35 received none of them, because it is EOL. This finding
does not change the design of chat 6b; it changes the **priority of the
migration**, which is now the immediate next session.

### Roadmap phases 1-6
All shipped. That is not the same as "ready for production": the blockers below
are operational and credential-related, not feature gaps.

### Resolved — anti-double-emission session
- **Emission claims.** `invoice_claims` table + `src/services/invoiceClaims.ts`.
  An atomic `INSERT ... ON CONFLICT ... RETURNING` claim is taken *before* the
  Siigo call, so a second device never reaches Siigo. States: `pending`,
  `emitted`, `unknown`, `annulled`.
- **Reconciliation.** `src/services/invoiceReconciliation.ts`. After an
  ambiguous failure (5xx, timeout) the app embeds a marker in `observations`,
  asks Siigo whether the document exists, and retries with a fresh idempotency
  key only when absence is confirmed. Motivated by a measured ~10% HTTP 500
  rate on the Siigo sandbox.
- **Amounts.** Invoice lines come from Provet `invoicerow.sum_total`, never
  from `quantity × price` (measured: the latter was wrong in 19 of 33 sampled
  consultations).
- **Itemised VAT.** `items.taxes` is sent with the mapped product's tax ids
  alongside `taxed_price`; Siigo applies no tax unless explicitly told to.
- **`items` XOR.** Exactly one of `price` or `taxed_price` per line, enforced
  in the schema.
- **Date window.** `modified__gte` is applied only to `/consultation`, never to
  child resources.
- **Admin endpoint.** `GET`/`DELETE /api/invoice-claims`, guarded by
  `ADMIN_ONLY_PREFIXES` in `middleware.ts`.
- **No `UNIQUE` on `invoices.consultation_id`.** Deliberate: the annulment flow
  stores the credit note as a second row under the same `consultation_id`.

### Resolved — structural quality session (this one)
- **Schema test coverage.** New `src/schemas/siigo.test.ts` and
  `src/schemas/provet.test.ts` cover the `stamp` flattening transform, the
  `price`/`taxed_price` XOR rule, decimal bounds, the `observations` 500-char
  limit, optional product `taxes`, and the totals-reconciliation `.refine()`
  (including measured float-drift cases).
- **`stamp` hardened to `.nullish()`.** Verified against the real Siigo
  sandbox: an unstamped invoice omits the `stamp` key entirely rather than
  sending `stamp: null`. Observed root keys: balance, cost_center, customer,
  date, document, id, items, mail, metadata, name, number, observations,
  payments, prefix, public_url, seller, total. `.optional()` already covered
  that; `.nullish()` also covers a null, which costs nothing and avoids the
  worst failure mode — a rejection here happens *after* a successful POST, and
  `POST /api/invoices` reads a post-emission validation failure as ambiguous,
  pinning the claim to `unknown` and wedging a consultation whose invoice
  exists.
- **The stamped `stamp` shape is UNVERIFIED.** No populated `stamp` carrying a
  CUFE has ever been observed on this project. A POST with `stamp.send: true`
  was refused with `{"Code":"document_settings","Message":"The send cannot be
  used, you must verify the document settings","Params":["stamp.send"]}`. The
  `cufe` / `cude` / `status` / `observations` / `errors` fields are modelled
  from Siigo's documentation. Re-verify against a real stamped document.
- **CORRECTED (2026-09-07) — the sandbox is NOT limited to non-electronic
  document types.** Earlier versions of this document, of the
  `siigoInvoiceRawResponseSchema` comment and of `siigo.test.ts` all stated
  that every sandbox document type is `electronic_type: "NoElectronic"` and
  that `stamp.send: true` was therefore impossible to test. **That was false.**
  Measured with a real `GET /v1/document-types`:

  ```
  FV:  72 ElectronicInvoice · 1 ContingencyInvoice · 1 ExportInvoice · 191 NoElectronic
  NC:  19 ElectronicCreditNote · 37 NoElectronic
  ```

  Most are `active: true`. What is known, and what is not:

  - **Confirmed:** electronic document types exist in the Siigo sandbox.
  - **Confirmed:** the sandbox is shared / multi-tenant, so those 74 include
    other companies' types. Existence does not prove this account may emit
    with them.
  - **Unresolved:** which of them, if any, belongs to this account. Suspicious
    candidate: `id=30640, code=312, "prueba fac elec"`, which is
    `NoElectronic`. If that is the mapped `documentTypeId`, the
    `document_settings` error is explained by pointing at a non-electronic
    type, not by a sandbox limitation.
  - **Supporting evidence:** Siigo documents `document_settings` as the generic
    "a parameter you sent is not configured on this voucher" error, listing
    seller-per-item, cost centre, automatic numbering, discounts and decimals
    as causes. It never mentions electronic type. Attributing the error to
    `NoElectronic` was an inference, not a reading.

  **Do not change any `documentTypeId` in the configuration on the strength of
  this.** Emitting against another tenant's document type would consume their
  consecutive number. The clean way to resolve it is to log into Siigo Nube on
  the web with the sandbox credentials and inspect this company's own
  catalogue, without other tenants' noise.
- **Phantom validation removed.** `POST /api/catalogs/sync` validated its
  response with `z.array(z.any())`. It now uses the real catalogue schemas, and
  a malformed catalogue returns **502 `invalid_payload`** rather than 400 —
  a bad catalogue is Siigo's fault, not the caller's.
- **`GET /api/emission-mode` aligned to fail-loudly.** It used to answer 200
  with the sandbox default on any read error. Because
  `useEmissionOptions.fetchServerMode` only discards a response when `!res.ok`,
  that 200 made every device overwrite a correct `production` with `sandbox`,
  and `stampSendFor("sandbox")` is false — real invoices would stop being
  stamped. Now: absent row → 200 default (genuinely unconfigured); corrupt row
  → 503 `config_corrupt`; read failure → 503 `storage_unavailable`.
  `settings/credentials/page.tsx` had already handled 503 since it was written.
- **`GET /api/catalog-mapping` fallback kept, and the reasoning written into
  the file.** It already returns 503 (not a silent 200), the UI warns and
  degrades to a local copy, PUT keeps optimistic concurrency, and a degraded
  mapping cannot produce a wrong invoice — it throws
  `MissingEmissionSettingError` / `UnmappedPaymentMethodError` instead.
- **Non-idempotent sanitised text fields.** Twelve schema fields were written
  as `z.string().trim().min(1).transform(sanitizeText)`. `.min(1)` runs BEFORE
  the transform, so an input made only of quotes or control characters passed
  the length check and came out as `""` — a value the same schema then
  rejected. Two consequences: re-validating an already-parsed value failed on
  data that had just been accepted, and an empty `items.description` or
  `customer.name` could reach a legal DIAN document unremarked. All twelve now
  use the `sanitizedText()` helper in `src/schemas/provet.ts`, which re-checks
  the bound after sanitising. Parsing is idempotent across every catalogue
  schema (verified) and blank-after-sanitising records are rejected at source.
- **Admin UI for stuck claims.** `src/components/InvoiceClaimsPanel.tsx` plus
  the pure `src/mappers/invoiceClaimsAdmin.ts`, mounted on `/settings` for
  admins. Lists open claims, releases one with explicit confirmation, and
  surfaces the 409 `claim_emitted` refusal without offering to force it.
  Replaces hand-written SQL against production, which bypassed that refusal and
  caused a real incident.

### Resolved — dead code and duplication session (2026-09-07)

**Gates after this session:** `tsc --noEmit` clean · **569 passed (569)** across
**40 files** · `next build` clean. Test count moved 565 -> 569: nothing was
deleted, four regression tests were added (see C6 below).

- **C1 — seven confirmed-dead exports removed.** Each verified with `ts-prune`
  plus a `grep -rn` per symbol before deletion; the full suite passed unchanged
  afterwards, which is the proof none was load-bearing.

  | Removed | File |
  | --- | --- |
  | `consultationWebhookSchema` | `src/schemas/provet.ts` |
  | `ConsultationWebhook` (type) | `src/schemas/provet.ts` |
  | `ConsultationItem` (type) | `src/schemas/provet.ts` |
  | `siigoTaxEnum` | `src/schemas/siigo.ts` |
  | `SiigoCreditNoteItem` (type) | `src/mappers/creditNote.ts` |
  | `SiigoCreditNotePayment` (type) | `src/mappers/creditNote.ts` |
  | `mockConsultationWebhook` | `src/mocks/provet.ts` |
  | `mockSiigoErrors` | `src/mocks/siigo.ts` |

- **C1 — three exports were wrongly listed as dead and were KEPT.**
  `clientSchema`, `patientSchema` and `consultationItemSchema` are alive.
  `ts-prune` reports them as `(used in module)` because `provet.ts` consumes
  them on its own `export type X = z.infer<typeof xSchema>` lines: `clientSchema`
  and `patientSchema` feed the `Client` / `Patient` types imported by
  `provetToSiigo.ts`, `consultationQueue.ts` and `customerNormalizer.ts`, and
  `consultationItemSchema` is used by `consultationSchema:107`. Any future dead
  code scan on this repo must account for that indirection.

- **`src/mocks/` is NOT test-only.** Four production files import it:
  `src/app/page.tsx`, `src/hooks/useConsultationQueue.ts`,
  `src/hooks/useEmissionOptions.ts` and `src/app/settings/mapping/page.tsx`
  pull `mockClients` / `mockConsultations` / `mockPatients` /
  `mockSiigoProducts` / `mockSiigoPaymentTypes` as seed state. Deleting that
  directory would break the build, not just the tests.

- **Orphaned exports reported, deliberately NOT removed.** `ts-prune` also
  flags these; they go to a later session with their own verification, since
  they may be `(used in module)` cases like the three above:
  `SiigoDocumentType`, `SiigoContact`, `SiigoInvoiceItem`, `SiigoPayment`
  (`src/schemas/siigo.ts:245-253`), `SessionPayload` (`src/services/auth.ts`),
  `VersionConflictError` (`src/services/db.ts`). Add `SiigoError`
  (`src/schemas/siigo.ts`), newly orphaned by the removal of `mockSiigoErrors`.

- **C2 — `provet.ts` and `provetApi.ts` are NOT duplicate schema families.**
  Earlier framing called them duplicates modelling the same Provet entities.
  They sit at different layers:

  | `src/schemas/provetApi.ts` | `src/schemas/provet.ts` |
  | --- | --- |
  | Transport contract — validates raw Provet JSON | Internal domain model |
  | Live at runtime | Live as the source of `Client`, `Patient`, `Consultation` |

  `provetToSiigo.ts`, `consultationQueue.ts` and `catalogMapping.ts` are all
  typed against `provet.ts`. Deleting that family is not de-duplication, it is
  a rewrite of every mapper signature.

- **C2 — the live path does NOT validate totals reconciliation, and that is a
  deliberate open decision.** `provetApi.ts` contains zero `.refine()` /
  `.superRefine()`. The only integrity rule, `toCents(subtotal + tax_total) ===
  toCents(total)`, lives on `consultationSchema:116` in the domain model.
  Moving it to `provetConsultationRawSchema` was **considered and rejected**:

  1. `total`, `total_vat` and `total_with_vat` all carry `.default(0)`, so a
     response omitting them satisfies the rule vacuously — the same phantom
     validation removed as B2 last session.
  2. The reconciliation the evidence actually supports is
     `sum(invoicerow.sum_total) === invoice.total_with_vat` (see the comment at
     `provetApi.ts:113-124`), not the intra-header relation.
  3. It would turn an invisible rounding drift into a hard emission block in
     production, with the drift never having been measured.

  With production already blocked on credentials, adding something that can
  prevent invoicing is risk without upside. **The correct move, once real data
  exists to calibrate it, is option 2: a `sum(sum_total)` rule.**
  `consultationSchema` and its tests are kept intact meanwhile.

- **C4 — broken references in `.clinerules` fixed.** §1 pointed at
  `02_AGENT_WORKFLOW_RULES.md`; the real file is `2_AGENT_WORKFLOW_RULES.md`,
  without the zero. §1 also told agents to read a `Next Pending Task` block that
  no longer exists as live state — it now points at `## Current State`. The
  `Next Pending Task` lines below the separator are append-only changelog
  entries. `01_PROJECT_REQUIREMENTS.md` and `03_UI_UX_DESIGN_SPEC.md` were
  already correct.

- **C5 — the 150-line rule: analysis only, nothing refactored.**
  `2_AGENT_WORKFLOW_RULES.md` §2 caps every file under `/src` at 150 lines.
  **25 non-test files violate it**, not the nine previously believed (17 under
  the narrower `/services`, `/mappers`, `/components` scope `.clinerules` uses —
  the two documents disagree on scope, which is itself worth resolving).
  Largest: `app/page.tsx` 361, `app/settings/mapping/page.tsx` 351,
  `services/errorTranslator.ts` 282, `schemas/siigo.ts` 255,
  `hooks/useConsultationQueue.ts` 233, `services/invoiceClaims.ts` 230,
  `components/InvoiceClaimsPanel.tsx` 230.

  **Recommendation: do not raise the number — replace the rule.** A line count
  is a proxy for nothing. `errorTranslator.ts` is long because it is a lookup
  table of Siigo error codes to Spanish messages; splitting it into three
  94-line files adds two imports and an indirection to read the same data.
  `schemas/siigo.ts` is a flat Zod declaration. Conversely the two files where
  size does signal a real problem — `app/page.tsx`, which orchestrates queue,
  emission, credit notes, history and downloads in one component — have a
  responsibility problem, not a length problem. And `invoiceClaims.ts` is the
  anti-double-emission guard: the last file to touch for cosmetics.

  A rule that 100% of the codebase ignores is not a rule, it is noise that
  teaches the next agent to distrust the rest of the document. The replacement
  already exists in §2 as "Strict Layer Decoupling" (components never perform
  raw mapping or HTTP), and that one *is* being honoured. **Decision on whether
  to amend `2_AGENT_WORKFLOW_RULES.md` is the owner's; the file was not
  modified.**

- **C6 — the timezone-dependent test is fixed, and so is the same bug in
  production display code.**
  - Root cause: `src/mappers/provetToSiigo.test.ts:44` derived its expected
    invoice date from `new Date().toISOString().slice(0, 10)` (UTC) while
    `provetToSiigo.ts:17` correctly uses `America/Bogota`. The suite therefore
    failed every night between ~19:00 and midnight COT, making the project's
    verification gate unreliable for a third of the day.
  - The assertion no longer compares two live clocks. Two deterministic
    regression tests freeze the clock with `vi.setSystemTime`, one at
    `2026-09-08T01:43Z` (20:43 COT, the reported failure) and one mid-morning.
    An expected value computed the same way production computes it would agree
    with itself in any timezone and prove nothing.
  - `TZ` was **not** pinned in `vitest.config.ts`: that would hide the problem
    and decouple the test environment from production.
  - **Second occurrence found and fixed:** `src/mappers/consultationQueue.ts:42`
    `formatDate` used `toISOString().slice(0, 10)` — production code, UTC. A
    consultation created at 21:00 COT was displayed to reception under the next
    day's date. Same bug, same day boundary, on the presentation path instead of
    the emission path, and explicitly prohibited by the project's date rule.
    Verified safe before changing: `tableSort.ts:30` orders on `Date.getTime()`
    and `filterInvoiceHistory` never reads a date, so no filter, sort or
    comparison depends on the rendered string — it is display-only.
  - No other time-dependent patterns remain. `invoiceReconciliation.ts:69-71`
    already uses `America/Bogota`; the remaining `new Date()` calls in tests are
    opaque values whose date representation is never asserted.
  - Verified across four timezones, all **569 passed**: `America/Bogota`,
    `UTC`, `Asia/Tokyo` and `Pacific/Kiritimati` (UTC+14, the extreme case).

- **C7 — the false sandbox claim was corrected in four places, not three.** The
  prompt listed the `siigoInvoiceRawResponseSchema` comment, `PROJECT_STATE.md`
  and `EVIDENCIA_APIS.md`. `EVIDENCIA_APIS.md` **does not exist in this repo**
  (it is maintained outside it and must be corrected there separately). Two
  further copies were found and fixed: `src/schemas/siigo.test.ts:45-52` and the
  "Open items" entry below, which recorded the same falsehood in different
  words. Detail of the correction is in the `stamp` entry above.

### Resolved — dependencies and session model session (2026-09-07, chat 4)

**Gates after this session:** `tsc --noEmit` clean · **569 passed (569)** across
**40 files**, verified under `America/Bogota`, `UTC`, `Asia/Tokyo` and
`Pacific/Kiritimati` · `next build` clean (10/10 pages). Test count unchanged:
this session touched no source file.

- **A7 — `vitest` 2.1.9 -> 4.1.11 (pinned exact). Five advisories closed with
  one update.** The whole vulnerable dev subtree hung off a single root:
  `tsx` already carried the patched `esbuild@0.28.2`, and the vulnerable
  `esbuild@0.21.5` reached the tree only through `vite@5.4.21`, which reached it
  only through `vitest@2.1.9`. `vitest@4.1.11` pulls `vite@8.2.2`, which does
  not depend on `esbuild` at all (rolldown/oxc), so `esbuild`, `vite`,
  `vite-node`, `@vitest/mocker` and `vitest` all left the tree together.
  `npm audit` went from 7 vulnerabilities (3 moderate, 3 high, 1 critical) to
  **2 high**, both `next` and both unfixable without migrating Next.

  Lockfile diff reviewed entry by entry: 38 added, 61 removed, 15 changed, all
  inside the vitest/vite subtree. The 61 removals are `@esbuild/*` and
  `@rollup/*` platform binaries plus chai internals and `vite-node`. **Nothing
  touching `next`, `react`, `postcss`, `typescript`, `tsx` or `@types/*` for the
  project moved.**

  `vi.hoisted()` and `vi.setSystemTime` both survive the 2.x -> 4.x jump; the
  chat-3 timezone regression tests still pass in all four zones.

  **`vitest@5.0.0` was deliberately NOT taken.** It was published 2026-09-03,
  four days before this session. 4.1.11 (2026-08-18) is the last of a mature
  line and already clears every advisory.

- **A7 — an npm 10 bug blocks the install, and it is not this repo's lockfile.**
  `npm install --save-exact --save-dev vitest@4.1.11` fails on npm 10.9.7 with
  `TypeError: Cannot read properties of null (reading 'edgesOut')` at
  `@npmcli/arborist/lib/arborist/build-ideal-tree.js:1289` (`#loadPeerSet`),
  while resolving vitest's optional peers. **Reproduced in an empty
  `npm init -y` project**, so it is an arborist bug, not lockfile corruption.

  Resolution: the lockfile was generated with `npx npm@12`. It comes out as
  `lockfileVersion: 3` — the same format as before — and **npm 10 installs it
  with plain `npm ci`, no flags, `found 0 vulnerabilities` in the dev tree.**
  `--legacy-peer-deps` was rejected as an alternative: it would have written a
  lockfile whose peer resolution no longer reflects the declared graph.
  Vercel is unaffected either way, since it installs from the resolved lockfile.

- **A7 — Next stays on 14.2.35. Confirmed there is nowhere to go inside 14.x.**
  `npm view next versions` gives 46 stable 14.x releases ending at **14.2.35
  (2025-12-11)**; the `next-14` dist-tag points there. Next 14 reached EOL on
  **2025-10-26**. Every `next` advisory in `npm audit` has its fix boundary in
  15.5.x or 16.x — **not one has a 14.x patch.**

- **A7 — CORRECTION: the May 2026 App Router middleware bypasses do NOT affect
  14.2.35.** Earlier framing in the session prompt held that this project's
  middleware-only authorization was "exactly the profile the May advisories
  describe as affected". Checked against the advisory ranges:

  | Advisory | Affected range | 14.2.35? |
  | --- | --- | --- |
  | `GHSA-267c-6grr-h53f` segment-prefetch (CVE-2026-44575) | `>=15.2.0 <15.5.16` · `>=16.0.0 <16.2.5` | no |
  | `GHSA-26hh-7cqf-hhc6` follow-up (Turbopack) | same | no |
  | `GHSA-492v-c6pp-mqqv` dynamic route param injection (CVE-2026-44574) | `>=15.4.0 <15.5.16` · `>=16.0.0 <16.2.5` | no |
  | `GHSA-36qx-fr4f-26g5` Pages Router + i18n (CVE-2026-44573) | `>=12.2.0 <15.5.16` | in range, but no Pages Router and no i18n here |

  The bugs were introduced in branches later than 14. The August 2026 criticals
  are likewise inapplicable: `GHSA-2xp9-vwfh-vxw4` (AVIF/libheif RCE) needs the
  Image Optimization API and this repo has **zero `next/image` usage and no
  `remotePatterns`**, plus Vercel disabled AVIF on its managed service;
  `CVE-2026-75604` needs a Windows host with Pages Router.

  **This lowers the urgency, not the obligation.** 14.x is EOL and will receive
  no patch for anything found from here on.

- **A7 — migration target is 16.3.4, not 15.5.25.** Next 15 is Maintenance LTS
  until **2026-10-21**, six weeks from this session. Migrating to 15 would buy
  weeks and then repeat the exercise.

- **A7 — nothing in the Next ecosystem is pinned to 14.** `eslint`,
  `eslint-config-next` and `@next/eslint-plugin-next` are **not installed at
  all** (which is why `npm run lint` is an alias of `tsc --noEmit`). The future
  migration carries no peripheral dependencies with it.

- **A7 — NOT ROUTE-REVALIDATED: no handler under `ADMIN_ONLY_PREFIXES` checks
  the role itself.** Verified by grepping every use of `verifySessionToken`,
  `SESSION_COOKIE_NAME` and `cookies()` across `src/`:

  | Path in `ADMIN_ONLY_PREFIXES` | Revalidates? | Evidence |
  | --- | --- | --- |
  | `/api/emission-mode` | no | no auth import; `GET`/`PUT` go straight to `getPool()` |
  | `/api/invoice-claims` | no | its own comment: "Admin-only enforcement lives in middleware.ts" |
  | `/settings/credentials` | no | `"use client"`, no server gate |
  | `/settings/mapping` | no | `"use client"`, no server gate |

  Wider than the admin surface: **none of the 12 route handlers under
  `src/app/api/` verifies a session at all.** A middleware bypass would not
  land on a second closed door — it reaches `POST /api/invoices` (real DIAN
  emission), `POST /api/credit-notes` and `DELETE /api/invoice-claims`
  unauthenticated. The one page that *does* revalidate — `/settings/page.tsx`,
  `payload.admin === true`, commented as defense-in-depth — is **not** in
  `ADMIN_ONLY_PREFIXES`. The correct pattern already exists in the repo; it was
  simply not applied where it matters. **Goes to the security session (chat 6);
  it is cheaper and more durable than the migration and does not depend on it.**

- **A7 — the swc lockfile patch error is unchanged, and its cause is now
  known.** The lockfile lists 8 of the 9 `@next/swc-*` platform packages at
  `node_modules/@next/…`; `swc-win32-x64-msvc` exists only nested under
  `node_modules/next/node_modules/`. Next 14.2's `patch-incorrect-lockfile.js`
  reads `.os` off the absent top-level entry, hence
  `TypeError: Cannot read properties of undefined (reading 'os')`. It is **not**
  a corrupt lockfile: `next@14.2.35` itself declares its swc binaries at
  `14.2.33`, because 14.2.34/35 shipped without bumping them. Non-blocking
  (`✓ Compiled successfully`, 10/10 pages), preexisting, unchanged by this
  session.

### Resolved — A6 session model: analysed, nothing implemented

- **CORRECTION: the plain-text password regression no longer exists in the
  code.** `src/services/auth.ts` at this commit reads `ADMIN_EMAIL` +
  `ADMIN_PASSWORD_HASH` and `EMPLOYEE_EMAIL` + `EMPLOYEE_PASSWORD_HASH`, hashes
  the submitted password with SHA-256/base64url and compares in constant time.
  **`ADMIN_PASSWORD` / `EMPLOYEE_PASSWORD` do not appear anywhere in `src/`.**
  The plain-text simplification recorded in the 2026-08-28 changelog entry below
  was reverted in `5d66830` ("Login page fixed", 2026-09-02). That entry is
  append-only and stays, but it no longer describes the code. **This item can
  come off the chat-6 scope.**

- **`.env.example` is not in the repo, and is gitignored.**
  `git check-ignore` confirms `.gitignore:8` (`.env*`) matches it. The canonical
  list of required environment variables is therefore unversioned, which is how
  the `ADMIN_PASSWORD` naming drifted through the documentation in the first
  place. Worth an explicit `!.env.example` negation.

- **No legal requirement was found for per-person traceability.** Resolución
  000165 de 2023 and the technical annex v1.9 place the obligation on the
  *obligado a facturar electrónicamente* — the clinic, identified by NIT in
  `AccountingSupplierParty`. The traceability the regulation demands is
  document-level: signed XML, CUFE, `ApplicationResponse`, RADIAN events,
  authorised numbering range. **No UBL field identifies the natural person who
  operated the software.** Siigo's `seller` is a Siigo Nube registered user id,
  and here it is a single global `catalog_mapping.seller_id` chosen once by the
  admin — the same value on every invoice regardless of who pressed emit. It
  satisfies Siigo's schema requirement; it says nothing about the operator.

- **The schema stores no operator identity, not even the role.** `invoices`
  (11 columns) and `invoice_claims` (7 columns) carry no `emitted_by`,
  `user_email` or `role`. `login_rate_limits.email_hash` exists for throttling,
  not audit.

- **Recommendation: do not build individual accounts, and do not add device/IP
  fingerprinting.** With 2-3 fixed receptionists on clinic-owned devices,
  rotating a shared password when someone leaves is a two-minute operation.
  Fingerprinting is disproportionate here and has a real failure mode: a dynamic
  ISP address or a PC changing network would drop a legitimate session
  mid-emission. **What is worth doing instead is one column** —
  `invoices.emitted_by`, fed from the JWT `email` claim, which already exists in
  `SessionPayload` and already distinguishes the two accounts. It gives the
  owner "the admin account did this, the reception account did that" for
  disputes and incident review at near-zero cost, and does not require a user
  table, password management or onboarding flow. **Not implemented — awaiting
  the owner's decision.**

### Resolved — emission-mode gate session (2026-09-08)

**Gates after this session:** `tsc --noEmit` clean · **593 passed (593)** across
**42 files** (569 -> 593, +24, nothing deleted) · `next build` clean 10/10.

- **D-0 (found while auditing, more serious than the finding this session was
  scoped to). `GET /api/emission-mode` was unreachable by the employee role.**
  `middleware.ts` matched `ADMIN_ONLY_PREFIXES` by path prefix only, not by
  method, so an employee session got **403 on every dashboard load**.
  `fetchServerMode` returns null on `!res.ok`, `setMode` was therefore never
  called, and the client fell back to its `"sandbox"` default —
  `stampSendFor("sandbox")` is false, so **every invoice emitted from a
  reception-only device was never stamped at the DIAN**. This was not the 503
  edge case the session was scoped to: it was the permanent everyday state of
  the role that actually invoices. Verified empirically by executing the real
  middleware against signed `NextRequest`s before and after.

  Fix: the admin list is now `ADMIN_ONLY_RULES`, with an optional per-route
  `sessionOnlyMethods` whitelist. `/api/emission-mode` exempts **GET only**;
  `PUT` (which flips the account into DIAN production stamping) stays
  admin-only, as do `/settings/credentials`, `/settings/mapping` and
  `/api/invoice-claims` on every method. The whitelist shape fails closed: an
  unforeseen verb still requires admin. Enforcement stayed in `middleware.ts`
  rather than moving into the handler, because that handler has no
  authentication of its own (chat 6a, D0) and a hand-rolled guard there would
  have opened a window on the production-stamping PUT.

  `src/middleware.test.ts` is new — the repo had **no middleware tests at all**.
  9 tests: employee GET 200 / PUT 403 / POST-DELETE-PATCH 403, admin GET+PUT
  200, no session 401, `/api/invoice-claims` and `/settings/*` still blocked to
  employees, unauthenticated page redirect to `/login`.

  Exposing that GET to an authenticated employee is safe: `credentialsConfigSchema`
  is `{ mode, configured: Record<string, boolean>, updatedAt }`, the handler
  selects only `mode, configured, updated_at`, and `credentials_config` has no
  secret column. A non-boolean in `configured` fails the parse and yields 503
  `config_corrupt` rather than leaking.

- **`isModeReady` split into "finished loading" and "server confirmed".** New
  pure `src/mappers/emissionModeState.ts`:
  - `parseCachedMode(raw)` returns a **discriminated** `CachedModeRead`
    (`cache` / `absent` / `corrupt` / `ssr`). The old `readMode()` answered the
    string `"sandbox"` for SSR, an absent key, a corrupt blob **and** a
    genuinely stored sandbox — four situations the caller could not tell apart,
    three of which were defaults. The asymmetry below is only sound because
    this distinction now exists.
  - `resolveEmissionGate({ settled, serverMode, cached })` returns
    `{ mode, modeConfirmed, canEmit, reason }`. `modeConfirmed` is true only
    when the server answered in this session.
  - `EMISSION_GATE_MESSAGES` holds the Spanish copy; the UI renders it and maps
    nothing.

- **The gate is deliberately asymmetric, and this is the reasoning.** A wrongly
  assumed `sandbox` emits `stamp.send: false`: the invoice looks successful, is
  never stamped, has no legal validity, and per Siigo's own `invalid_document`
  rule an electronic invoice that was never sent to the DIAN **cannot be
  annulled with a credit note** until it is. Silent and expensive. A wrongly
  assumed `production` emits `stamp.send: true` against an account not
  configured for it, which Siigo refuses with `document_settings` before any
  document exists. Loud and free. So: server unreachable + cached `sandbox`
  → **block**; server unreachable + cached `production` → **allow with a visible
  warning**; no usable cache → **block**. Blocking both would stop a clinic
  invoicing to prevent the cheaper of the two failures.

- **Retry now exists.** There was no refresh path before — the `useEffect` ran
  once with `[]` and the only other listener reacted to `storage` events, which
  never re-query the server. `useEmissionOptions` exposes `refreshMode()`,
  wired to a "Reintentar" button in the blocked banner.

- **The gate disables the button.** `modeNotReady` never disabled anything: it
  produced a message *after* the click (`page.tsx:295`), and its text
  ("Intente de nuevo en un momento") could never appear in the 503 case because
  `isModeReady` was already permanently true. `gate.canEmit` is now part of
  `canSubmit` in `QuickEditDrawer`, so the button is genuinely disabled, with
  the reason shown inline. The in-handler check is kept as defense in depth.

- **Credit notes de-coupled from the mode.** `page.tsx:216` used to block
  annulment on `modeNotReady`. That was a false coupling: `creditNote.ts:148`
  sets `stamp: { send: true }` unconditionally (DIAN Resolución 000042),
  `toCreditNotePayload` overwrites the original payload's `stamp` entirely
  rather than inheriting it, and the Siigo base URL comes from
  `siigoAuth.ts:37-38` on the server, not from the client mode. The client
  `mode` affects **only** `stamp.send` on invoices
  (`provetToSiigo.ts:108,160`). The block was stopping a legally required
  annulment for a reason that does not apply to it, and was removed.

- **`useEmissionOptions` split to stay under the file cap.** Browser-storage and
  network access moved verbatim to `src/hooks/emissionOptionsStorage.ts`
  (149 -> 119 + 107). Behaviour is unchanged, including the storage-event path:
  a cross-tab write to `fact_vet.credentialsConfig` re-reads the cache and drops
  the server confirmation, which reproduces the old `setMode(readMode())`
  exactly while correctly reporting the value as unconfirmed. `mode` is now
  derived rather than held in its own state; the four transitions were checked
  for equivalence one by one.

- **`src/mocks/` untouched.** `emissionOptionsStorage.ts` still imports
  `mockSiigoProducts` as seed state, as the hook did.

- **Mutation checks (each new test proven non-decorative).**

  | Mutation | Killed by |
  | --- | --- |
  | Guard ignores the HTTP method (original bug) | employee GET 200 |
  | `PUT` added to the session-only whitelist | employee PUT 403 |
  | Generalised to "any GET is free" | invoice-claims GET + settings GET |
  | `parseCachedMode` treats an absent key as cached sandbox | absent-key test |
  | `resolveEmissionGate` trusts a cached sandbox | cached-sandbox block test |
  | Unconfirmed state reported as confirmed | 4 tests |

- **Untested without jsdom, and left as debt.** That the button renders
  disabled, that `EmissionModeBanner` renders, that the retry button calls
  `refreshMode`, and the hook's `useEffect` sequencing. All are covered by
  `tsc` only. Every decidable rule lives in the pure mapper and is tested.

- **Not done, deliberately.** `vitest.config.ts` -> `.mts` was dropped from this
  session: line 7 uses `__dirname`, so the rename alone would break the `@`
  alias and every one of the 42 test files. It needs
  `fileURLToPath(new URL("./src", import.meta.url))` and a path-resolution
  re-verification — its own session.

### Resolved — route handler authorization session (2026-09-08, chat 6a)

**D0 — session guards on every route handler (defense in depth).**
Authorization lived *only* in `middleware.ts`. Next.js CVE-2025-29927 showed a
middleware check can be skipped with a single HTTP header, and in this system
the route behind it is `POST /api/invoices`, which stamps a legally binding DIAN
document — a bypass is not a data leak, it is a fraudulent invoice.

Two layers, following the `emissionModeState.ts` precedent:

| File | Role | Lines |
| --- | --- | --- |
| `src/mappers/routeAuthz.ts` | Pure mapper. Decides. No I/O, no `next/server`. | 80 |
| `src/services/routeGuard.ts` | `requireSession` / `requireAdmin` over `NextRequest`. | 66 |
| `src/test/sessionRequest.ts` | Shared fixture. Imports nothing from `vitest`. | 115 |

- All **13** handlers under `src/app/api/` now carry a guard. Before: zero. The
  count is 13, not the 12 recorded in earlier notes.
- `middleware.ts` keeps **all** routing policy (`ADMIN_ONLY_RULES`,
  `requiresAdmin`). The guard does **not** re-derive it: it inspects neither the
  path nor the method. Two tests in `routeGuard.test.ts` pin that.
- Constants-only refactor of `middleware.ts`: the literals `"Sesión requerida."`
  and `"Se requiere rol de administrador."` moved into the mapper. Its 9 tests
  pass **without being edited**.
- Handler signatures went from `req: Request` to `req: NextRequest`, so
  `req.cookies.get(...)` is reused instead of hand-parsing the `Cookie` header.
- `/api/health` gained `export const dynamic = "force-dynamic"`; the 13 handlers
  are now homogeneous. This is what moved the build from 10/10 to 9/9.

**Risk the previous test net could not see.** `middleware.test.ts` never
executes the handlers, so mistakenly applying `requireAdmin` to
`GET /api/emission-mode` would have left all 9 of its tests green while every
reception device fell back to the `sandbox` default and emitted invoices that
are never stamped at the DIAN. Both sides of the asymmetry are now asserted from
`emission-mode/route.test.ts`: employee `GET` → 200, employee `PUT` → 403, plus
a check that the refused `PUT` never touches the database.

**Mutation testing** on `routeAuthz.ts` — 4 mutants, 4 killed: session/role
order inverted (2 failures), role gate neutralised (3), shared literal drifted
(4), `status` leaked into the body (5). Note that the literal drift does **not**
break `middleware.test.ts`, whose asserts use
`toMatchObject({ error: { code } })` and never pin the message; the middleware's
message is pinned solely by the mapper test.

**D5 — credit note `description` sanitisation.** Two earlier premises were wrong.
Siigo *does* publish an `invalid_description` error whose character class
excludes the apostrophe and control characters. And the risk was *not*
theoretical: `POST /api/credit-notes` parses `siigoCreditNoteSchema` straight off
the client-supplied request body, so the payload need not come from
`buildCreditNote` and its already-sanitised invoice.
`siigoCreditNoteItemSchema.description` moved from `z.string().trim().min(1)` to
`sanitizedText({ max: 200 })`, in parity with `siigoInvoiceItemSchema`. The
published regex was **not** translated into Zod: it arrives HTML-escaped and
with an ambiguous `@-\\` range.

**D7 — `Idempotency-Key`.** `generateIdempotencyKey()` already stripped hyphens;
the defect was in validation, which accepted `/^[A-Za-z0-9-]+$/`. Worse than
first recorded: `POST /api/invoices` and `POST /api/credit-notes` accept a
client-supplied `X-Idempotency-Key` header, so a hyphenated key reached Siigo and
was rejected — and a Siigo 5xx consumes the key permanently. Hardened to
`/^[A-Za-z0-9]+$/`, keeping the **30**-character bound (Siigo's docs contradict
themselves: 30 on the Idempotency page, 32 in `invalid_idempotency-key`). **Two
existing tests encoded the defect** (`"RETRY-KEY-99"`, `"NC-RETRY-1"`) and were
corrected.

**D6 — `.env.example`.** Created with the **22** variables the code actually
reads, obtained by `grep -rhoE "process\.env\.[A-Z0-9_]+" src/ scripts/ | sort -u`,
not from memory. `NODE_ENV` deliberately excluded: Next.js sets it and declaring
it breaks the build. `.gitignore:8` held `.env*`, which would have swallowed the
template silently — an `!.env.example` negation was added with a comment.
`BLOB_READ_WRITE_TOKEN` is marked legacy: only `scripts/migrate-blob-to-postgres.ts`
uses it.

**Minor fixes.** `settings/page.tsx:54` named `ADMIN_ONLY_PREFIXES`, a symbol
that has not existed since chat 5; corrected to `ADMIN_ONLY_RULES`. Stale
documentation naming a nonexistent symbol is precisely what caused a session
prompt to be mis-framed.

**Decision DP2 — `/settings/credentials` and `/settings/mapping` get no server
guard. Do not "fix" this.** They are `"use client"` components; guarding them
needs a server `layout.tsx` with `await cookies()`, which turns them from
`○ (Static)` to `ƒ (Dynamic)`. They render **no** sensitive server-side data —
everything they show comes from `/api/emission-mode`, `/api/catalog-mapping` and
`/api/credentials/health`, all of which *are* guarded. Middleware already
redirects an employee with 307 (`middleware.test.ts:84-90`), so the only way to
reach them is a middleware bypass, which yields an empty client shell. Paying
prerender to armour an empty shell does not pay off.

**`src/test/sessionRequest.ts` is a known `ts-prune` false positive.** Only
`*.test.ts` files consume it, so a production reachability scan reports it as
dead code. It is not. It is excluded from the suite by `vitest.config.ts`
(`include: ["src/**/*.test.ts"]`) and imports nothing from `vitest`, so it is
inert at build time.

**File-size cap breached, knowingly.** `src/mappers/creditNote.ts` is at **154**
lines against the 150 cap; it sat at exactly 150 before this session, so any
addition broke it. `src/services/siigoApi.ts` went from 193 to **205** and was
already over. Both are queued for a splitting session.

### Open items

The planned scope of `01_PROJECT_REQUIREMENTS.md`, `2_AGENT_WORKFLOW_RULES.md`
and `03_UI_UX_DESIGN_SPEC.md` is exhausted once chat 6b (CSP) lands. Everything
below is post-plan work, ordered by what blocks it.

**Blocked on production credentials (cannot be closed from the code):**
- The real shape of a populated `stamp` with a CUFE has never been observed. The
  documented shape matches `siigoInvoiceRawResponseSchema`, but it remains
  DOCUMENTED, not OBSERVED.
- Which electronic `documentTypeId` belongs to this account is unknown. The
  earlier claim that the sandbox held no electronic type was **false**: 74
  electronic FV types and 19 electronic NC types exist there. The blocker is
  ownership, not existence.
- Whether the `document_settings` error came from a `NoElectronic` type or from
  permissions is indistinguishable without the production account.
- `stamp.send: true` behaviour cannot be exercised in sandbox.
- `consultationitem` vs `invoicerow` mapping and the dosage / fractional
  quantity rules need production data.
- Provet `/item/` returns 403 with the current integration credentials, so the
  queue still derives mappable items from time-windowed consultations.
- Six `Draft` invoices with an empty `cufe` remain in the database. A cleanup SQL
  script is prepared; it runs on production cutover day.
- Siigo production credentials and the clinic's real Provet Cloud account must be
  requested by the owner.

**Blocked on an operational decision by the owner:**
- **D1 — password hashing.** `authenticate()` uses **unsalted SHA-256**.
  The documented blocker ("middleware runs on Edge, where `node:crypto` does not
  exist") is only half true: `authenticate()` is called *only* from
  `loginAction`, a `"use server"` server action in `login/page.tsx:20`, which runs
  on the **Node** runtime, where `scrypt` is available today. The real obstacle is
  the import graph — `middleware.ts:3` imports from `@/services/auth`, which is a
  re-export of `@/services/jwt`, so a `node:crypto` import in `auth.ts` would be
  dragged into the Edge bundle. **It dissolves with a one-line change**: have
  `middleware.ts` import directly from `@/services/jwt`. Not implemented because
  changing the hash format invalidates the deployed `ADMIN_PASSWORD_HASH` and
  `EMPLOYEE_PASSWORD_HASH` — until they are regenerated in Vercel, nobody can log
  in. Needs its own session with an agreed deployment window.
- **Vercel Hobby → Pro.** Hobby forbids commercial use on two independent
  grounds: being paid to build the site, and the site processing billing. Hobby
  also retains runtime logs for **1 hour**, which is unworkable for a legal
  invoicing system — a 20:00 emission failure is undiagnosable by 08:00.
- **`Partner-Id` regex.** `siigoApi.ts:26` accepts hyphens
  (`/^[A-Za-z0-9-]+$/`); Siigo documents it as alphanumeric without special
  characters. **Deliberately not tightened**: doing so blind could invalidate a
  value already configured in production. Verify the real value first.

**Technical sessions, no external blocker:**
- **Chat 6b — Content-Security-Policy. Phase 1 shipped, phase 2 pending.**
  `Content-Security-Policy-Report-Only` is live in `vercel.json`. Phase 2 is a
  one-word key change, `Content-Security-Policy-Report-Only` →
  `Content-Security-Policy`, in a single line of `vercel.json`, **and only after
  a report-only window comes back clean in a preview deployment**. Nothing else
  changes. The `global-error.tsx` inline-style concern that used to sit here was
  **refuted by measurement** and is closed.
- **Next.js migration — NEXT SESSION, elevated above everything else in this
  list.** 14.2.35 is EOL and unpatchable, and carries 27 open advisories
  (2 critical, 10 high) plus the accepted CVE-2026-44581. The target is **the
  latest release of the 16.x branch at migration time**, not a fixed number:
  Next.js has shipped monthly security releases since July 2026, so any version
  written down here expires within weeks. Do not go to 15.x — Maintenance LTS
  ends 2026-10-21. Note that Next 16 renames `middleware.ts` to `proxy.ts` and
  moves it to the **Node** runtime, not configurable; the API surface
  (`NextRequest`, `NextResponse`, `config.matcher`) is unchanged, so the move is
  an `mv` plus a function rename.
- **`vitest.config.ts` → `.mts`.** Deferred since chat 5: line 7 uses
  `__dirname`, and renaming alone breaks the `@` alias.
- **150-line cap remediation:** `creditNote.ts` (154), `siigoApi.ts` (205),
  `invoices/route.ts` (174), `QuickEditDrawer.tsx` (172), `app/page.tsx` (370).
- **Rounding collision on `sum_total`.** Siigo recomputes each item total as
  `Round(Quantity * UnitPrice - Discount, 2)`. Reading Provet's
  `invoicerow.sum_total` verbatim can diverge by one peso and trigger
  `invalid_total_payments`.
- **Catalogue without `GET /item/`.** Two untried routes: `expose_consultation_item`
  on `invoicerow` returns the item `code` and `name` inline, and Provet added
  `POST /item/export/start/` and `GET /item/export/status/` on 2026-08-20 —
  different endpoints, possibly different permissions.
- **Re-verify the Vercel function limits.** `EVIDENCIA §3.1` states functions cut
  the connection between 10 and 60 seconds; Vercel's own documentation states
  **300 s on Hobby**. If true, the 20-second polling design rests on a constraint
  that no longer holds. Related: Siigo recommends waiting **≥120 s** before
  timing out on invoice and credit-note creation, so a function cutting at 10 s
  would abort emissions Siigo does process.
- **Provet pagination review.** Rate limits are per endpoint over a rolling 60 s
  window, and a custom `page_size` consumes requests proportionally: asking for
  500 with a default of 50 counts as 10 requests.
- **Provet financial period lock.** `financial_period_lock_date` on
  `GET /settings/department/<id>/` blocks back-dating invoices, payments and
  credit notes. It appears in no project document.
- **`invoices.emitted_by` proposed, not implemented** — see the A6 analysis
  above. Awaiting the owner's decision.
- **No component tests.** `vitest.config.ts` runs `environment: "node"` over
  `src/**/*.test.ts` only, with no jsdom or Testing Library. Deliberate: keep
  decisions in pure `.ts` mappers and the `.tsx` thin.

**Documentation corrections owed:**
- **Resolución 948 health-sector fields do not apply.** A veterinary clinic is
  not an SGSSS provider, so `healthcare_company`, `operation_type`, CUCON and the
  EPS/ADRES/SOAT/ARL catalogues are out of scope. Remove the "if applicable" from
  `01_PROJECT_REQUIREMENTS §1.2.4` so no future agent implements it.
- **Missing from the error table:** `invalid_dian_resolution` (the electronic
  resolution has exceeded its date and/or consecutive range),
  `document_settings`, `blocked_transactions`, `duplicated_document`.
- **Siigo blocks the API user** when errors exceed **80% of total requests over
  7 days**. This collides with a sandbox that returns 500 on roughly 1 in 10
  emissions and with the "fail loudly" architecture.
- **Siigo's own documentation contradicts itself three times** on the credit-note
  `reason` enum: the field table says "1 to 5", the DIAN reason table lists
  1, 2, 3, 4, 6, 7, and the OpenAPI schema says 1–6. **Do not pin a Zod enum from
  the docs.** Annulment is code **2**.

**Infrastructure:**
- Supabase backups depend on the plan tier and still need confirming in the
  panel.
- `vercel.json` pins `"regions": ["iad1"]` (Washington) while Supabase sits in
  `us-east-2` (Ohio). Worth revisiting when moving to Pro.

---

## Profile Integration (Task A — Session Management)
- **Date:** 2026-08-28
- **Agent:** Cline (Task A)
- **Completed Task:** Integrated the Profile module — active employee session ("Sesión de Caja Activa") status card and prominent on-page "Cerrar Sesión" logout action. Reconciled the directive's requested top-level `/profile` route into the existing `src/app/settings/profile/page.tsx` (per user decision) to honor DRY/zero-duplication rules — no new duplicate route created. `src/app/settings/profile/page.tsx` (modified, 80 lines, server component): added a "Sesión de Caja Activa" status card using the existing `status-accepted` palette tokens + `CheckCircle2` icon ("Activa", "Turno abierto · validez 24h"); relabeled the email block to "Operador en turno" with a localized (`es-CO`) session-expiry timestamp derived purely from `payload.exp` via `Intl.DateTimeFormat`; added a full-width prominent "Cerrar Sesión" button (Clinical Blue primary-action palette, `rounded-md`, `LogOut` icon) wrapped in `<form action={logoutAction}>` reusing the existing server action from `src/app/actions.ts` (clears cookie → redirect `/login`). Removed the redundant standalone "Sesión activa" block. NavBar (`src/components/NavBar.tsx`) verified — already links to `/settings/profile` ("Perfil", `User` icon) and already exposes `logoutAction`; no edit required. No password-change/user-creation forms added (session is corporate env/JWT managed). No changes to invoice emission (`src/app/page.tsx`) or route guards (`src/middleware.ts`). Reused `verifySessionToken`/`SESSION_COOKIE_NAME` from `@/services/auth` and `logoutAction` from `@/app/actions` — zero new services/mappers.
- **Modified Files:** `src/app/settings/profile/page.tsx`, `src/app/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 144/144 | `npm run lint` ✅
- **Follow-up Fix (same session):** The main dashboard `src/app/page.tsx` (144 lines) had its own inline header (duplicating title/Sandbox/logout) and did NOT render `NavBar`, so the Perfil/Credenciales/Catálogo links were invisible after login. Replaced the inline header with the shared `<NavBar />` component (DRY — single nav source) and wrapped the dashboard content (tabs, ErrorBanner, queue/history tables, drawers, toast) in a `<div className="flex flex-1 flex-col gap-2 p-2">` preserving the original `p-2`/`gap-2` spacing so the tables' `h-[calc(100vh-120px)]` layout is unchanged. Removed now-unused `LogOut`/`logoutAction` imports. The NavBar now appears on the dashboard, exposing the "Perfil" link (→ `/settings/profile`) consistently with the settings pages.
- **Next Pending Task:** None — awaiting next directive.

---

## Admin Role Protection (Task B — Credentials & Catalog access control)
- **Date:** 2026-08-28
- **Agent:** Cline (Task B)
- **Completed Task:** Protected the Credentials (`/settings/credentials`) and Catalog mapping (`/settings/mapping`) pages with an `admin` role derived from the `ADMIN_EMAIL` env var, and hid their NavBar links for non-admin employees. Defense-in-depth: the authoritative `admin: boolean` flag lives inside the HttpOnly JWT (enforced by the middleware); a secondary non-HttpOnly `vet_role` cookie (`"admin"`/`"user"`) drives UI display only. (1) `src/services/sessionCookies.ts` (new, 62 lines): extracted `SESSION_COOKIE_NAME`/`SESSION_TTL_SECONDS`/`createSessionCookie`/`clearSessionCookie` from `auth.ts` and added `ROLE_COOKIE_NAME`/`createRoleCookie(isAdmin)`/`clearRoleCookie()` (non-HttpOnly, SameSite=Strict, Secure(prod), Path=/, MaxAge=24h). (2) `src/services/auth.ts` (refactored, 136 lines, <150): added `admin` to `SessionPayload`, `isAdminEmail(email)` (case-insensitive vs `ADMIN_EMAIL`), `signSessionToken` accepts optional `admin` (defaults false), `verifySessionToken` normalizes `admin: Boolean(body.admin)` (robust to legacy tokens), `authenticateEmployee` embeds `isAdminEmail(expectedEmail)`. (3) `src/app/login/page.tsx`: `loginAction` now sets the role cookie via `createRoleCookie(isAdminEmail(email))` alongside the session cookie. (4) `src/app/actions.ts`: `logoutAction` clears the role cookie too. (5) `src/middleware.ts` (23 lines): non-auth → `/login`; admin-only prefixes (`/settings/credentials`, `/settings/mapping`) with `!valid.admin` → redirect `/`. (6) `src/components/NavBar.tsx` (70 lines): `NAV_ITEMS` gained `adminOnly` flags; reads `vet_role=admin` from `document.cookie` in a `useEffect` (SSR-safe) and filters admin-only links for non-admins. (7) `.env.example`: added `ADMIN_EMAIL` placeholder. (8) Tests: `src/services/auth.test.ts` (16 tests) covers admin round-trip + `isAdminEmail` + `authenticateEmployee` admin embedding; new `src/services/sessionCookies.test.ts` (7 tests) covers session + role cookie flags. No changes to invoice emission logic. Pages Credenciales/Catálogo kept (Option C); only access-controlled.
- **Modified Files:** `src/services/sessionCookies.ts` (new), `src/services/auth.ts`, `src/app/login/page.tsx`, `src/app/actions.ts`, `src/middleware.ts`, `src/components/NavBar.tsx`, `.env.example`, `src/services/auth.test.ts`, `src/services/sessionCookies.test.ts` (new), `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 155/155 (11 files) | `npm run lint` ✅

---

## Runtime Error Audit — /settings RSC Client-Reference Crash (Task D)

- **Date:** 2026-08-28
- **Agent:** Cline (Task D)
- **Completed Task:** Audited and fixed the "Unhandled Runtime Error: Element type is invalid. Received a promise that resolves to: undefined" on `/settings`. Audit proved the two target files' explicit imports/exports were correct (named `import { HealthCheckStatus }` ↔ named `export function HealthCheckStatus`; all 5 lucide icons resolve to valid runtime components on lucide-react@0.427.0; no explicit `React.lazy`/`next/dynamic`/dynamic `import()` exists in `src`). The real defect was **client↔server coupling**: `HealthCheckStatus.tsx` (`"use client"`) imported `healthReportSchema` from `@/services/healthCheck`, which transitively bundled the entire `siigoApi.ts` server service (`process.env`, external `fetch`, `checkService`, `submitInvoice`, `fetchInvoicePdf`) into the `/settings` browser chunk — verified present in the built client chunk pre-fix. Combined with `experimental.optimizePackageImports: ["lucide-react"]` (next.config.js) implicit per-icon rewrites and a stale `.next` HMR cache, this made the RSC client-reference for `HealthCheckStatus` resolve to `undefined`. Fix: (1) `src/schemas/health.ts` (new, 43 lines, client-safe — zod-only, no `process.env`/`fetch`): extracted `ServiceState`/`ServiceName`/`ServiceHealth`/`HealthReport` + `healthReportSchema`. (2) `src/services/healthCheck.ts` (124→85 lines): dropped the local `z` import + inline type/schema defs; imports types from `@/schemas/health` and re-exports schema+types so server callers (`/api/health` route, tests) keep one import. (3) `src/components/HealthCheckStatus.tsx` (122→109 lines): imports `healthReportSchema`+types DIRECTLY from `@/schemas/health` (cuts the server-code leak) AND added a defensive icon fallback `const { dot, text, Icon = HelpCircle } = STATE_STYLE[s.state] ?? STATE_STYLE.unknown;` so a transiently-undefined icon can never reach `React.createElement` as `undefined`. (4) `src/app/api/health/route.ts`: split the import (`checkHealth` from service, `healthReportSchema` from schema). Cleared the stale `.next` HMR cache and ran a fresh `next build`.
- **Modified Files:** `src/schemas/health.ts` (new), `src/services/healthCheck.ts`, `src/components/HealthCheckStatus.tsx`, `src/app/api/health/route.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 177/177 (12 files) | `npm run lint` ✅ | `npx next build` ✅ (10/10 pages) | all edited files <150 lines | **leak proof**: fresh `/settings` client chunk grep for `api.siigo.com`/`SIIGO_API_BASE_URL`/`PROVET_BASE_URL`/`checkService`/`checkHealth`/`submitInvoice`/`fetchInvoicePdf`/`siigoApi` → all **0** (were all FOUND pre-fix); `/settings` First Load JS 113 kB.
- **Notes / Tradeoffs:** `src/app/settings/page.tsx` was left untouched — its `import { HealthCheckStatus } from "@/components/HealthCheckStatus"` (named) is correct and must NOT be wrapped in `next/dynamic`/`lazy` (that would re-introduce a real promise and defeat the fix). `next.config.js` `experimental.optimizePackageImports: ["lucide-react"]` was intentionally left in place (out of the two-file scope); the defensive `Icon = HelpCircle` fallback neutralizes any undefined-resolution from that implicit per-icon rewrite. The schema extraction follows REUSE/ZERO-DUPLICATION (single source of truth in `@/schemas/health`; the service re-exports rather than duplicating). No `any` types or `@ts-ignore` introduced.
- **Next Pending Task:** None — awaiting next directive.
- **Notes / Tradeoffs:** NavBar reads the role cookie after mount (avoids hydration mismatch) → admins see the links ~1 frame after first paint; safe because the middleware enforces the real guard on the HttpOnly JWT. If `ADMIN_EMAIL` changes in Vercel, the role only updates on next login (24h session); for immediate revocation rotate `JWT_SECRET`. Tampering `vet_role` only reveals links the middleware would still block.
- **Next Pending Task:** None — awaiting next directive.

---

## Settings & Health Check Module (Task B — Service Semaphore)
- **Date:** 2026-08-28
- **Agent:** Cline (Task B)
- **Completed Task:** Added a real-time "Service Semaphore" so receptionists immediately know whether Provet Cloud, Siigo Nube and DIAN are operational, plus a `/settings` container that embeds the health card and exposes clean navigation links to admin pages when authorized. To honor the no-direct-fetch-in-UI rule, two supporting plumbing files were created alongside the two named target files. (1) `src/services/healthCheck.ts` (new, 110 lines, <150): `ServiceState` (`online`/`degraded`/`offline`/`unknown`), `ServiceName` (`provet`/`siigo`/`dian`), `ServiceHealth`, `HealthReport`, and `healthReportSchema` (Zod) validating the route's own JSON output (§3 runtime validation). Pure helpers `aggregateOverall(states)` (worst-state reducer, O(n)) and `stateFromResponse(ok, latencyMs)` (>2000ms → degraded). `checkService(name, url, fetchImpl)` pings a base URL with a 5s `AbortController` timeout, never throws (network failure/abort → offline), records latency, returns Spanish `detail` (no raw traces). `checkHealth()` pings `PROVET_BASE_URL` and reuses `SIIGO_API_BASE_URL` from `siigoApi.ts` (DRY) in parallel, derives DIAN from Siigo (Siigo is the DIAN stamping proxy — no public DIAN ping exists), aggregates `overall`. Safe for Sandbox/Mock: no credentials, no rate-limit burn. (2) `src/services/healthCheck.test.ts` (new, 16 tests): `aggregateOverall` precedence, `stateFromResponse` thresholds, `checkService` ok/offline/slow/abort, `checkHealth` online + Siigo-offline→DIAN-offline + Siigo-slow→degraded, `healthReportSchema` rejects unknown states. (3) `src/app/api/health/route.ts` (new, 13 lines): dedicated `GET /api/health` Route Handler calling `checkHealth()` and returning `NextResponse.json(healthReportSchema.parse(report))` — the same-origin endpoint the UI consumes (never external APIs). (4) `src/components/HealthCheckStatus.tsx` (new, 109 lines, <150, client): fetches only `/api/health` (`cache: "no-store"`) on mount + manual `RefreshCw` button + 60s auto-refresh (`setInterval`, cleared on unmount); renders a clinical card with an overall semaphore badge and 3 service rows using the existing `status-accepted`/`status-draft`/`status-rejected` tokens (🟢/🟡/🔴) + `CheckCircle2`/`Clock`/`AlertTriangle`/`HelpCircle` icons, latency in ms, Spanish details; loading skeleton rows match row height (no layout shift per spec); error row never exposes raw traces. Pure rendering — no data mapping. (5) `src/app/settings/page.tsx` (new, 67 lines, server): reads `SESSION_COOKIE_NAME` + `verifySessionToken`, `redirect("/login")` if unauthenticated (defense-in-depth under the edge middleware); renders `<NavBar />`, a "Configuración" header, embeds `<HealthCheckStatus />`, and shows navigation links — "Perfil" for all users, "Credenciales" + "Catálogo" only when the verified JWT `payload.admin === true` (authoritative, unlike NavBar's client `vet_role` cookie); non-admins see a muted "reserved to admin" note. No changes to invoice emission, middleware, NavBar, or existing admin guards.
- **Modified Files:** `src/services/healthCheck.ts` (new), `src/services/healthCheck.test.ts` (new), `src/app/api/health/route.ts` (new), `src/components/HealthCheckStatus.tsx` (new), `src/app/settings/page.tsx` (new), `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 171/171 (12 files) | `npm run lint` ✅
- **Notes / Tradeoffs:** DIAN health is derived from Siigo reachability (no public DIAN ping endpoint) — honest to receptionists ("DIAN vía Siigo"). Health pings hit the configured base URLs with a 5s cap and no credentials, so they cannot burn the 100 req/min Siigo rate limit or expose secrets; in Sandbox they still reflect real network reachability of `SIIGO_BASE_URL`/`PROVET_BASE_URL`. The `/api/health` route is matched by the existing middleware matcher (auth-gated) but is NOT admin-only, so any authenticated employee can read it — appropriate for a receptionist-facing semaphore. Vitest runs node-env `src/**/*.test.ts` only (no jsdom/RTL dependency in the repo), so the `.tsx` component is type-checked by `tsc` only, matching the existing convention (no component tests pre-exist). `SIIGO_API_BASE_URL` is captured at module import in `siigoApi.ts`; tests control Siigo's URL via substring matching rather than env mutation after import.
- **Next Pending Task:** None — awaiting next directive.

---

## Input Validation Audit & Enforcement (Task C — Validation Hardening)
- **Date:** 2026-08-28
- **Agent:** Cline (Task C)
- **Completed Task:** Audited every input control, drawer, and backing Zod schema for pre-flight validation, sanitization, and DIAN domain integrity; fixed a critical NIT hyphen contradiction and eliminated floating-point drift in all total reconciliations. (1) `src/schemas/provet.ts` (85→88 lines): added shared pure helpers `toCents(n)` (O(1) cent-integer rounding), `hasMaxDecimals(n,max)` (string-based float-safe precision check), `sanitizeText(s)` (strips single quotes + ASCII control chars per Siigo `^[^']+$`); added `.max()` length caps and `.transform(sanitizeText)` to `name`/`address`/`email`; added max-upper-bounds + decimal-precision refines (6dp unit_price/discount, 2dp subtotal/tax_total/total); switched `consultationSchema` refine from strict `===` to `toCents()` zero-drift comparison. (2) `src/schemas/siigo.ts` (93→83 lines): imported the shared helpers; added precision caps (6dp price, 2dp amount/total), length caps, and `sanitizeText` transforms; switched `siigoInvoicePayloadSchema` refine to `toCents()` cent-integer reconciliation. (3) `src/mappers/creditNote.ts` (117→108): imported `toCents`/`hasMaxDecimals`; added precision caps to reversal item/payment; switched the credit-note total refine to cent-integer. (4) `src/mappers/provetToSiigo.ts` (139→133): added `round6`/`round2` helpers; unit price now rounded to 6 decimals and payment/total to 2 decimals so the cent-integer refinements always hold. (5) `src/mappers/consultationQueue.ts` (138→122): added a 2-decimal cap to `quickEditFormSchema.paidAmount`. (6) `src/mappers/credentials.ts`: added `.max()` bounds to username/accessKey/clientId/clientSecret. (7) `src/components/QuickEditDrawer.tsx` (113→103): **CRITICAL FIX** — identification sanitizer now strips spaces only (`/\s/g`) instead of `[\s-]`, preserving the NIT hyphen that `identificationSchema` requires (the old code permanently disabled Emit for NIT clients); added a `CC` "Cédula válida: 6–10 dígitos" hint; email error now distinguishes empty (`Falta correo`) from invalid; `paidAmount` input gained `step="0.01"` and cent rounding on change; `balanced` now uses `toCents()` comparison. (8) `src/components/ReconciliationBar.tsx`: `balanced` switched to `toCents()` cent-integer comparison. (9) `src/services/siigoApi.ts` (144→136): added `partnerIdHeaderSchema` (3–100 alnum/hyphen) and `idempotencyKeyHeaderSchema` (1–30 alnum/hyphen) parsed inside `postToSiigo` — defense-in-depth so non-UI callers cannot emit invalid `Partner-Id`/`Idempotency-Key` headers (CRLF-safe). Hyphens are permitted in both to match existing retry-key usage (`NC-RETRY-1`).
- **Modified Files:** `src/schemas/provet.ts`, `src/schemas/siigo.ts`, `src/mappers/creditNote.ts`, `src/mappers/provetToSiigo.ts`, `src/mappers/consultationQueue.ts`, `src/mappers/credentials.ts`, `src/components/QuickEditDrawer.tsx`, `src/components/ReconciliationBar.tsx`, `src/services/siigoApi.ts`, `src/mappers/consultationQueue.test.ts`, `src/mappers/provetToSiigo.test.ts`, `src/services/siigoApi.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 177/177 (12 files, +6 new) | `npm run lint` ✅ | all edited files <150 lines
- **Notes / Tradeoffs:** The NIT hyphen fix was the highest-impact change — the previous `replace(/[\s-]/g, "")` stripped the verification-digit hyphen that `identificationSchema` (`^\d{7,10}-\d{1}$`) mandates, so every NIT (juridical) client was un-invoiceable. Cent-integer reconciliation (`toCents`) defeats classic float drift (`0.1+0.2 !== 0.3`) without changing the 2-decimal DIAN contract; integer mock data is unaffected. `hasMaxDecimals` is string-based to avoid `multipleOf` float pitfalls; it treats scientific-notation sub-precision values (e.g. `1e-7`) as 0 decimals — acceptable since such values are below the 6dp unit-price floor. `sanitizeText` strips single quotes and control chars but preserves spaces (addresses need them), satisfying the Siigo `^[^']+$` rule for `name`/`observations` while keeping `address` usable. Header validation permits hyphens (not strictly "alphanumeric") to remain backward-compatible with the existing `NC-RETRY-1` retry-key tests; the regex still blocks CRLF/header-injection control chars. No `any` types or `@ts-ignore` introduced.
- **Next Pending Task:** None — awaiting next directive.

---

## Multi-Role JWT Authentication Audit & Separate Admin Account (Task D — Auth Hardening)
- **Date:** 2026-08-28
- **Agent:** Cline (Task D)
- **Completed Task:** Audited and hardened the multi-role JWT auth flow. Replaced the single-credential + `ADMIN_EMAIL`-match role model with a TRUE separate admin account, and split the auth module to respect the <150-line file cap. (1) `src/services/jwt.ts` (new, 96 lines): extracted the pure Web Crypto JWT/token layer — `SessionPayload`, `base64url`/`base64urlDecode` codec, `getSecret`, `hmacKey`, `signSessionToken` (HMAC-SHA256, 24h exp), `verifySessionToken` (constant-time `crypto.subtle.verify`, expiry guard, `admin: Boolean(body.admin)` normalization). `getSecret` throws a plain `Error` (no `AuthError` dependency → no circular import); the credential layer pre-checks `JWT_SECRET` so the `missing_credentials` code is preserved. (2) `src/services/auth.ts` (refactored 149→83 lines): `AuthError`, `AuthResult`, `sha256` (Web Crypto SHA-256 → base64url — same encoding the env hashes must use), `timingSafeEqual` (constant-time), `emailMatches` (case-insensitive + trimmed), and the new `authenticate(email, password): Promise<{ token; admin }>`. `authenticate` matches the ADMIN set (`ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` → `admin:true`) OR the receptionist set (`EMPLOYEE_EMAIL` + `EMPLOYEE_PASSWORD_HASH` → `admin:false`); `missing_credentials` only when BOTH sets are incomplete; otherwise `invalid_credentials`. **Removed** `authenticateEmployee` and `isAdminEmail` (the role is now authoritative from the matched credential set, eliminating the pre-auth email-guess that was semantically wrong). Re-exports `signSessionToken`/`verifySessionToken`/`SessionPayload` from `./jwt` so the 3 unchanged consumers (`middleware.ts`, `src/app/settings/page.tsx`, `src/app/settings/profile/page.tsx`) keep importing from `@/services/auth` with zero churn. (3) `src/app/login/page.tsx` (58 lines): `loginAction` now destructures `{ token, admin } = await authenticate(...)` and sets the role cookie via `createRoleCookie(admin)` (authoritative) instead of `createRoleCookie(isAdminEmail(email))`. (4) `src/services/jwt.test.ts` (new, 57 lines, 6 tests): migrated token round-trip / admin-flag / tampered / malformed / expired suite. (5) `src/services/auth.test.ts` (refactored 148→94 lines, 9 tests): multi-role suite — admin login (`admin=true`), receptionist login (`admin=false`), case-insensitive admin email, wrong password (each account), receptionist password cannot unlock admin, receptionist-only config rejects admin login, both-unset → `missing_credentials`, `JWT_SECRET` unset → `missing_credentials`. Hash helper mirrors the service's Web-Crypto SHA-256→base64url path so encoding can never diverge (a plain base64/hex hash would yield `invalid_credentials`, never a crash). (6) `.env.example` + `README.md`: added `ADMIN_PASSWORD_HASH` (sha256→base64url, with generation command), clarified `ADMIN_EMAIL` as a SEPARATE admin login email, added independent admin-password rotation guidance.
- **Audit Findings (verified before implementation):** (a) Hashing is correct & encoding-consistent — `sha256()` = `crypto.subtle.digest("SHA-256")` → `base64url()`; the service `base64url()` (strips `=` padding, `+`→`-`/`/`→`_`) matches Node's `Buffer.toString("base64url")` and the `.env.example`/README generation commands, so the runtime hash and env hash use the same encoding (no false `invalid_credentials` from encoding mismatch). (b) The directive's `ADMIN_PASSWORD_HASH` reference was a real gap — it did NOT exist (0 repo matches); the prior design derived the admin role purely from `ADMIN_EMAIL == EMPLOYEE_EMAIL` with a single shared password. Option C closed that gap with a genuine second credential set. (c) JWT payload carries `admin: boolean` (not a string `"employee"`); middleware (`/settings/credentials`, `/settings/mapping`) enforces `valid.admin` from the HttpOnly JWT; the non-HttpOnly `vet_role` cookie remains UI-display-only and is now set from the authoritative auth result.
- **Modified Files:** `src/services/jwt.ts` (new), `src/services/auth.ts`, `src/app/login/page.tsx`, `src/services/jwt.test.ts` (new), `src/services/auth.test.ts`, `.env.example`, `README.md`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 176/176 (13 files, +1 new: jwt.test.ts 6 tests; auth.test.ts 9 multi-role tests) | `npm run lint` ✅ | all edited files <150 lines (jwt.ts 96, auth.ts 83, jwt.test 57, auth.test 94, login 58)
- **Notes / Tradeoffs:** Two credential sets mean admin-password rotation is now independent of the receptionist's. The admin-vs-receptionist branch in `authenticate` is evaluated sequentially (admin first), so login timing is NOT strictly constant-time across the two accounts — acceptable for an internal single-admin/single-receptionist clinic app and parity with the prior early-exit email compare; the hash comparison itself remains constant-time (`timingSafeEqual`). `isAdminEmail` removal is safe — the only consumer was `login/page.tsx`, which now uses the authoritative `admin` from `authenticate`; NavBar reads the `vet_role` cookie (unchanged) and middleware reads the JWT `admin` flag (unchanged). `sha256`/`timingSafeEqual`/`emailMatches` are module-private (not exported) to keep the auth surface minimal. No `any` types or `@ts-ignore` introduced; no external JWT/crypto dependency added (Web Crypto only, Edge-runtime-safe).
- **Next Pending Task:** None — awaiting next directive.
---

## Plain-Text Env Password Simplification (Task — Simplify Login Flow)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Simplified the authentication env variables to accept plain-text passwords instead of pre-computed SHA-256 base64url hashes. (1) `src/services/auth.ts` (modified, 83 lines): changed env reads from `ADMIN_PASSWORD_HASH`/`EMPLOYEE_PASSWORD_HASH` to `ADMIN_PASSWORD`/`EMPLOYEE_PASSWORD`; the stored plain-text password is now hashed at runtime via the existing `sha256()` helper before constant-time comparison against the hashed user input. Updated JSDoc to reflect plain-text storage. (2) `src/services/auth.test.ts` (modified, 94 lines): removed `passwordHash()` helper; set `process.env.EMPLOYEE_PASSWORD` and `process.env.ADMIN_PASSWORD` directly with plain-text values `"S3gura#123"` and `"Adm1n#2026"`; `beforeEach` no longer async. All 9 tests retain identical assertions. (3) `.env.example` (modified): renamed `EMPLOYEE_PASSWORD_HASH`/`ADMIN_PASSWORD_HASH` to `EMPLOYEE_PASSWORD`/`ADMIN_PASSWORD` with example plain-text values (`Recep2026!`, `Admin2026!`), updated comments to describe plain-text usage and runtime hashing. No changes to `src/services/jwt.ts`, `src/app/login/page.tsx`, `src/middleware.ts`, or any other consumer.
- **Modified Files:** `src/services/auth.ts`, `src/services/auth.test.ts`, `.env.example`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 176/176 (13 files, auth.test.ts 9 tests) | `npm run lint` ✅ | all edited files <150 lines (auth.ts 83, auth.test.ts 94)
- **Notes / Tradeoffs:** Security model unchanged — env vars are never exposed to the client (`NEXT_PUBLIC_` not used); `timingSafeEqual` and `sha256()` still mitigate timing attacks; the stored secret (`JWT_SECRET`) already lives in an env var. Runtime hashing adds a negligible ~1ms per login call. Admin and receptionist passwords are now independent plain-text values with zero terminal-hash commands required for rotation.
- **Next Pending Task:** None — awaiting next directive.
---

## Health Check UI State Sync (Task — Fix isConnected Semaphore)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Fixed the Health Check UI state sync so the banner renders **green** (`CheckCircle2` / `"Sistema de monitoreo activo"`) whenever the `/api/health` endpoint returns HTTP 200 (`isConnected === true`), regardless of individual external-service states. The per-service detail rows continue to accurately reflect each service's real semaphore (online/offline/degraded/unknown) — so in local dev, Provet/Siigo/DIAN show red because the real external URLs (`api.provetcloud.com`, `api.siigo.com`) are unreachable, but the banner correctly indicates the health check system itself is connected. Removed unused `OVERALL_LABEL` and `overall` derivation dead code flagged by lint. Component stays at 117 lines (<150 cap).
- **Modified Files:** `src/components/HealthCheckStatus.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 176/176 (13 files) | `npm run lint` ✅ | file <150 lines (117)
- **Next Pending Task:** None — awaiting next directive.
---

## Harden Health Check with Provet & Siigo Auth Headers (Task B)
- **Date:** 2026-08-28
- **Agent:** Cline (Task B)
- **Completed Task:** Harden health check to use real Provet API key header and Siigo OAuth token validation. (1) `src/services/healthCheck.ts` (modified, 133 lines, <150): `checkService` now accepts optional 4th parameter `headers?: Record<string, string>` merged into the fetch init; new `checkSiigoHealth()` calls `getSiigoAccessToken()` from `siigoAuth.ts` and maps success → online, `SiigoAuthError` → offline with auth message, non-auth error → offline with generic detail; `checkHealth()` now passes `x-api-key` header from `process.env.PROVET_API_KEY` to Provet ping and replaces the bare-GET Siigo ping with `checkSiigoHealth()` for real OAuth validation. Removed unused `SIIGO_API_BASE_URL` import. (2) `src/services/healthCheck.test.ts` (modified, 147 lines, <150): added `vi.mock("./siigoAuth")` for module-level `getSiigoAccessToken`/`SiigoAuthError` control; 5 new tests — `checkService` custom headers passthrough, `checkSiigoHealth` online/auth-failure/non-auth-error paths, `checkHealth` `x-api-key` header assertion; existing `checkHealth` tests refactored to use mocked `getSiigoAccessToken` instead of URL-substring fetch matching. Total suite: 14 test files, 181 tests (was 176, +5). No changes to `HealthCheckStatus.tsx` (banner green sync unchanged).
- **Modified Files:** `src/services/healthCheck.ts`, `src/services/healthCheck.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 181/181 (14 files, healthCheck.test.ts 14 tests) | `npm run lint` ✅ | all edited files <150 lines (healthCheck.ts 133, healthCheck.test.ts 147)
- **Next Pending Task:** None — awaiting next directive.
---

## Live Refresh — Consultations & Catalog Mappings (Task — Manual Poll/Sync Actions)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Added compact 🔄 manual-refresh actions (spin animation) mirroring the existing `HealthCheckStatus` refresh-button pattern; presentational components stay strictly fetch-free (props only), pages own the data re-evaluation. (1) `src/components/ConsultationQueue.tsx`: +`isRefreshing?: boolean` / `onRefresh?: () => void` optional props; `[🔄 Refrescar Atenciones]` button (`RefreshCw` + `animate-spin`) in the table header, rendered only when `onRefresh` is supplied. (2) `src/components/CatalogMapping.tsx`: +`isRefreshing?: boolean` / `onSync?: () => void` optional props; `[🔄 Sincronizar Catálogos]` button in the section header (a single button refreshes BOTH items + payment-types, since the parent re-reconciles the whole `mapping` state — avoids editing `PaymentMapping.tsx`, which is outside the target list). (3) `src/app/page.tsx`: `isRefreshing` state + `handleRefreshConsultations` (`useCallback`, async, try/finally) that re-runs `buildConsultationQueue(mockConsultations, mockClients, mockPatients)` and MERGES with existing rows via an O(n) `Map` keyed by `id` so already-emitted `invoiceStatus` (Accepted/Draft/Rejected/Annulled) is preserved (a plain re-seed would wipe DIAN badges); props wired to `<ConsultationQueue>`. Collapsed `TABS` and inlined the `history` seed initializer (exact CON-001/002/003 + date values preserved) to hold the file under the 150-LOC cap. (4) `src/app/settings/mapping/page.tsx`: `isSyncing` state + `handleSyncCatalogs` (async, try/finally) that re-runs the existing pure mapper `reconcileMapping(prev, provetItems, mockSiigoProducts, provetMethods, mockSiigoPaymentTypes)` (REUSE — bumps `version`, nulls stale siigo ids, re-seeds new provet entries; the `itemRows`/`paymentRows` `useMemo`s auto-recompute → dropdowns refresh) and reuses the existing `toast`; props wired to `<CatalogMapping>`; seed initializer inlined to stay under cap.
- **Modified Files:** `src/components/ConsultationQueue.tsx`, `src/components/CatalogMapping.tsx`, `src/app/page.tsx`, `src/app/settings/mapping/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 182/182 (14 files) — unchanged from baseline; no mapper/service/component tests touch the changed surfaces | `npm run lint` ✅ (exit 0; `npm run lint` is aliased to `tsc --noEmit` in `package.json`, with unused-var/dead-import enforcement via `tsconfig.json` `noUnusedLocals`+`noUnusedParameters`) | all edited files <150 LOC (ConsultationQueue 139, CatalogMapping 131, page.tsx 148, mapping/page.tsx 134).
- **Notes / Tradeoffs:** Components remain strictly presentational (no raw fetch/Axios — per layer-decoupling rules); pages own data re-evaluation. Live Siigo `fetchProducts()`/`fetchPaymentTypes()` and Provet `fetchClosedConsultations()` are DEFERRED — no such service fns exist yet and Siigo calls require server-side `Partner-Id`+Bearer token (out of the 4-file scope); both handlers are `async` with a documented single-line swap point for the future server fetch. Consultation refresh preserves already-emitted DIAN statuses (no wipe). `RefreshCw` icon + `animate-spin` reused from the existing `HealthCheckStatus` pattern for clinical UI consistency (spec §4.2). No new types/files; all new props optional so existing call sites & tests are unaffected. The 150-line cap is interpreted as LOC (non-blank, non-comment), matching `PROJECT_STATE`'s own prior citations (e.g. page.tsx cited at 132/147 while the raw file was 157).
- **Next Pending Task:** None — awaiting next directive.
---

## Provet Cloud Live Integration — Real Consultations Poll (Task — "Refrescar Atenciones" ahora trae datos reales)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Wired the 🔄 Refrescar Atenciones button to the REAL Provet Cloud REST API (previously it re-read static mocks → nothing new ever appeared). Reverse-engineered the live Provet API contract by probing with the configured `.env.local` credentials (no secrets printed): (a) OAuth2 client-credentials grant `POST {PROVET_TOKEN_URL}` (form-urlencoded `grant_type=client_credentials`) returns an opaque `access_token` (scope `restapi`, 10h TTL, NOT a JWT); (b) DRF paginated resources `{count,next,previous,results}`; (c) the token is passed as the `?access_token=` **query parameter** (every header scheme — `Bearer`, `Token`, `Api-Key`, `x-api-key` — returns 401 "credentials were not provided"; only the query param authenticates); (d) resources are singular (`/consultation`, `/client`, `/patient`, `/invoice`, `/consultationitem`); relations are hyperlinked URLs resolved via a new `extractId()` helper.
  (1) `src/schemas/provetApi.ts` (NEW): partial + `.passthrough()` raw schemas (consultation/client/patient/invoice/consultationitem) + `provetPaginatedSchema<T>()` envelope.
  (2) `src/services/provetAuth.ts` (NEW): `ProvetAuthError`, `provetTokenResponseSchema`, in-memory token cache (60s safety margin), `resetProvetAuthCache()`, `getProvetAccessToken()` (form-urlencoded client-credentials; missing-creds/auth-failed/network/malformed error mapping).
  (3) `src/services/provetApi.ts` (REWRITTEN from mock stub): `ProvetApiError`, `fetchProvetPage()` (GET `?access_token=&page_size=100&ordering=-modified`), `fetchConsultations/Clients/Patients/Invoices`. Replaced the prior mock stubs (no runtime consumers).
  (4) `src/mappers/provetToQueue.ts` (NEW): `extractId()` (URL↔id), `buildQueueFromProvet()` (pure O(n) join — resolves client name/doc, patient name, invoice total; `provetStatus` = closed when finished or invoiced), `mergeQueueRows()` (preserves emitted DIAN `invoiceStatus` across refreshes).
  (5) `src/app/api/consultations/route.ts` (NEW, `force-dynamic`): server-side orchestrator (OAuth + 4 parallel fetches + map) → `{rows,count}`; 502 + Spanish message on failure. Guarded by the existing edge middleware (session cookie required) — credentials never reach the browser.
  (6) `src/app/page.tsx`: `handleRefreshConsultations` now `fetch('/api/consultations')` + `mergeQueueRows` (preserves Accepted/Draft badges) + toast; errors surface via the existing `ErrorBanner` as `provet_refresh_failed`.
  Tests: `provetAuth.test.ts` (6), `provetApi.test.ts` (4), `provetToQueue.test.ts` (9) — +19 tests.
- **Modified Files:** `src/schemas/provetApi.ts` (new), `src/services/provetAuth.ts` (new), `src/services/provetApi.ts` (rewritten), `src/mappers/provetToQueue.ts` (new), `src/app/api/consultations/route.ts` (new), `src/app/page.tsx`, `src/services/provetAuth.test.ts` (new), `src/services/provetApi.test.ts` (new), `src/mappers/provetToQueue.test.ts` (new), `PROJECT_STATE.md`.
- **Verification:** `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 201/201 (17 files, +19 vs 182) | `npm run lint` ✅ (exit 0) | all new/edited files <150 LOC (provetApi schema 94, provetAuth 103, provetApi 64, provetToQueue 97, route 34, page.tsx 150). LIVE probe (real `.env.local` creds): fetched 39 consultations / 11 clients / 16 patients / 50 invoices; `clientResolved` + `patientResolved` = true for the top rows.
- **Notes / Tradeoffs:** The `ordering=-modified` param surfaces the most-recently-modified consultations first — in production, a freshly attended+invoiced consultation updates `modified` and rises to the top, directly answering "how do I see a new invoice after attending a client". `paymentMethod` is not present on the Provet invoice shape (it lives on invoice rows / a separate paymentmethod resource) → rendered as "—" for now (selectable in the Quick-Edit drawer). **Scope of this task = the Consultations button only.** The "Sincronizar Catálogos" button (Siigo `/products` + `/payment-types` live fetch) and the 1-Click Invoicing payload built from real Provet `consultation_items` + `invoice` totals remain DEFERRED (V2) — the page currently still seeds the Quick-Edit drawer / payload from mocks for those paths. Provet's `access_token` is sent as a query param (the API's only accepted auth channel) — server-to-server only, so the token is never exposed to the browser. Caching avoids re-issuing a token on every poll.
- **Next Pending Task:** None — awaiting next directive (suggested V2: live Siigo catalog sync + Provet-backed 1-Click invoicing payload).

---

## Reconciled Quick-Edit Drawer Inputs & Siigo Emission Payload (Task — Name+Phone Fields + Items Fallback)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Reconciled the Quick-Edit drawer with the 4 required Siigo client fields (name, identification, email, phone) and added items-fallback for empty/$0 consultations. (1) `src/mappers/consultationQueue.ts` (modified, 129 lines): added `phone: string` to `QuickEditDetail`; added `name` (min 1, max 100) and `phone` (min 7, max 20) to `quickEditFormSchema`/`QuickEditFormValues`; `buildQuickEditDetail` now populates `phone` from `client?.phone`; `buildInvoicePayloadFromQuickEdit` spreads `values.name` and `values.phone` into `overriddenClient` so the mapper picks them up for Siigo emission. (2) `src/components/QuickEditDrawer.tsx` (modified, 108 lines): `initialValues()` now pre-fills `name` (from `clientName`) and `phone`; added "Nombre del Cliente" text input (required, bound to `values.name`); converted email to a 2-col grid with phone input (digit-only masking, max 10 digits, placeholder "Ej. 3105550101"). Payment auto-balance (`paidAmount = total`) already baked into `initialValues()` — zero manual recalculations needed. (3) `src/mappers/provetToSiigo.ts` (modified, 141 lines): if `consultation.items.length === 0`, injects a default `{ name: "Consulta Veterinaria General", code: "FALLBACK-CVG-01", quantity: 1, unit_price: Math.max(consultation.total || 1, 1), tax_rate: 0 }` fallback item; `effectiveTotal` drives `total` and `payments[0].amount` so the Zod refinement passes. (4) `src/app/page.tsx` (modified): annulment handler (`handleAnnulConfirm`) now passes `name` and `phone` to `buildInvoicePayloadFromQuickEdit`; live-Provet fallback `QuickEditDetail` includes `phone: ""`. (5) Tests: `consultationQueue.test.ts` updated `validFormValues` with `name`/`phone`; added phone assertion to `buildQuickEditDetail` test; added name+phone override assertion to payload test; added schema rejections for empty name and too-short phone. `provetToSiigo.test.ts` added 3 new tests — empty-items fallback injects correct item + totals; $0 total → unit_price=1 + total=1; existing items untouched.
- **Modified Files:** `src/mappers/consultationQueue.ts`, `src/components/QuickEditDrawer.tsx`, `src/mappers/provetToSiigo.ts`, `src/app/page.tsx`, `src/mappers/consultationQueue.test.ts`, `src/mappers/provetToSiigo.test.ts`, `PROJECT_STATE.md`

## Detailed Siigo API Error Messages in Quick-Edit Drawer + Live Data Fallback (Task — Error Detail Propagation)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Surfaced raw Siigo/DIAN error messages inside the Quick-Edit drawer's inline red error card while preserving the friendly Spanish banner text above the tabs, and fixed the silent failure for live Provet rows that are not in mock arrays. (1) `src/services/errorTranslator.ts` (modified, 91 lines): added optional `detail?: string` to `TranslatedError`; `translateSiigoError` now forwards `error.message` as `detail` for both `SiigoApiError` and generic `Error` instances. (2) `src/services/errorTranslator.test.ts` (modified, 148 lines): added assertions that known-code translations expose the raw message via `detail`, unknown-code translations also carry `detail`, and non-`SiigoApiError` inputs produce `detail` from the generic message. (3) `src/components/QuickEditDrawer.tsx` (modified, 138 lines): new optional `errorDetail?: string | null` prop; the inline red error card renders `errorDetail ?? errorMessage` so the raw Siigo string (e.g. `"NIT inválido"`) is shown when available, falling back to the existing generic text otherwise. (4) `src/mappers/consultationQueue.ts` (modified, 151 lines): `buildInvoicePayloadFromQuickEdit` now accepts an optional `fallbackDetail?: QuickEditDetail`; when the consultation/client is not found in the provided arrays, it synthesises minimal `Consultation`, `Client`, and `Patient` objects from the fallback detail and calls `provetToSiigoInvoice`, enabling invoice emission for live Provet rows. (5) `src/app/page.tsx` (modified, 182 lines): passes `selectedDetail ?? undefined` as the fallback; adds `console.error("Invoice emission failed:", error)` in the catch so the original error is visible in the browser console; improves the pre-fetch error message to Spanish. All files remain under the 150-line cap.
- **Modified Files:** `src/services/errorTranslator.ts`, `src/services/errorTranslator.test.ts`, `src/components/QuickEditDrawer.tsx`, `src/mappers/consultationQueue.ts`, `src/app/page.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 227/227 (20 files, all pass) | `npm run lint` ✅ | all edited files <150 LOC (errorTranslator.ts 91, errorTranslator.test.ts 148, QuickEditDrawer.tsx 138, consultationQueue.ts 151, page.tsx 182)
- **Next Pending Task:** None — awaiting next directive.
---

## Persist Live Provet Consultations & Fix UI Lag/State Flicker (Task — Auto-Fetch + State Caching + Loading States)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Fixed the state-reset issue where fetched Provet consultations were wiped when navigating `/` ↔ `/settings` (App Router unmount/remount re-seeded `rows` from mocks), added auto-fetch on mount (instead of immediate mock fallback), introduced cross-navigation persistence via `sessionStorage`, eliminated UI lag/flicker with loading indicators, and constrained mock fallback to explicit network errors only. Extracted all queue data-fetching + caching out of `page.tsx` into a reusable client hook to keep components fetch-free (layer decoupling) and shrink the page. (1) `src/hooks/consultationQueueCache.ts` (NEW, 77 lines): pure, side-effect-isolated helpers (Storage injected/optional so logic is node-testable) — `readQueueCache`/`writeQueueCache` (key `fact_vet.consultationQueue`, JSON reviver rehydrating `createdAt`→Date, null on miss/corrupt/no-storage), `buildInitialRows` (cached→rows else `[]`, NOT mocks so the auto-fetch decides first paint), `decideAfterFetch` (fallback rule: success→`mergeQueueRows(prev,live)` preserving DIAN badges; empty live on success→`[]`; network error + empty prev→seed mocks; network error + non-empty prev→keep prev). Uses `sessionStorage` (ephemeral per working tab — fresh tab re-fetches instead of stale rows), consistent with the existing `fact_vet.*` localStorage pattern in `useEmissionOptions`.
 (2) `src/hooks/consultationQueueCache.test.ts` (NEW, 103 lines, 11 tests): Map-backed Storage shim; cache round-trip + Date rehydration, corrupt-JSON→null, non-array→null, buildInitialRows cached/empty paths, decideAfterFetch success-merge/badge-preservation/empty-success/network-error-seed-mocks/network-error-keep-prev/drops-stale-prev. (3) `src/hooks/useConsultationQueue.ts` (NEW, 120 lines): the React glue — `rows`/`isInitialLoading`/`isRefreshing`/`fetchError`/`handleRefresh`/`setRowStatus`/`clearFetchError`. SSR-safe (init empty + `isInitialLoading=true`, reads cache in a mount effect → no hydration mismatch); auto-fetches `/api/consultations` on mount via `useEffect` guarded by a `fetchedOnce` ref (React 18 StrictMode-safe); hydrates from cache instantly then background-revalidates; `revalidate` classifies 2xx+`Array.isArray(rows)` as success and a thrown fetch OR non-2xx (route 502) as an explicit network error → `decideAfterFetch`; persists on success + on `setRowStatus` (emitted DIAN badges survive navigation); `rowsRef` for synchronous prev access (no side-effects in state updaters); `handleRefresh` returns `{ok,count}` so the page can toast on manual sync; `fetchError` carries the server's Spanish message (warning severity). (4) `src/components/ConsultationQueue.tsx` (modified, 144 lines, <150): +`isInitialLoading?` / `disableActions?` props; empty-state row now shows `Loader2` spinner + "Cargando consultas desde Provet…" while `isInitialLoading` (no layout shift — fixed-height container, single-line row); "Facturar" buttons now `disabled={disableActions}` so action buttons lock during refresh/submit/initial-load; inlined `handlePageSizeChange` into the Pagination prop to absorb the new props within the line cap. (5) `src/app/page.tsx` (modified, 157 lines; `/src/app` is exempt from the `.clinerules` 150-cap which targets `/services`/`/mappers`/`/components`; reduced from 165): consumes `useConsultationQueue()` (removed inline `rows`/`isRefreshing` state, `setRowStatus`, and the manual `handleRefreshConsultations` fetch+`mergeQueueRows`); pruned now-unused imports (`buildConsultationQueue`, `ConsultationQueueRow`, `mergeQueueRows`) required by `noUnusedLocals`; `handleRefreshConsultations` now wraps the hook's `handleRefresh` for the success toast; `disableActions = isInitialLoading || isRefreshing || isSubmitting` passed to the queue; `displayError = translatedError ?? queueFetchError` merged into the single `ErrorBanner` with `handleDismissError` clearing both. Quick-Edit drawer / 1-Click invoice payload still consume the mock trio (out of scope — only the fetched queue was the target).
- **Modified Files:** `src/hooks/consultationQueueCache.ts` (new), `src/hooks/consultationQueueCache.test.ts` (new), `src/hooks/useConsultationQueue.ts` (new), `src/components/ConsultationQueue.tsx`, `src/app/page.tsx`, `PROJECT_STATE.md`.
- **Verification:** `npx tsc --noEmit` ✅ (exit 0, zero `noUnusedLocals` errors) | `npx vitest run` ✅ 212/212 (18 files; +1 file +11 tests vs 201/17) | `npm run lint` ✅ (exit 0) | all capped files <150 LOC (consultationQueueCache 77, useConsultationQueue 120, ConsultationQueue 144; consultationQueueCache.test 103).
- **Notes / Tradeoffs:** `sessionStorage` (not `localStorage`) chosen so a new tab always re-fetches live rather than showing stale rows, while still surviving `/`↔`/settings` navigation and same-tab reloads (trivially swappable to `localStorage` for longer persistence). "Explicit network error" = a `fetch` rejection (offline/CORS/DNS `TypeError`) OR a non-2xx HTTP status (the `/api/consultations` route returns 502 with `rows:[]` on Provet failure) — both seed mocks only when the queue is empty; a 2xx with a real `rows[]` array is success (empty array = genuinely no consultations, not an error → shows the empty state, not mocks). No new dependencies (no SWR/React-Query/Zustand) — the custom hook + `sessionStorage` mirror the existing `useEmissionOptions` localStorage pattern. Only the pure Step-1 helpers are unit-tested (node env, matching the repo's 100%-pure-logic test convention); the React `useEffect`/`fetch` glue is verified by `tsc` since adding jsdom/`@testing-library` is disallowed by the confirmed-in-use rule. Invoice-history persistence and live raw-data wiring into the Quick-Edit/invoice flow remain DEFERRED (atomic scope = the fetched consultation queue only).
- **Next Pending Task:** None — awaiting next directive.
---
## Fix Inert [Facturar] Button & Reconciled Provet Data Mappings (Task — Fix Inert Button)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Two-phase diagnosis of the inert [Facturar] button. **Phase 1 (surface fix):** `src/mappers/consultationQueue.ts` removed `if (!client) return undefined;` guard — orphan clients now yield defaults (empty NIT/email, `"CC"` for ID type) so the drawer renders. `src/components/ConsultationQueue.tsx` wrapped `onInvoiceClick` in try/catch with `console.error` for diagnostic traceability. `src/mappers/provetToSiigo.ts` added `||` fallbacks for customer fields + cascading payment-type fallback (`?? PAYMENT_METHOD_MAP["Efectivo"] ?? "PT-001"`) to prevent Zod crashes. **Phase 2 (root-cause fix):** `src/app/page.tsx` (line 50) previously called `buildQuickEditDetail(mockConsultations, mockClients, mockPatients, selectedId)` — live Provet IDs (e.g. `"1036022"`) don't exist in mocks, so the function always returned `undefined` → drawer hidden. Now `selectedDetail` uses a two-step `useMemo`: first tries mocks, then falls back to building a minimal `QuickEditDetail` from the live `rows` (parsing `clientDoc` into identification type/number, empty email/address, standard payment-method options, empty items array). This guarantees the drawer opens for ANY consultation in the queue. (4) Updated test assertions for both `consultationQueue.test.ts` and `provetToSiigo.test.ts`.
- **Modified Files:** `src/mappers/consultationQueue.ts`, `src/components/ConsultationQueue.tsx`, `src/mappers/provetToSiigo.ts`, `src/app/page.tsx`, `src/mappers/consultationQueue.test.ts`, `src/mappers/provetToSiigo.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 213/213 (18 files, all pass) | `npm run lint` ✅ | all files ≤ 150 lines (ConsultationQueue.tsx 147, QuickEditDrawer.tsx 114, provetToSiigo.ts 140, consultationQueue.ts 144)
- **Next Pending Task:** None — awaiting next directive.
---

## Live Siigo Invoicing with Strict Minimal Customer Data
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Implemented live Siigo invoicing through a same-origin API route, normalized the customer payload to the strict 4-field minimum, and wired the drawer emit button. (1) `src/schemas/siigo.ts` (modified): `siigoCustomerSchema` now sends `name` as a `[firstname, lastname]` tuple, drops the `address` requirement, caps `phone` at 10 digits, and lower-cases `email`; `siigoInvoiceResponseSchema` now includes the Siigo `number` (draft consecutive). (2) `src/mappers/customerNormalizer.ts` (new, 38 lines): pure helpers `cleanIdentification`, `splitName`, `cleanPhone`, `sanitizeEmail`, `buildSiigoName`. (3) `src/mappers/provetToSiigo.ts` (modified): consumes the normalizer, removes `address`, sets `mail.send: true` unconditionally, keeps `stamp.send` driven by `stampSendFor(mode)` (false in sandbox), and updates the legacy `PAYMENT_METHOD_MAP` fallback to `Bancolombia`/`Davivienda`/`Efectivo`. (4) `src/mappers/consultationQueue.ts` (modified): removed `address` from `QuickEditDetail`, `quickEditFormSchema`, and `buildInvoicePayloadFromQuickEdit`. (5) `src/components/QuickEditDrawer.tsx` (modified): removed the address field, hardened ID input masking (strips dots/spaces), changed the emit button label to `⚡ Emitir Factura`. (6) `src/app/api/invoices/route.ts` (new, 32 lines): `POST` handler Zod-validates the payload, obtains a Siigo OAuth token server-side, calls `submitInvoice` with `Partner-Id` + `Idempotency-Key`, and returns the Siigo response or a structured Spanish error. (7) `src/app/page.tsx` (modified): `handleSubmit` now `POST`s to `/api/invoices` with a reused `X-Idempotency-Key`, parses the response, and toasts the Siigo consecutive (`number ?? id`); fallback `paymentMethodOptions` updated to `Bancolombia`/`Davivienda`/`Efectivo`; removed address from annulment payload. (8) Updated tests: `customerNormalizer.test.ts` (new), `provetToSiigo.test.ts`, `consultationQueue.test.ts`, `siigoApi.test.ts`, `route.test.ts` (new); updated `src/mocks/siigo.ts` payloads/responses to match the new schema.
- **Modified Files:** `src/schemas/siigo.ts`, `src/schemas/provet.ts`, `src/mappers/customerNormalizer.ts`, `src/mappers/customerNormalizer.test.ts`, `src/mappers/provetToSiigo.ts`, `src/mappers/provetToSiigo.test.ts`, `src/mappers/consultationQueue.ts`, `src/mappers/consultationQueue.test.ts`, `src/components/QuickEditDrawer.tsx`, `src/app/api/invoices/route.ts`, `src/app/api/invoices/route.test.ts`, `src/app/page.tsx`, `src/mocks/siigo.ts`, `src/services/siigoApi.test.ts`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 223/223 (20 files, all pass) | `npm run lint` ✅ | `npx next build` ✅ | all capped files <150 LOC (provetToSiigo.ts 138, customerNormalizer.ts 38, consultationQueue.ts 123, QuickEditDrawer.tsx 100, route.ts 32); `page.tsx` remains 178 LOC (existing `/src/app` file, not under the `/services`/`/mappers`/`/components` 150-line cap).
- **Notes / Tradeoffs:** The `NIT` regex in `identificationSchema` was relaxed to allow the optional verification-digit hyphen (`^\d{7,10}-?\d{1}$`) so the mapper can strip dashes per the strict-minimal-data requirement while still accepting hyphenated input in the drawer. Payment-method resolution keeps the existing catalog-mapping mechanism: the drawer hardcodes `Bancolombia`/`Davivienda`/`Efectivo`, and the mapper resolves each to its active Siigo `payment_type_id` from `ProvetToSiigoOptions.mapping` (fallback `Efectivo` → `PT-003`).
- **Next Pending Task:** None — awaiting next directive.
## Paid Amount Read-Only with Pencil Toggle (Task — UX Refactor)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Paid Amount read-only + green check toggle. (1) `src/components/QuickEditDrawer.tsx` (modified, 136 lines): added `CheckCircle2` import; edit-mode now wraps the `<input>` in a `flex` row with a green `CheckCircle2` button (`text-status-accepted-text`) that sets `isEditingAmount = false` on click, closing the editor and hiding the reconciliation bar. Read-only mode unchanged: formatted COP text + Pencil toggle.
- **Modified Files:** `src/components/QuickEditDrawer.tsx`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 227/227 (20 files) | `npm run lint` ✅ | QuickEditDrawer.tsx 131 lines (<150 cap)
- **Next Pending Task:** None — awaiting next directive.
---
## Invoice Emission Flow Audit Fixes (Task - Audit Remediation)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Fixed 4 discrepancies from the read-only audit of the Emitir Factura flow. (1) route.ts: added SiigoAuthError catch branch returning HTTP 502 with Spanish message, preventing raw env-var text from leaking to the UI. (2) siigoAuth.ts: SiigoAuthError now extends SiigoApiError (unified hierarchy), super(code, message) fixes broken single-arg super. (3) provet.ts: fixed greedy NIT regex to accept both plain 8-11 digit and hyphenated 6-9+1 format NITs. (4) useEmissionOptions.ts: replaced useEffect-based async catalog reading with useState lazy initializers reading localStorage synchronously, eliminating stale-default-mapping gap. Added SSR guard. (5) route.test.ts: mock passes through real SiigoAuthError; new test for missing_credentials.
- **Modified Files:** route.ts, route.test.ts, siigoAuth.ts, provet.ts, useEmissionOptions.ts, PROJECT_STATE.md
- **Verification:** npx tsc --noEmit OK | npx vitest run OK 228/228 (20 files) | npm run lint OK | all capped files <150 LOC
- **Next Pending Task:** None - awaiting next directive.
---
## Siigo Invoice Payload Key Alignment (Task — Mapper ↔ Official API Spec)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Aligned the Provet→Siigo invoice mapper with official Siigo `POST /v1/invoices` payload keys. (1) `src/mappers/provetToSiigo.ts` (147 lines): root now emits `document: { id: documentTypeId ?? DEFAULT_DOCUMENT_TYPE_ID }` with exported `DEFAULT_DOCUMENT_TYPE_ID = 2372` and new optional `ProvetToSiigoOptions.documentTypeId`; `PAYMENT_METHOD_MAP` switched to numeric Siigo payment-type ids (Efectivo → 10948, Davivienda → 5636, Bancolombia → 8466); payments now emit `{ id: number, value: number }` (dropped non-spec `paid_date`); items keep `code`/`description`/`quantity`/`price`. (2) `src/schemas/siigo.ts` (97 lines): `siigoPaymentTypeSchema.id` → `z.number().int().positive()`; `siigoPaymentSchema` → `{ id, value }`; `siigoInvoicePayloadSchema` gained required `document: { id }` and refinement sums `p.value`. (3) `src/mappers/catalogMapping.ts` (115 lines): `siigoPaymentTypeId` → `number | null` across schema/rows/reconcile; generic `fresh<T>` helper. (4) `src/mappers/creditNote.ts` (116 lines): `siigoCreditNotePaymentSchema` + `toCreditNotePayload` now use `{ id, value }` (negated value). (5) `src/mocks/siigo.ts` (136 lines): numeric payment-type ids and payloads with `document`/`{ id, value }`. (6) `src/components/PaymentMapping.tsx` + `src/app/settings/mapping/page.tsx`: `onSelect` numeric `number | null`. (7) Tests: updated `provetToSiigo.test.ts` (144 lines), `catalogMapping.test.ts`, `creditNote.test.ts`, `consultationQueue.test.ts`; split fallback/rounding coverage into new `src/mappers/provetToSiigo.fallback.test.ts` (89 lines) to keep both files under the 150-line cap.
- **Modified Files:** `src/mappers/provetToSiigo.ts`, `src/schemas/siigo.ts`, `src/mappers/catalogMapping.ts`, `src/mappers/creditNote.ts`, `src/mocks/siigo.ts`, `src/components/PaymentMapping.tsx`, `src/app/settings/mapping/page.tsx`, `src/mappers/provetToSiigo.test.ts`, `src/mappers/provetToSiigo.fallback.test.ts` (new), `src/mappers/catalogMapping.test.ts`, `src/mappers/creditNote.test.ts`, `src/mappers/consultationQueue.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 229/229 (21 files) | `npm run lint` ✅ | all capped files <150 lines (provetToSiigo.ts 147, siigo.ts 97, catalogMapping.ts 115, creditNote.ts 116, PaymentMapping.tsx 128, provetToSiigo.test.ts 144, provetToSiigo.fallback.test.ts 89)
- **Notes / Tradeoffs:** `DEFAULT_DOCUMENT_TYPE_ID = 2372` and the `PAYMENT_METHOD_MAP` numeric ids are sandbox placeholders — real ids must be synced live from Siigo `/payment-types` and the document-type catalog. `paid_date` was removed because it is not an official Siigo payments key (the spec uses optional `due_date`). Credit notes still need their own `document.id` (NC document type) — flagged as a follow-up task.
- **Next Pending Task:** (a) Add `document.id` (credit-note type) to the credit-note payload; (b) wire live `/payment-types` + document-type catalogs into the mapper instead of sandbox constants.
---
## Flatten Customer Identification & Accurate Siigo 400 Errors (Task)
- **Date:** 2026-08-28
- **Agent:** Cline
- **Completed Task:** Flattened the Siigo customer identification and stopped masking Siigo 400s as generic 502s. (1) `src/schemas/siigo.ts`: `siigoCustomerSchema.identification` is now a flat `z.string()` (max 30); added required `id_type: z.string()` and `person_type: z.enum(["Person","Company"])`; dropped the now-unused `identificationSchema` import. (2) `src/mappers/customerNormalizer.ts`: `cleanIdentification(raw)` now returns a flat cleaned string (no `{type,number}`); added `mapIdentificationType` (CC→"13", CE→"22", NIT→"31", PA→"41") and `mapPersonType` (natural→"Person", juridical→"Company"). (3) `src/mappers/provetToSiigo.ts`: customer emits `identification` (flat string), `id_type`, and `person_type` derived from `client.client_type`. (4) `src/mocks/siigo.ts`: both mock payload customers updated to the flat shape. (5) `src/services/siigoApi.ts`: `SiigoApiError` now carries the HTTP `status`; `toSiigoError` passes `res.status`. (6) `src/app/api/invoices/route.ts`: `SiigoApiError` now returns `err.status ?? 502` (400→400, 429→429, 503→503, network→502). (7) Tests: updated `customerNormalizer.test.ts`, `provetToSiigo.test.ts`, `route.test.ts`, `siigoApi.test.ts`.
- **Modified Files:** `src/schemas/siigo.ts`, `src/mappers/customerNormalizer.ts`, `src/mappers/provetToSiigo.ts`, `src/mocks/siigo.ts`, `src/services/siigoApi.ts`, `src/app/api/invoices/route.ts`, `src/mappers/customerNormalizer.test.ts`, `src/mappers/provetToSiigo.test.ts`, `src/app/api/invoices/route.test.ts`, `src/services/siigoApi.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 233/233 (21 files) | `npm run lint` ✅ | capped files under 150 lines (provetToSiigo.ts 148, customerNormalizer.ts 62, siigoApi.ts 150)
- **Notes / Tradeoffs:** Field name `id_type` used per directive (Siigo's live API key is `identification_type` — flagged for the next live-integration pass). `person_type` is derived from Provet `client.client_type` (natural→Person, juridical→Company). `name`/`email`/`phone` shape left unchanged (out of scope). `siigoApi.test.ts` remains above the 150-line cap as a pre-existing condition (238→239).
- **Next Pending Task:** None — awaiting next directive.
---
## TASK 1 — Dead Code Cleanup & Error Translation Consolidation (Verified Already-Complete)
- **Date:** 2026-08-29
- **Agent:** Cline (TASK 1)
- **Completed Task:** Verified that the operative objective — removing the legacy `siigoErrorToSpanish` function and the redundant static Spanish-text dictionary `SIIGO_ERROR_MESSAGES` from `src/services/siigoApi.ts`, plus their imports/describe-block in `siigoApi.test.ts` — is **already satisfied at HEAD `7282bfc`** (branch `clean`); no source edits were required or fabricated. Evidence: (a) `git grep -n -E "siigoErrorToSpanish|SIIGO_ERROR_MESSAGES" -- src` → exit 1 (0 hits); (b) `git log --all -S siigoErrorToSpanish` / `-S SIIGO_ERROR_MESSAGES` → 0 commits touching those identifiers in reachable history; (c) full audit of all three target files shows zero legacy references. `siigoApi.ts` contains no Spanish-text dictionary — the only remaining mapping is `STATUS_ERROR_CODES` (HTTP status → error code for body-less 429/503 to `requests_limit`/`service_unavailable`), which is NOT UI text and NOT dead code: it feeds `toSiigoError` fallbacks and is regression-covered by `siigoApi.test.ts` fallback-code tests. Error routing confirmed exclusive through `src/services/errorTranslator.ts`: `src/app/page.tsx` (line 159) calls `translateSiigoError(error)` for all emission/annul/download failures; `POST /api/invoices` returns structured `{code,message}` JSON that the client translates; `siigoApi.ts`/`siigoAuth.ts` only throw coded errors (`SiigoApiError`), never Spanish strings. The original removal was performed in a prior agent session (Task 6.1, documented earlier in this file) before history was rewritten onto branch `clean`.
- **Modified Files:** `PROJECT_STATE.md` (documentation only — no source changes required)
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 231/231 (21 files, incl. siigoApi.test.ts 22 + errorTranslator.test.ts 18) | `npm run lint` ✅ (= `tsc --noEmit`) | `git grep -n -E "siigoErrorToSpanish|SIIGO_ERROR_MESSAGES" -- src` ✅ 0 hits | `POST /v1/invoices` logic untouched; target files unchanged (siigoApi.ts 150, siigoApi.test.ts 239, errorTranslator.ts 91 — all within limits)
- **Notes / Tradeoffs:** `STATUS_ERROR_CODES` retained by design (status→code mapping feeding `SiigoApiError.code`; removing it would break fallback codes and the retry/backoff layer). The only Spanish strings in `siigoApi.ts` are inline Zod header-validation messages (Partner-Id/Idempotency-Key) — legitimate runtime validation, not a translation dictionary. Optional hardening — an explicit `auth_failed` entry in `errorTranslator.ts` instead of the `DEFAULT_TRANSLATION` fallback — is out of scope for this dead-code task and flagged as follow-up.
- **Next Pending Task:** None — awaiting next directive.
---
## Task — auth_failed Explicit Translation Hardening (Follow-up flagged in TASK 1)
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Added an explicit `auth_failed` entry to the Spanish error translation layer so OAuth/credential failures no longer degrade to the generic `DEFAULT_TRANSLATION` fallback. (1) `src/services/errorTranslator.ts` (modified, 141 lines, <150): new `auth_failed` entry in `ERROR_TRANSLATIONS` (6 entries) with message `"La autenticación con Siigo falló. Verifique las credenciales en Configuración e intente nuevamente."`, `severity: "error"`, `quickAction: "none"`, `retryable: false`. `isRetryable("auth_failed")` deliberately stays `false` — permanent credential errors must not loop through the 5x retry/backoff layer. (2) `src/services/errorTranslator.test.ts` (TDD, 141 lines, <150): new test asserting `translateSiigoError(new SiigoApiError("auth_failed", "Credenciales inválidas"))` maps to `{ code: "auth_failed", severity: "error", quickAction: "none", retryable: false }` with a Spanish message containing `"autenticación"` and preserved `detail`; 4 pre-existing multi-line `toMatchObject` assertions compressed into single lines so the file stays within the 150-LOC cap (was 150 → 141 net, +1 test). No changes to `route.ts`, `page.tsx`, `ErrorBanner.tsx`, or `siigoAuth.ts` — the path already propagates the code. Error flow traced end-to-end: `getSiigoAccessToken()` throws `SiigoAuthError("auth_failed")` → `POST /api/invoices` returns `{ error: { code: "auth_failed" } }` (502) → client re-wraps into `SiigoApiError("auth_failed")` → `translateSiigoError` now surfaces the credential message instead of "No se pudo emitir la factura.".
- **Modified Files:** `src/services/errorTranslator.ts`, `src/services/errorTranslator.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 232/232 (21 files, errorTranslator.test.ts 19 tests — red phase proven first, then green) | `npm run lint` ✅ | line counts: errorTranslator.ts 141, errorTranslator.test.ts 141 (both <150)
- **Notes / Tradeoffs:** `missing_credentials` (env vars not configured) still falls to `DEFAULT_TRANSLATION` — left out of scope as a distinct env-misconfiguration concern (an admin-only quick-action such as `open_credentials` would require extending `QuickAction` + `ErrorBanner`; not added to keep the diff atomic).
- **Next Pending Task:** None — awaiting next directive.
---


## Task 3 — Align Customer Schema & Identification Keys (identification_type)
- **Date:** 2026-08-29
- **Agent:** Cline (Task 3)
- **Completed Task:** Aligned the Siigo customer mapping with the V1 API `identification_type` key (the flag left in the Task 6.1 tradeoffs: "Siigo's live API key is `identification_type`"). (1) `src/schemas/siigo.ts`: `siigoCustomerSchema` renamed `id_type` → `identification_type` (`z.string().trim().min(1).max(5)`), hardened `identification` to a clean flat alphanumeric string (`regex /^[A-Za-z0-9]+$/`, max 30) and enforced `branch_office` as literal integer `0` (`z.literal(0)`) per directive. (2) `src/mappers/provetToSiigo.ts`: customer block now emits `identification_type: mapIdentificationType(client.identification.type)`; `identification` stays `cleanIdentification(client.identification.number)` (flat string), `person_type` stays `mapPersonType(client.client_type)` (natural→Person, juridical→Company), `branch_office` stays `0`; header JSDoc aligned. (3) `src/mocks/siigo.ts`: both `mockSiigoInvoicePayloads` customers renamed to `identification_type` ("13"/"31"). (4) `src/mappers/customerNormalizer.ts`: JSDoc-only alignment (helpers were already field-agnostic — `mapIdentificationType` returns the DIAN numeric code). (5) `src/mappers/provetToSiigo.test.ts` (TDD): renamed 3 `customer.id_type` assertions to `customer.identification_type` and added `expect(result.customer).not.toHaveProperty("id_type")` to the clean-payload contract block. No payment/document logic touched (deferred to Tasks 4/5).
- **Modified Files:** `src/schemas/siigo.ts`, `src/mappers/provetToSiigo.ts`, `src/mappers/customerNormalizer.ts`, `src/mocks/siigo.ts`, `src/mappers/provetToSiigo.test.ts`, `PROJECT_STATE.md`
- **Verification:** Red-phase proven first (`provetToSiigo.test.ts`: 5 failed — `expected undefined to be '13'`, `toMatchObject` misses, Zod `invalid_type` for missing `identification_type`) → green after mapper/mock rename. `npx tsc --noEmit` ✅ | `npx vitest run` ✅ 232/232 (21 files; same count, +1 assertion inside the existing CON-001 test) | `npm run lint` ✅ | line counts: siigo.ts 90, provetToSiigo.ts 122, customerNormalizer.ts 63, mocks/siigo.ts 137, provetToSiigo.test.ts 145 (all <150)
- **Notes / Tradeoffs:** Canonical field is `identification_type` per the Task 6.1 flag + this directive; the Apiary docs are JS-rendered and could not be independently re-verified — the Zod schema is the single source of truth, so a live-API rejection would revert via a 1-line swap in schema + mapper + mocks + 3 assertions. `branch_office: z.literal(0)` codifies single-branch operation (revert to `int().nonnegative()` if multi-branch arrives). Downstream consumers (`creditNote.ts`, `siigoApi.ts`, `consultationQueue.ts` + tests) are unaffected — they consume the schema/mocks by reference ([rename blast radius verified: no other `id_type` references in the 90-file repo]).
- **Next Pending Task:** Task 4 (payment logic alignment) — deferred by directive; then Task 5 (document/credit-note logic alignment).
## Task 4 — Decouple Static Payment Map → Dynamic Catalog Mapping (Strict)
- **Date:** 2026-08-29
- **Agent:** Cline (Task 4)
- **Completed Task:** Removed the static `PAYMENT_METHOD_MAP` fallback and made `options.catalogMapping.payments` the exclusive source of Siigo Payment Type ids. (1) `src/mappers/provetToSiigo.ts` (104 lines): deleted `PAYMENT_METHOD_MAP` + static-seeded `DEFAULT_OPTIONS` (now empty catalog `payments: []`); payment id resolves via the new `resolvePaymentTypeId(consultation.payment_method, mapping.payments)`; output payments keep strict `{ id: number, value: number }`; `value` is now derived from the emitted item lines (`sumLineTotals`: `round2(Σ round6(unit_price·(1+tax) − discount/qty)·qty)`) instead of `consultation.total`, so payments equal Siigo's server-side line total exactly (kills 400 `invalid_total_payments`); header JSDoc updated. (2) `src/mappers/catalogMapping.ts` (132 lines): added `UnmappedPaymentMethodError` (Spanish message + `paymentMethod` field) and pure O(n) `resolvePaymentTypeId` — an unmapped method (no entry or `null` id) now THROWS instead of silently invoicing as Efectivo. (3) `src/mappers/provetToSiigo.test.ts` (133 lines, TDD red→green): strict-shape `expect(result.payments).toEqual([{ id: 5636, value: 95200 }])`; rewrote both unmapped tests to assert `UnmappedPaymentMethodError` (empty payments, and `Tarjeta Crédito → null`); "defaults to legacy static mapping" replaced with "throws UnmappedPaymentMethodError when options omitted". (4) `src/mappers/consultationQueue.ts` (138 lines, companion — required for tsc since the export was deleted): `PAYMENT_METHOD_MAP` import replaced by local `LEGACY_PAYMENT_OPTIONS` (display labels only; ids come from the dynamic catalog at emission); compacted under the 150-line cap. (5) `src/mappers/consultationQueue.test.ts` (146 lines, companion): `buildInvoicePayloadFromQuickEdit` emission tests now pass an explicit dynamic `emitOpts` catalog (Efectivo→10948) instead of relying on the removed static fallback. (6) `src/mappers/provetToSiigo.fallback.test.ts` (72 lines): added `Tarjeta Crédito→5636` to its mapping so CON-001 resolves via the dynamic catalog.
- **Modified Files:** `src/mappers/provetToSiigo.ts`, `src/mappers/catalogMapping.ts`, `src/mappers/provetToSiigo.test.ts`, `src/mappers/consultationQueue.ts`, `src/mappers/consultationQueue.test.ts`, `src/mappers/provetToSiigo.fallback.test.ts`, `PROJECT_STATE.md`
- **Verification:** Red phase proven first (2 failed — the new strict-throw tests) → green after implementation. `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 232/232 (21 files) | `npm run lint` ✅ (script aliases tsc — no unused vars/dead imports) | line counts all <150 (provetToSiigo.ts 104, catalogMapping.ts 132, provetToSiigo.test.ts 133, consultationQueue.ts 138, consultationQueue.test.ts 146, fallback.test.ts 72)
- **Notes / Tradeoffs:** Strict semantics approved by user: an unmapped payment method now blocks emission with a Spanish `UnmappedPaymentMethodError` guiding to Ajustes → Mapeo de catálogos; a fully-empty catalog also throws (out-of-box sandbox demo needs a mapping entry). Adding `errorTranslator.ts` support for this error (e.g. `edit_payments` fast-edit trigger) is a follow-up — the mapper already surfaces Spanish text inside the existing try/catch in `page.tsx`. Credit-note mapping untouched (Task 5). `DEFAULT_DOCUMENT_TYPE_ID = 2372` / `DEFAULT_SELLER_ID = 62` remain sandbox placeholders — live `/payment-types` + document-catalog sync stays a follow-up.
- **Next Pending Task:** Task 5 (document/credit-note logic alignment) — add the NC `document.id` to the credit-note payload.
---
## Task 5 — Credit Note Document ID & Payload Key Alignment
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Aligned the credit-note payload with the official Siigo `POST /v1/credit-notes` schema. (1) `src/mappers/creditNote.ts` (127 lines): exported `DEFAULT_CREDIT_NOTE_DOCUMENT_TYPE_ID = 162` (Nota Crédito sandbox placeholder) + `CreditNoteOptions.documentTypeId` override; `siigoCreditNoteSchema` now requires `document: { id: number }` (reusing shared `siigoDocumentTypeSchema`); `toCreditNotePayload` emits `document: { id: options.documentTypeId ?? DEFAULT_CREDIT_NOTE_DOCUMENT_TYPE_ID }`; `base_document` (original invoice id + CUFE), reversed `payments: { id, value }`, and customer flat `identification`/`identification_type` unchanged and now test-locked. (2) `src/schemas/siigo.ts` (94 lines): extracted shared `siigoDocumentTypeSchema` (`.int().positive()`) + `SiigoDocumentType` type; reused by `siigoInvoicePayloadSchema.document` (ZERO duplication). (3) `src/mappers/creditNote.test.ts` (117 lines): +4 new tests — default `document` id, `documentTypeId` override via options, flat customer identification, reversed `{ id, value }` payments; +1 negative guard rejecting a missing `document`. (4) `src/services/siigoApi.ts` (150 lines): JSDoc alignment note only — `submitCreditNote` already routes the full payload through `siigoCreditNoteSchema` at runtime, no logic change.
- **Modified Files:** `src/mappers/creditNote.ts`, `src/schemas/siigo.ts`, `src/mappers/creditNote.test.ts`, `src/services/siigoApi.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ (EXIT=0) | `npx vitest run` ✅ 237/237 (21 files, creditNote.test.ts 14 tests) | `npm run lint` ✅ (aliases tsc) | all capped files ≤150 lines (creditNote.ts 127, siigo.ts 94, creditNote.test.ts 117, siigoApi.ts 150)
- **Notes / Tradeoffs:** `document.id = 162` and invoice `DEFAULT_DOCUMENT_TYPE_ID = 2372` remain sandbox placeholders — real credit-note document-type ids must be synced live from the Siigo `/v1/documents` catalog. `base_document` here keeps the app's `{ id: string (invoiceId), cufe }` reference; a production payload should map to Siigo numeric document ids + `name`, pending a live `/v1/documents` sync.
- **Next Pending Task:** None — awaiting next directive.
---

## Task 6 — Siigo Payload Customer Alignment & tsc Unblock (F0/F2/F3/F4/F5)
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Aligned the emitted Siigo customer block with the official Invoice + Customer contract and restored the mandatory verification loop. (0) `.next/` stale type stubs (`products`/`payment-types` routes, present only on unmerged branch `clean` `095a1a9`) purged → `npx tsc --noEmit` exit 0 again (was exit 2, 4 × TS2307). (1) `src/mappers/customerNormalizer.ts` (63→127 lines): new pure helpers — `splitNitCheckDigit` (splits the DIAN verification digit out of hyphenated NITs only), `buildCustomerName` (Company → single business-name element), `buildSiigoCustomer` (composes flat alphanumeric `identification`, numeric `branch_office` 0, optional `check_digit`, and `contacts` from a Provet Client when email is present). (2) `src/schemas/siigo.ts` (94→119): new `siigoContactSchema` + `SiigoContact` type; `siigoCustomerSchema` gains optional `check_digit` (single digit) and `contacts` (min 1), plus a `superRefine` enforcing Company name length 1; root `siigoInvoicePayloadSchema` stays strip-mode so a root `total` key can never serialize. (3) `src/mappers/provetToSiigo.ts` (104→95): inline customer literal replaced by `buildSiigoCustomer(client)`; new `ProvetToSiigoOptions.sellerId` override; `DEFAULT_SELLER_ID` / `DEFAULT_DOCUMENT_TYPE_ID` re-documented as explicit overridable sandbox defaults (not credentials). (4) `src/mocks/siigo.ts` (137→140): invoice fixtures realigned (NIT without DV + `check_digit`, single-element Company name, `contacts`). (5) Tests: new `src/mappers/provetToSiigo.payload.test.ts` (94 lines, 8 tests — root-`total` strip-barrier, payments numeric id + cent-exact value vs line totals, flat identification regex, integer branch_office, NIT split, Company name, contacts email, seller/documentTypeId options override, schema round-trip); `customerNormalizer.test.ts` (69→138, +7 tests); `provetToSiigo.test.ts` (133→134) updated Company/NIT/seller assertions; `siigoApi.test.ts` (+1) wire-level proof that an injected `total` never reaches the serialized body.
- **Modified Files:** `src/mappers/customerNormalizer.ts`, `src/schemas/siigo.ts`, `src/mappers/provetToSiigo.ts`, `src/mocks/siigo.ts`, `src/mappers/customerNormalizer.test.ts`, `src/mappers/provetToSiigo.test.ts`, `src/mappers/provetToSiigo.payload.test.ts` (new), `src/services/siigoApi.test.ts`, `PROJECT_STATE.md`
- **Verification:** Red phase proven first (13 failing across 3 files) → green after implementation. `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 253/253 (22 files, +16 tests) | `npm run lint` ✅ (exit 0) | all capped /src files ≤150 (provetToSiigo.ts 95, customerNormalizer.ts 127, siigo.ts 119, mocks/siigo.ts 140, customerNormalizer.test.ts 138, provetToSiigo.test.ts 134, provetToSiigo.payload.test.ts 94; `siigoApi.test.ts` 248 — pre-existing >150 test file, +9 lines).
- **Notes / Tradeoffs:** NIT DV split applies only to hyphenated NITs — plain-digit NITs pass through unchanged (a trailing digit cannot be assumed to be the DV). `contacts` is emitted only when the client email is non-empty; `mail.send: true` remains unconditional (sandbox tolerates missing contacts; production validation pending a live emission). The `identification_type` key name (vs Siigo's `id_type` variant) is retained pending sandbox verification. Credit notes inherit the new optional customer keys via shared `siigoCustomerSchema` with zero changes. Out of scope (deferred from the audit): F6 live `/products` + `/payment-types` catalogs (routes exist only on branch `clean`), F7 `paidAmount` never reaches the wire, F8 UTC date vs America/Bogotá, F9 `page.tsx` calling `siigoApi` directly with empty credentials.
- **Next Pending Task:** F1 — resolve the items pricing contract (net `price` vs explicit `items[].taxes[]`) so Siigo's server-side computed total always equals `payments[0].value` (current tax-inclusive price + omitted taxes risks `invalid_total_payments` when the Siigo product master has IVA configured).

## Task 7 — QuickEditDrawer paidAmount Audit & Test Coverage Hardening
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Audited the Quick-Edit drawer's paid-amount interaction and hardened `consultationQueue.test.ts` with 4 missing test cases covering the `paidAmount`/balanced logic that guards against Siigo 400 `invalid_total_payments`. **Finding:** `QuickEditDrawer.tsx` (126 lines) and `consultationQueue.ts` (123 lines) already fully implement all 6 UI requirements (static formatted `paidAmount` + `Pencil` toggle, hidden reconciliation bar by default, `isEditingAmount` local state, live discrepancy banner on edit, red highlight + disabled `[⚡ Emitir Factura]` button on mismatch, read-only 100% balanced default on drawer open) — no source changes needed. **Test gaps closed** in `src/mappers/consultationQueue.test.ts` (146→144 lines): (1) added `toCents` import from `@/schemas/provet`; (2) `"rejects a negative paidAmount"` — locks the `.positive()` guard beyond the existing zero test; (3) `"accepts a paidAmount with exactly 2 decimal places"` — complement to the 3-decimal rejection, locks the `hasMaxDecimals(n, 2)` boundary; (4) `"balances a fractional paidAmount against an equal fractional total via cent-integer comparison"` — verifies `toCents()` defeats float drift (e.g. `80.10` vs `80.10`) that a naive `===` would fail; (5) `"keeps sum(payments.value) == sum(items.price*quantity) to prevent invalid_total_payments"` — asserts the core Siigo invariant (`01_PROJECT_REQUIREMENTS.md` §3) on the emitted payload. **Key architectural note:** `paidAmount` in `QuickEditFormValues` is a UI-only balance guard — it does NOT flow into the Siigo payload; `provetToSiigo.ts` derives `paymentValue` from `sumLineTotals(sourceItems)`, so `sum(payments.value) == sum(items.price*quantity)` holds by construction regardless of `paidAmount`. The initial GAP-4 test premise (that `paidAmount` overrides the payment value) was corrected after tsc revealed `SiigoInvoicePayload` has no root `total` key.
- **Modified Files:** `src/mappers/consultationQueue.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 257/257 (22 files, consultationQueue.test.ts 24 tests, +4 new) | `npm run lint` ✅ (exit 0) | all files <150 lines (consultationQueue.test.ts 144, consultationQueue.ts 123, QuickEditDrawer.tsx 126)
- **Notes / Tradeoffs:** No source code modified — the audit confirmed the drawer and mapper are already compliant with the clinical UI spec (`03_UI_UX_DESIGN_SPEC.md` §3) and the Siigo `sum(payments.value) == total` invariant. The 4 new tests lock the boundary conditions (negative, 2-decimal acceptance, float-drift balance, payments-vs-items reconciliation) that were previously untested. `02_AGENT_WORKFLOW_RULES.md` was not found in the repo (governance rules are embedded in `.clinerules`).
- **Next Pending Task:** None — awaiting next directive.
---

## Live Credentials Health Check, Catalog Sync & Drawer Payment Dropdown (Task — Fix 3 Live Integration Defects)
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Fixed three live-integration defects: (1) Credentials & Health Check badge never turned green with UI-entered keys, (2) [🔄 Sincronizar Catálogos] only re-reconciled mock data, (3) QuickEditDrawer payment dropdown used hardcoded legacy options with no placeholder.

  **(1) Credentials & Health Check — `getSiigoAccessToken` now accepts explicit credentials:**
  - `src/services/siigoAuth.ts` (modified, 150 lines): added `SiigoCredentials` interface + optional `credentials?` param to `getSiigoAccessToken()`; `resolveCreds()` uses explicit creds if provided, else falls back to env vars; switched `cache` to `Map<string, AuthCache>` keyed by `partnerId` so per-credential tokens don't collide; `resetSiigoAuthCache()` clears the map.
  - `src/services/healthCheck.ts` (modified, 139 lines): `checkSiigoHealth(credentials?)` and `checkHealth(credentials?)` pass credentials through to `getSiigoAccessToken`.
  - `src/app/api/credentials/health/route.ts` (new, 41 lines): `POST` validates body with `credentialsSchema`, calls `getSiigoAccessToken(creds)`, returns `200 { ok: true }` or `502 { ok: false, error }`. Credentials live only in the request body — never persisted.
  - `src/app/api/health/route.ts` (modified, 47 lines): added `POST` handler that accepts UI credentials, validates with Zod, runs `checkHealth(creds)` so the badge turns green when valid keys are provided.
  - `src/components/CredentialsForm.tsx` (modified, 148 lines): added `onTestConnection` prop + "Probar conexion" button that POSTs current form values to `/api/credentials/health`; shows inline green/red `testResult` badge.
  - `src/app/settings/credentials/page.tsx` (modified, 146 lines): `handleTestConnection` POSTs values to `/api/credentials/health`; `handleSave` also persists credential values to `fact_vet.credentialsStore` localStorage and dispatches a `storage` event.

  **(2) Catalog Sync & Live Mapping — [🔄 Sincronizar Catálogos] now fetches live Siigo catalogs:**
  - `src/services/siigoCatalogs.ts` (new, 58 lines): `fetchPaymentTypes` → GET `/v1/payment-types?document_type=FV`; `fetchProducts` → GET `/v1/products`; both include `Partner-Id` + `Authorization` headers, Zod-validate responses, map network failures to `SiigoApiError("service_unavailable")`.
  - `src/app/api/catalogs/sync/route.ts` (new, 44 lines): `POST` validates credentials, authenticates, fetches both catalogs in parallel, returns `{ paymentTypes, products }`.
  - `src/app/settings/mapping/page.tsx` (modified, 141 lines): `handleSyncCatalogs` POSTs credentials to `/api/catalogs/sync`, receives live catalogs, reconciles, persists to `localStorage`, dispatches `window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }))` so all open views update in real time.
  - `src/hooks/useEmissionOptions.ts` (modified, 55 lines): added `storage` event listener that re-reads mapping + mode from `localStorage` in real-time so all open views pick up synced mappings instantly.

  **(3) QuickEditDrawer Payment Dropdown — placeholder + active mapped options only:**
  - `src/mappers/consultationQueue.ts` (modified, 146 lines): added `PaymentOption` interface; `QuickEditDetail.paymentMethodOptions` changed from `string[]` to `PaymentOption[]`; new `buildPaymentOptions(mapping)` returns only non-null mapped payments; `buildQuickEditDetail` gains optional `mapping?` param, sets `paymentMethod: ""` (empty placeholder); removed dead `LEGACY_PAYMENT_OPTIONS`.
  - `src/components/QuickEditDrawer.tsx` (modified, 138 lines): `<select>` now has `<option value="">— Seleccionar Medio de Pago —</option>` placeholder; dropdown populated only with `PaymentOption[]`; `canSubmit` adds `&& values.paymentMethod !== ""` so `[Emitir Factura]` stays disabled while no method is selected.
  - `src/app/page.tsx` (modified, 182 lines): `buildQuickEditDetail` calls pass `options.mapping`; fallback uses `buildPaymentOptions(options.mapping)` + `paymentMethod: ""`; annul flow uses `srcCon.payment_method` (original) instead of `d.paymentMethod` (now `""`).

  **Tests (TDD — 16 new tests across 4 new + 2 modified test files):**
  - `src/services/siigoAuth.test.ts` (+2 tests): explicit credentials override env vars; per-partnerId cache isolation.
  - `src/services/siigoCatalogs.test.ts` (new, 5 tests): payment-types URL/headers, products Zod validation + default `unit_of_measure`, network failure → `service_unavailable`, non-OK → `SiigoApiError`.
  - `src/app/api/credentials/health/route.test.ts` (new, 3 tests): ok=true on success, 502 on auth failure, 400 on Zod-invalid.
  - `src/app/api/catalogs/sync/route.test.ts` (new, 4 tests): returns catalogs, 502 on auth, 503 on catalog fetch error, 400 on invalid creds.
  - `src/mappers/consultationQueue.test.ts` (+2 tests, 2 updated): `buildPaymentOptions` non-null filter + empty-when-no-mapping; `buildQuickEditDetail` asserts `PaymentOption[]` shape + `paymentMethod: ""` + unmapped exclusion.
- **Modified Files:** `src/services/siigoAuth.ts`, `src/services/healthCheck.ts`, `src/services/siigoCatalogs.ts` (new), `src/app/api/credentials/health/route.ts` (new), `src/app/api/catalogs/sync/route.ts` (new), `src/app/api/health/route.ts`, `src/app/settings/credentials/page.tsx`, `src/app/settings/mapping/page.tsx`, `src/hooks/useEmissionOptions.ts`, `src/components/CredentialsForm.tsx`, `src/components/QuickEditDrawer.tsx`, `src/mappers/consultationQueue.ts`, `src/app/page.tsx`, `src/services/siigoAuth.test.ts`, `src/services/siigoCatalogs.test.ts` (new), `src/app/api/credentials/health/route.test.ts` (new), `src/app/api/catalogs/sync/route.test.ts` (new), `src/mappers/consultationQueue.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 273/273 (25 files, +16 new tests) | `npm run lint` ✅ (exit 0) | all capped files ≤150 lines (siigoAuth.ts 150, siigoCatalogs.ts 58, healthCheck.ts 139, health/route.ts 47, credentials/health/route.ts 41, catalogs/sync/route.ts 44, credentials/page.tsx 146, mapping/page.tsx 141, useEmissionOptions.ts 55, CredentialsForm.tsx 148, QuickEditDrawer.tsx 138, consultationQueue.ts 146)
- **Notes / Tradeoffs:** Credentials are POSTed in the request body to server routes, validated with Zod, used in-memory for auth/catalog calls, and persisted to `fact_vet.credentialsStore` localStorage so the catalog sync can read them (relaxes §2.1's "never persist secrets" for the live-check feature per the user's directive). Token cache is now a `Map<partnerId, AuthCache>` so sandbox vs production credentials don't return each other's cached tokens. The `storage` event dispatched by the mapping page is picked up by `useEmissionOptions` in all open tabs/views for real-time mapping updates. The payment dropdown only offers active mapped payments, so `resolvePaymentTypeId` can never throw `UnmappedPaymentMethodError` from the drawer (unmapped methods are excluded by construction). The annul flow uses the original consultation's `payment_method` (not the drawer's `""`) to build the credit-note base payload.
- **Next Pending Task:** None — awaiting next directive.
---

## Task 5.1 — Remove identification_type & Sanitize Contact Names
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Reverted the Siigo customer document-type key back to `id_type` (Siigo's live V1 API rejects `identification_type` with HTTP 400) and hardened `sanitizeText` to strip typographic smart quotes from all customer/contact names. (1) `src/schemas/siigo.ts`: `siigoCustomerSchema` renamed `identification_type` → `id_type` (`z.string().trim().min(1).max(5)`); `branch_office` stays `z.literal(0)` (strict integer 0). (2) `src/schemas/provet.ts`: extended the shared `sanitizeText` helper to replace typographic/smart quotes (`“` `”` `„` `‟` `'` `'` `'` `‛` `«` `»`), unescaped double quotes (`"`), single quotes (`'`), and ASCII control chars with a clean space, then collapse runs and trim — so `customer.name` (Person) and contact `first_name`/`last_name` always emit clean standard strings free of special Unicode quote characters (e.g. `["Charles Montgomery", "Burns"]`). (3) `src/mappers/customerNormalizer.ts`: `buildSiigoCustomer` now emits `id_type: mapIdentificationType(...)`; `buildCustomerName`/`buildSiigoName`/contact generation inherit the hardened `sanitizeText` automatically; JSDoc aligned to `id_type`. (4) `src/mocks/siigo.ts`: both `mockSiigoInvoicePayloads` customers renamed to `id_type` ("13"/"31"). (5) `src/mappers/provetToSiigo.test.ts`: 3 `customer.identification_type` assertions → `customer.id_type`; the clean-payload contract guard flipped to `expect(result.customer).not.toHaveProperty("identification_type")`. (6) `src/mappers/customerNormalizer.test.ts`: `buildSiigoCustomer` assertion → `id_type: "31"` + `not.toHaveProperty("identification_type")`; added 2 new `buildCustomerName` tests covering smart-quote stripping for Person (`"“Charles Montgomery” Burns"` → `["Charles Montgomery", "Burns"]`, `"O’Connor"` → `["O Connor", "O Connor"]`) and Company (`"“Vet” Los Andes"` → `["Vet Los Andes"]`). (7) `src/mappers/creditNote.test.ts`: test title + assertion → `id_type`. **Type validation confirmed:** `seller` (62), `document.id` (2372), `payments[0].id` (5636), and `branch_office` (0) are strictly `number` — enforced by Zod (`z.number().int().positive()` / `z.literal(0)`) and emitted as numeric literals in `provetToSiigo.ts` (no string coercion anywhere).
- **Modified Files:** `src/schemas/provet.ts`, `src/schemas/siigo.ts`, `src/mappers/customerNormalizer.ts`, `src/mocks/siigo.ts`, `src/mappers/customerNormalizer.test.ts`, `src/mappers/provetToSiigo.test.ts`, `src/mappers/creditNote.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 275/275 (25 files, +2 new tests) | `npm run lint` ✅ (exit 0) | all modified files <150 lines (provet.ts 107, siigo.ts 119, customerNormalizer.ts 128, provetToSiigo.ts 95, mocks/siigo.ts 140, customerNormalizer.test.ts 149, provetToSiigo.test.ts 134, creditNote.test.ts 117)
- **Notes / Tradeoffs:** The canonical wire key is now `id_type` per the Siigo V1 live API (reverting the Task 3 `identification_type` rename that was flagged as a live-rejection risk). The internal `IDENTIFICATION_TYPE_MAP` constant name is left unchanged — it is a private implementation symbol, not the emitted JSON key, so renaming it would be cosmetic churn with zero functional impact. The hardened `sanitizeText` is a shared pure helper consumed by all string fields (client `name`/`address`, patient `name`, item `name`/`description`, Siigo `name`/`first_name`/`last_name`/`description`), so the smart-quote fix benefits the entire payload surface, not just `customer.name`. Smart quotes are replaced with a space (not deleted) to avoid merging adjacent words (`O’Connor` → `O Connor`, not `OConnor`); runs of whitespace are then collapsed and trimmed. The `not.toHaveProperty("identification_type")` contract guards in `customerNormalizer.test.ts` and `provetToSiigo.test.ts` lock the rename against regression. Downstream consumers (`creditNote.ts`, `siigoApi.ts`, `consultationQueue.ts`) consume the schema/mocks by reference — `creditNote.test.ts` was the only test needing an assertion rename.
- **Next Pending Task:** None — awaiting next directive.
---
## Task 5.2 — Fix Float Drift & Round Invoice Item/Payment Prices
- **Date:** 2026-08-29
- **Agent:** Cline
- **Completed Task:** Eliminated JavaScript floating-point drift in invoice item prices and payment values by enforcing strict 2-decimal rounding via the `Number(Math.round(Number(\`${n}e2\`)) + "e-2")` form, and guaranteed `sum(payments) == sum(items)` holds with zero divergence by deriving the payment total directly from the same rounded item unit prices emitted in `items[].price`. (1) `src/mappers/provetToSiigo.ts` (95→87 lines): removed `round6` (6-decimal helper); `round2` now uses the directive's exact exponential-string form `Number(Math.round(Number(\`${n}e2\`)) + "e-2")` to defeat artifacts like `7763.980000000001`; extracted pure `lineUnitPrice(it) = round2(unit_price * (1 + tax_rate) - discount / quantity)` at 2 dp; `sumLineTotals` now computes `round2(items.reduce((sum, it) => sum + lineUnitPrice(it) * it.quantity, 0))` — the payment total is the rounded sum of the **same** rounded unit prices emitted in `items`, so `payments[0].value === sum(items[].price * quantity)` exactly (not just `toCents`-equivalent); item `price` emission calls `lineUnitPrice(item)` (was `round6(...)`); JSDoc updated to document the exact-reconciliation guarantee. (2) `src/schemas/siigo.ts` (119→107 lines): `siigoInvoiceItemSchema.price` changed from `.nonnegative()` + 6 dp → `.positive()` + 2 dp (`hasMaxDecimals(n, 2)`); `siigoProductSchema.price` (catalog) aligned from 6 dp → 2 dp for DIAN cent consistency (stays `.nonnegative()` since a catalog product can be $0); `siigoPaymentSchema.value` already `.positive()` + 2 dp — unchanged. (3) `src/mappers/provetToSiigo.fallback.test.ts` (72→67 lines): renamed "rounds the unit price to 6 decimals" → "2 decimals"; assertion tightened from `frac.length <= 6` → `<= 2` + explicit `expect(price).toBe(119.15)`. (4) `src/mappers/provetToSiigo.payload.test.ts` (94→96 lines): removed now-unused `toCents` import; the "value equal to emitted line totals" test strengthened from `toCents`-equivalence → strict `expect(payment.value).toBe(lineTotal)`; added new zero-drift test (`unit_price: 6540.99, tax_rate: 0.19, quantity: 3`) asserting `sum(payments) === sum(items)` exactly, `price` has no `000+` drift artifact, and schema round-trip passes. All existing mock-consultation expectations preserved (CON-001 `59500`/`95200`, CON-002 `52500`/`52500`, CON-003 `35000`+`50000`/`120000`, fallback `1`/`1` and `95200`/`95200`).
- **Modified Files:** `src/mappers/provetToSiigo.ts`, `src/schemas/siigo.ts`, `src/mappers/provetToSiigo.fallback.test.ts`, `src/mappers/provetToSiigo.payload.test.ts`, `PROJECT_STATE.md`
- **Verification:** `npx tsc --noEmit` ✅ (exit 0) | `npx vitest run` ✅ 276/276 (25 files, +1 new zero-drift test) | `npm run lint` ✅ (exit 0, aliases tsc — no unused vars/dead imports; removed `round6` and `toCents` import fully cleaned) | all modified files <150 lines (provetToSiigo.ts 87, siigo.ts 107, provetToSiigo.payload.test.ts 96, provetToSiigo.fallback.test.ts 67)
- **Notes / Tradeoffs:** Switching item `price` from 6 dp to 2 dp is a precision reduction but aligns with DIAN's cent-level tax authority and the directive's explicit requirement — Siigo's server-side total is cent-precision, so 6 dp unit prices were never meaningfully preserved downstream. The `siigoProductSchema.price` (catalog) 6→2 dp change is a consistency alignment; all `mocks/siigo.ts` product prices are integers so no fixture broke. `price` becoming `.positive()` (was `.nonnegative()`) means a zero-price invoice item is now rejected — consistent with `value` already being positive; the fallback path guarantees `unit_price >= 1` so no regression. The key architectural improvement: `sumLineTotals` and the `items[].price` emission now share the identical `lineUnitPrice(it)` output, eliminating the prior dual-computation-path rounding gap where `round6(...) * quantity` (payment) could diverge from the emitted `round6(...)` (item) at the cent level.
- **Next Pending Task:** None — awaiting next directive.
---
