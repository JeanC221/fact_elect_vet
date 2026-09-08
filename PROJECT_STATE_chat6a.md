# Chat 6a — Autorización en route handlers, saneado y clave de idempotencia

Estado: **completado salvo D1**, que queda bloqueado a la espera de una acción
operativa del propietario (regenerar los hashes de contraseña en Vercel).

Baseline al abrir la sesión: `593 passed (593)` en 42 archivos.
Baseline al cerrarla: **`629 passed (629)` en 44 archivos**, `tsc --noEmit`
limpio, `next build` compilando.

---

## Lo que se hizo

### D0 — Autorización a nivel de route handler (defensa en profundidad)

La autorización vivía **solo** en `middleware.ts`. Un bypass de middleware
(CVE-2025-29927 fue una única cabecera HTTP) alcanzaba `POST /api/invoices` sin
autenticar, y ese endpoint timbra un documento con validez legal ante la DIAN.

Arquitectura en dos capas, siguiendo el precedente de `emissionModeState.ts`:

| Archivo | Papel | Líneas |
|---|---|---|
| `src/mappers/routeAuthz.ts` | Mapper puro. Decide. Sin I/O ni `next/server`. | 80 |
| `src/services/routeGuard.ts` | `requireSession` / `requireAdmin` sobre `NextRequest`. | 66 |
| `src/test/sessionRequest.ts` | Fixture compartido. **No importa `vitest`**: inerte ante `next build`. | 115 |

- Los 13 handlers de `src/app/api/` llevan guard. Antes: **cero**.
- `middleware.ts` conserva **toda** la política de enrutado (`ADMIN_ONLY_RULES`,
  `requiresAdmin`). El guard **no** la re-deriva: no mira ni el path ni el
  método. Dos tests lo fijan (`routeGuard.test.ts`).
- Refactor puro de constantes en `middleware.ts`: los literales
  `"Sesión requerida."` y `"Se requiere rol de administrador."` se movieron al
  mapper. Los 9 tests de `middleware.test.ts` pasan **sin editar el archivo**.
- `req: Request` → `req: NextRequest` en los 13 handlers, para reutilizar
  `req.cookies.get(...)` en lugar de escribir un parser de la cabecera `Cookie`.

**Riesgo cubierto que la red de tests previa no veía:** `middleware.test.ts` no
ejecuta los handlers, así que aplicar `requireAdmin` por error al
`GET /api/emission-mode` habría dejado sus 9 tests en verde mientras cada
dispositivo de recepción caía al `sandbox` por defecto y emitía facturas sin
timbrar. Los dos lados de la asimetría se asertan ahora **desde
`emission-mode/route.test.ts`**: empleado `GET` → 200, empleado `PUT` → 403,
más la comprobación de que el `PUT` rechazado no toca la base de datos.

**Mutación (4 mutantes, 4 muertos)** sobre `routeAuthz.ts`: invertir el orden
sesión/rol (2 fallos), neutralizar el gate de rol (3), alterar un literal
compartido (4), filtrar `status` al cuerpo (5).
Observación: la deriva del literal **no** rompe `middleware.test.ts`, cuyos
asserts usan `toMatchObject({ error: { code } })` y nunca fijan el `message`.
El mensaje del middleware queda pinado únicamente por el test del mapper.

### D5 — Saneado de `description` en nota crédito

La premisa del prompt original era falsa por partida doble.

1. **Sí hay regla publicada.** Siigo documenta el error `invalid_description`
   con una clase de caracteres que **no incluye la comilla simple** ni los
   caracteres de control.
2. **El riesgo no era teórico.** `POST /api/credit-notes` parsea
   `siigoCreditNoteSchema` **directamente del cuerpo enviado por el cliente**
   (`credit-notes/route.ts:20`); no pasa obligatoriamente por `buildCreditNote`
   ni por una factura ya saneada.

`siigoCreditNoteItemSchema.description` pasa de `z.string().trim().min(1)` a
`sanitizedText({ max: 200 })`, en paridad con `siigoInvoiceItemSchema`.
**No se tradujo la regex publicada a Zod**: llega HTML-escapada y con un rango
`@-\\` ambiguo.

### D7 — `Idempotency-Key`

- `generateIdempotencyKey()` ya quitaba los guiones. El defecto estaba en la
  **validación**: `siigoApi.ts` aceptaba `/^[A-Za-z0-9-]+$/`.
- **Más grave que lo descrito en el prompt:** `POST /api/invoices` y
  `POST /api/credit-notes` aceptan la clave del cliente vía cabecera
  `X-Idempotency-Key`. Una clave con guion llegaba a Siigo y era rechazada —
  y un 5xx de Siigo consume la clave permanentemente.
- Regex endurecida a `/^[A-Za-z0-9]+$/`. Se conserva el límite de **30**
  caracteres: la doc de Siigo se contradice (30 en la página de Idempotencia,
  32 en `invalid_idempotency-key`); 30 es la cota conservadora.
- **Dos tests existentes codificaban el defecto** (`"RETRY-KEY-99"`,
  `"NC-RETRY-1"`) y se corrigieron.

### D6 — `.env.example`

- Creado con las **22 variables** que el código lee realmente, obtenidas por
  `grep -rhoE "process\.env\.[A-Z0-9_]+" src/ scripts/ | sort -u`, no de memoria.
- `NODE_ENV` deliberadamente excluida: la fija Next.js y declararla rompe el build.
- **`.gitignore:8` contenía `.env*`, que se habría tragado la plantilla en
  silencio.** Añadida la excepción `!.env.example` con su comentario.
- `BLOB_READ_WRITE_TOKEN` marcada como heredada: solo la usa
  `scripts/migrate-blob-to-postgres.ts`.

### Correcciones menores

- `settings/page.tsx:54` nombraba `ADMIN_ONLY_PREFIXES`, símbolo inexistente
  desde el chat 5. Corregido a `ADMIN_ONLY_RULES`. Documentación desfasada en el
  archivo usado como patrón fue la causa de un error de encuadre en el prompt.
- `/api/health` recibe `export const dynamic = "force-dynamic"`: los 13
  handlers quedan homogéneos.

---

## Decisiones tomadas y su justificación

### DP2 — Las páginas `/settings/credentials` y `/settings/mapping` NO llevan guard de servidor

**Ningún agente futuro debe "arreglar" esto.** Razones:

1. Son componentes `"use client"`. Guardarlas exige un `layout.tsx` de servidor
   con `await cookies()`, que las convierte de `○ (Static)` a `ƒ (Dynamic)`.
2. No renderizan **ningún** dato sensible en servidor. Todo lo que muestran
   viene de `/api/emission-mode`, `/api/catalog-mapping` y
   `/api/credentials/health`, que **sí** llevan guard.
3. El middleware ya redirige al empleado con 307 (`middleware.test.ts:84-90`).
   El único escenario en que alguien las alcanza es un bypass de middleware, y
   en ese caso obtiene un shell de cliente vacío.

Pagar prerender por blindar un shell vacío no compensa.

### `src/test/sessionRequest.ts` — falso positivo conocido de `ts-prune`

Solo lo consumen archivos `*.test.ts`, así que un escaneo de alcanzabilidad de
producción lo reporta como código muerto. **No lo es.** Está excluido de la
suite por `vitest.config.ts` (`include: ["src/**/*.test.ts"]`) y no importa
nada de `vitest`, por lo que es inerte ante `next build`.

### Cambio en el conteo del build: 10/10 → **9/9**

Consecuencia directa de añadir `force-dynamic` a `/api/health`: sale de la fase
de generación estática. **Las páginas `○ (Static)` siguen siendo 4**
(`/`, `/_not-found`, `/settings/credentials`, `/settings/mapping`) y el total de
rutas sigue siendo 20. El checklist de cierre de 6b debe esperar `9/9`, no `10/10`.

---

## D1 — BLOQUEADO, no implementado

`authenticate()` usa **SHA-256 sin sal**, vulnerable a tablas precomputadas.

**Hallazgo que cambia el análisis previo.** El bloqueador documentado era «el
middleware corre en Edge, donde `node:crypto` no existe». Es cierto a medias:

- `authenticate()` se invoca **únicamente** desde `loginAction`, una server
  action `"use server"` en `login/page.tsx:20`. Las server actions corren en
  **runtime Node**. `scrypt` está disponible allí **hoy**.
- El obstáculo real es el **grafo de imports**: `middleware.ts:3` importa
  `verifySessionToken` desde `@/services/auth`, y `auth.ts` no es más que un
  re-export de `@/services/jwt` (líneas 6-7). Si `auth.ts` importara
  `node:crypto`, el bundle Edge del middleware lo arrastraría y el build caería.
- **Se disuelve con un cambio de una línea**: que `middleware.ts` importe
  directamente de `@/services/jwt`. Eso corta `auth.ts` del bundle Edge y
  habilita `scrypt`/PBKDF2 sin esperar a Next 16.

**Por qué no se implementó:** cambiar el formato de hash invalida los valores
desplegados de `ADMIN_PASSWORD_HASH` y `EMPLOYEE_PASSWORD_HASH`. Hasta que el
propietario los regenere y los actualice en Vercel, **nadie puede entrar**.
Es una acción operativa coordinada, no un cambio de código aislado. Requiere
sesión propia con ventana de despliegue acordada.

---

## Backlog documental — hallazgos de la investigación, NINGUNO implementado

| # | Hallazgo | Evidencia | Sesión destino |
|---|---|---|---|
| 1 | Siigo bloquea el usuario API si los errores superan el **80% en 7 días**. Choca con el sandbox que devuelve 500 en ~1 de cada 10 emisiones y con la arquitectura «fail loudly». | Doc Siigo, Bloqueo de usuarios | Operativa / pre-producción |
| 2 | Siigo **recalcula** el total por ítem (`Redondear(Cantidad*ValorUnitario-Descuento,2)`). Leer `invoicerow.sum_total` literal puede colisionar por 1 peso → `invalid_total_payments`. | Doc Siigo, `invalid_total_payments` | Sesión propia |
| 3 | Provet aplica **bloqueo de periodo contable** (`financial_period_lock_date`) vía `GET /settings/department/<id>/`. No figura en ningún documento del proyecto. | Doc Provet, howto ERP | Sesión propia |
| 4 | `expose_consultation_item` en `invoicerow` trae `code` y `name`. Puede eliminar la dependencia de `GET /item/`. | Doc Provet, expose | Sesión de catálogo |
| 5 | Provet añadió `POST /item/export/start/` y `GET /item/export/status/` (2026-08-20). Alternativa al `/item/` bloqueado por 403. | Changelog Provet | Sesión de catálogo |
| 6 | Rate limits de Provet **por endpoint** en ventana de 60 s; un `page_size` custom consume peticiones proporcionalmente. | Doc Provet, ratelimit | Revisión de paginación |
| 7 | **Resolución 948 sector salud NO aplica** a una veterinaria: no es prestador del SGSSS. Retirar de `01_PROJECT_REQUIREMENTS §1.2.4`. | Doc Siigo, Novedades | Limpieza documental |
| 8 | Faltan en la tabla de errores: `invalid_dian_resolution`, `document_settings`, `blocked_transactions`, `duplicated_document`. | Doc Siigo, Manejo de errores | Limpieza documental |
| 9 | `EVIDENCIA §3.1` afirma que Vercel corta funciones entre 10 y 60 s. La doc de Vercel dice **300 s en Hobby**. Reverificar el `maxDuration` real; puede invalidar el diseño de polling de 20 s. | Doc Vercel, plan Hobby | Reverificación |
| 10 | Siigo recomienda esperar **≥120 s** antes de cortar la conexión en creación de facturas y NC. Si alguna función corta antes, se abortan emisiones que Siigo sí procesa. | Doc Siigo, Códigos de estado | Junto al #9 |
| 11 | **Vercel Hobby prohíbe uso comercial**, y aplica por dos vías independientes: cobrar por desarrollar el sitio, y que el sitio procese pagos. Además Hobby retiene runtime logs **1 hora**, inviable para facturación legal. | Doc Vercel, Fair Use | Migración a Pro |
| 12 | La doc de Siigo se contradice **tres veces** sobre el enum `reason` de NC (tabla 1-4,6,7; texto «1 al 5»; esquema 1-6). No fijar un enum Zod a partir de la doc. | Doc Siigo, Crear NC | Nota permanente |
| 13 | `Partner-Id` acepta hoy guiones en `siigoApi.ts:26` (`/^[A-Za-z0-9-]+$/`), pero Siigo lo documenta como alfanumérico sin especiales. **No se tocó**: endurecerlo podría invalidar un valor ya configurado en producción. | Doc Siigo, Partner-Id | Requiere verificar el valor real primero |
| 14 | `src/mappers/creditNote.ts` queda en **154 líneas**, sobre el tope de 150. Ya estaba exactamente en 150 antes de esta sesión, así que cualquier adición lo rompía. `src/services/siigoApi.ts` estaba ya en 193 y queda en 205. | `.clinerules` FILE SIZE LIMIT | Sesión de troceo |

---

## Siguiente sesión: 6b — cabecera CSP

Aislada porque puede romper producción en silencio sin que falle ningún gate.

Cambios de contexto que 6b debe absorber:

1. El checklist de cierre debe esperar **`9/9`** en `Generating static pages`, no
   `10/10`. Las páginas `○` siguen siendo 4.
2. `middleware.ts` pasó de 78 a 84 líneas y ahora importa de
   `@/mappers/routeAuthz`. La política (`ADMIN_ONLY_RULES`, `requiresAdmin`,
   `config.matcher`) está **intacta**.
3. `ƒ Middleware` sigue en **40.1 kB**: el mapper puro no engordó el bundle Edge.
4. En Next 16 `middleware.ts` se renombra a `proxy.ts` y pasa a runtime Node.
   **Decisión tomada: el orden se mantiene 6a → 6b → migración.** 6b no se
   reescribe ni se pospone; al migrar, su trabajo se traslada con un `mv` y un
   renombrado de función. La superficie (`NextRequest`, `NextResponse`,
   `config.matcher`) es idéntica.
5. Si 6b genera un nonce en el middleware, tener presente que el runtime Edge
   limita a **50 ms de CPU en promedio** — límite que desaparece con `proxy`.
