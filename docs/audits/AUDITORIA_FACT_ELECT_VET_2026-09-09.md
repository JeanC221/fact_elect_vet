> ---
> **DOCUMENTO HISTÓRICO — NO ES FUENTE DE VERDAD.**
>
> Archivado el 2026-09-10 por la sesión 0. **No forma parte del protocolo de
> lectura obligatoria de `.clinerules §1`.** Se conserva solo para trazar por qué
> se decidió cada cosa.
>
> El estado verificado y el backlog vivo están en **`PROJECT_STATE.md`**, sección
> `## Current State — Backlog Consolidado`. La numeración `N*`/`H*`/`P*`/`S*`/`B*`/
> `D*`/`T*` de este documento **está retirada**; la referencia válida es la columna
> `#` del backlog consolidado (`C-*`, `A-*`, `H-*`, `P-*`, `T-*`).
>
> **No ejecutes nada desde este archivo.**
> ---
>
> **Afirmaciones de este documento falsificadas por medición en vivo el 2026-09-10.
> No las reutilices:**
>
> | Dice | Medido |
> |---|---|
> | P-5: los catálogos por tipo pueden esquivar el 403 de `/item/` | **Falso.** Los siete endpoints devuelven 403. El bloqueante es real y la acción es pedir el permiso `Settings` |
> | P-7: `external_info` como posible ancla de idempotencia en `invoice` | **Falso.** Solo existe en `/unallocatedpayment/`. Descartado, no diferido. Sustituto: `POST /consultation/{id}/set_integration_status/` |
> | El estado 99 de Provet significa "anulada" | **Sin evidencia.** `status` es `integer` `readOnly` sin enum publicado; las filas medidas traen `3`. El marcador de abono es `credit_note`, no `status` |
> | N13: "no hay forma de preguntarle a Siigo si la nota ya existe" | **Falso.** `GET /v1/credit-notes` existe con los mismos filtros que facturas y devuelve `invoice: {id, name}`. Una NC se localiza por el GUID de su factura padre, sin marcador |
> | La causa raíz de N10: "no se puede filtrar por padre" en las seis colecciones | **Parcialmente falso.** `/invoicerow/` acepta `invoice__in` y funciona (8 filas vs 223). Solo es cierto para `/consultationitem/` |
> | N5: el `continue` descarta *descuentos* | **Sin verificar.** Descarta filas negativas reales (medido), pero el mecanismo del descuento en Provet sigue sin conocerse: `discount_amount` está a cero en todo el tenant |
>
> **Y una omisión:** ninguno de los dos informes detectó **C-1** — las notas de
> crédito de Provet llegan con `consultation: null` y se pierden enteras en
> `provetToQueue.ts:105-115`, produciendo sobrefacturación medida de 125.00 sobre
> la factura 5. Ver `EVIDENCIA_APIS.md §2.8`.
> ---

# Re-auditoría de `fact_elect_vet`

**Commit auditado:** `81b10033ef370bb517d0d9636b9c0c4e713525d6` (`main`)
**Fecha:** 2026-09-09
**Auditoría anterior:** 2026-09-02, 15 hallazgos
**Método:** clon fresco, tres gates ejecutados, lectura del 100 % de `src/`, contraste contra documentación oficial de Siigo Nube (`developers.siigo.com`), Provet Cloud (`developers.provetcloud.com`), Vercel y Next.js, con prioridad para `EVIDENCIA_APIS.md` donde contradice a la doc.

---

## 1. Veredicto

**El repo mejoró de verdad en seguridad de acceso y en integridad de la emisión de facturas, y a la vez adquirió un módulo entero — notas crédito — construido contra un contrato inventado que la documentación oficial contradice campo por campo, blindado por 23 tests verdes que fijan el error.**

Las remediaciones de los chats 5 y 6a son sólidas y están bien razonadas: los 15 route handlers tienen guard de sesión, la política de autorización vive en un único decisor puro, y el protocolo de claims + reconciliación es el diseño correcto para el problema del 500 no determinista de Siigo. Nada de eso es cosmético.

Pero el problema se movió de sitio en tres direcciones: **hacia el módulo que nunca se probó** (notas crédito, que no puede funcionar y por tanto deja la anulación legal indisponible), **hacia el presupuesto de ejecución** (el protocolo de reconciliación puede no caber en el tiempo que la plataforma concede), y **hacia la capa de UI** (0 de 20 componentes tienen test, 12 llamadas `fetch` crudas viven en componentes y páginas, y el control de cuadre que la recepción confirma antes de emitir no llega al payload).

---

## 2. Tabla comparativa con la auditoría original — **NO ENTREGABLE**

Los dos documentos (`AUDITORIA_FACT_ELECT_VET_2026-09-02.md`, 15 hallazgos, y `AUDITORIA_PROVET_API.md`, 8 hallazgos) **no están en el repo y no me fueron facilitados**. Reconstruirlos de memoria es exactamente lo que la sección 6.3 del encargo prohíbe, así que esta sección queda vacía a propósito.

Lo que sí puedo confirmar por evidencia directa en el código de hoy, sin necesidad de los documentos:

| Elemento verificable | Estado hoy | Prueba |
|---|---|---|
| `POST /api/invoices` sobrescrito con `invoice-history` | **RESUELTO** | `src/app/api/invoices/route.ts:59-120` emite; `invoice-history/route.ts` solo lee/escribe Postgres |
| D0 — autorización solo en `middleware.ts` | **RESUELTO** | Los 15 handlers llaman `requireSession`/`requireAdmin`; verificado uno a uno |
| `GET /api/emission-mode` bloqueado para `employee` | **RESUELTO** | `middleware.ts:52` — `sessionOnlyMethods: ["GET"]` |
| Bug de zona horaria UTC vs `America/Bogota` | **RESUELTO, con deuda** | `provetToSiigo.ts:15` usa `America/Bogota`. Pero la lógica está **triplicada** — ver L4 |
| `stamp` de `.optional()` a `.nullish()` | **RESUELTO** | `schemas/siigo.ts:238-244` |
| Premisa falsa del sandbox de Siigo | **RESUELTO** | Corregida en `schemas/siigo.ts:212-236` y `EVIDENCIA_APIS §1.2` |
| Referencias rotas en `.clinerules` | **RESUELTO en el repo, REGRESIONADO en el conocimiento del Project** | Ver N21 |
| `invoicerow.sum_total` leído literal | **RESUELTO** | `provetToQueue.ts:116`, `consultationQueue.ts:160-171` |
| `modified__gte` en recursos hijos | **RESUELTO** | `provetApi.ts:145-157` — `windowed=true` solo en `/consultation` |
| D1 — hashing de contraseñas | **NO RESUELTO**, y la justificación escrita **no se sostiene** — ver N19 |
| CSP fase 2 | **NO RESUELTO**, deliberadamente. Correcto |
| Nota crédito con `stamp.send: true` | **RESUELTO en la intención, IRRELEVANTE en la práctica** — el payload completo es inválido (N8) |

**Si me pasas los dos `.md`, completo esta sección en una sesión corta.**

---

## 3. Baseline verificado

| Gate | Comando | Resultado | Declarado |
|---|---|---|---|
| Tipos | `npx tsc --noEmit` | limpio, exit 0 | limpio ✅ |
| Tests | `npx vitest run` | **637 passed / 45 files** | 637 / 45 ✅ |
| Build | `next build` | **20 rutas, 9/9 páginas, 4 estáticas** | 20 rutas ✅ |
| `npm audit` por paquete | — | 2 (1 critical, 1 high) | 2 ✅ |
| `npm audit` por advisory | — | **27: 2 critical · 10 high · 13 moderate · 2 low** | 27 ✅ |
| Archivos fuente no-test | — | **84** | 85 (−1, criterio de conteo) |
| Líneas de producción | — | **10.158** | ~10.273 (−115, criterio de conteo) |

**Las dos exclusiones `critical` se sostienen.** `GHSA-p293-qw3h-jr36` exige Pages Router sobre Windows: verificado, no existe `pages/` ni `src/pages/` y Vercel corre Linux. `GHSA-2xp9-vwfh-vxw4` exige el optimizador de imágenes con AVIF: verificado, cero `next/image` en `src/` y sin `images.remotePatterns` en `next.config.js`. Ambas justificaciones son correctas.

**Next.js 14.2.35 confirmado EOL.** Fin de vida el 2025-10-26; `14.2.35` fue el último parche (2025-12-11). 16.x es Active LTS; 15.x entra en EOL en octubre de 2026, o sea el mes que viene. **El destino correcto de la migración es 16.x, no 15.x.**

---

## 4. Hallazgos nuevos

### 4.1 Módulo Siigo

#### N1 · `Partner-Id` acepta guiones que Siigo rechaza — BAJO
**`src/services/siigoApi.ts:26`** · `regex(/^[A-Za-z0-9-]+$/)`.
Doc oficial: *"entre 3 y 100 caracteres alfanuméricos, sin espacios en blanco ni caracteres especiales"*; error `invalid_partner_id`. El guion es carácter especial.
**Riesgo:** el día que el dueño escriba `vet-siigo` en Ajustes, **todas** las peticiones a Siigo fallan y la clínica no puede facturar hasta que alguien relacione el fallo con un guion.
**Incoherencia:** el mismo archivo, `:30-40`, razona que el guion es carácter especial y lo aplica a `Idempotency-Key` pero no aquí.
**Fix:** `/^[A-Za-z0-9]+$/`.

#### N2 · Límites de decimales invertidos — BAJO
**`src/schemas/siigo.ts:135, 143, 145`** · Doc: `quantity` máx. **2** decimales, `price` máx. **6**. Código: `quantity` sin validar, `price`/`taxed_price` a 2.
**Riesgo:** hoy latente porque `toSiigoLine` fuerza `quantity: 1`. Se activa en cuanto un payload se construya por otra vía con una cantidad de dosificación de Provet (`0.028`): pasa Zod, Siigo lo rechaza, y la `Idempotency-Key` queda quemada.

#### N3 · `observations` limitado a 500 cuando Siigo permite 4.000 — BAJO
**`src/schemas/siigo.ts:173`** · El campo carga el marcador de emisión del que depende toda la reconciliación. Un fallo aquí llegaría como `invalid_payload` genérico. Subir a 4.000.

#### N12 · Descargas y `/auth` sin timeout — BAJO
**`src/services/siigoApi.ts:171-197`**, **`src/services/siigoAuth.ts:110-118`** · `postToSiigo` usa `AbortController`; `fetchInvoiceFile` y `getSiigoAccessToken` no. Inconsistencia gratuita que además suma al presupuesto de N11.

#### N4 · `payments` no puede llevar `due_date` — MODERADO
**`src/schemas/siigo.ts:153-156`**
Doc: `payments.due_date` — *"Obligatorio si el medio de pago maneja vencimiento"*; solo se permite un medio con vencimiento.
Verificado: `due_date` aparece **una sola vez en todo `src/`**, en `siigoPaymentTypeSchema:43`, donde se lee del catálogo **y se descarta**. No hay filtro en la UI de mapeo ni campo en el payload.
**Riesgo:** el día que el dueño mapee un medio de pago de cartera (Crédito, Financiación), toda factura con ese medio se rechaza con `parameter_required`, sin que nada en la pantalla de mapeo lo advirtiera.

#### N6 · La `X-Idempotency-Key` del cliente se valida después de tomar el claim — MODERADO
**`src/app/api/invoices/route.ts:73` y `:83`** · La cabecera se lee en `:73`, el claim se toma en `:83`, y el formato se valida dentro de `postToSiigo`, después.
**Riesgo:** una clave malformada (con guion — el formato nativo de `crypto.randomUUID()`) lanza `ZodError`; `provablyCreatedNothing` devuelve `false`; el `catch` ejecuta `markClaimUnknown`. **La consulta queda bloqueada en `unknown` sin que la petición haya tocado Siigo.** Desbloquearla exige el panel de admin.
**Fix:** parsear la cabecera junto a `invoiceRequestSchema`, antes de `acquireInvoiceClaim`.

#### N7 · `duplicated_document` (400) se toma como prueba de que no se creó nada — MODERADO
**`src/app/api/invoices/route.ts:40-44`, `:133-136`**
Doc: `duplicated_document` → *"El documento ya existe"*, devuelto con HTTP **400**. `provablyCreatedNothing` devuelve `true` para todo 4xx → `releaseInvoiceClaim`.
**Riesgo:** es el único 4xx que significa lo contrario de "no se creó nada". Se libera el claim de una consulta que **sí** tiene factura, y el siguiente clic en "Facturar" emite la segunda. Dos facturas electrónicas para una consulta.
**Fix:** excluir `duplicated_document` y `already_exists`; tratarlos como ambiguos.

#### N17 · La ventana de reconciliación puede excluir la factura que busca — **ALTO**
**`src/services/invoiceReconciliation.ts:92-94`**
```
created_start=colombiaDate(1)&created_end=colombiaDate(0)
```
Doc de *Listar Facturas*: `created_start`/`created_end` son `date-time` RFC3339; `yyyy-MM-dd` también se acepta, pero **una fecha sin hora se interpreta como `T00:00:00`**.
**Riesgo, y es el escenario exacto que el módulo existe para evitar:** una factura creada hoy a las 10:00 queda **fuera** de `created_end = hoy T00:00:00`. `findInvoiceByMarker` devuelve `null`, `reconcileInvoice` devuelve `null`, y `route.ts:100` lo lee como *"Siigo answered and the document is genuinely absent, so exactly one more attempt is safe"* → **reintenta y crea una segunda factura timbrada**. Si además `created` se almacena en UTC, cualquier emisión posterior a las 19:00 COT cae fuera incluso con `created_end` bien puesto.
**Fix:** `created_end = colombiaDate(-1)` (mañana), o directamente omitir `created_end`. Y verificar en vivo si `created` viene en COT o en UTC.
**Pendiente de verificación en vivo:** `GET /v1/invoices?created_start=<hoy>&created_end=<hoy>` justo después de emitir; si el resultado viene vacío, el hallazgo está confirmado.

#### N18 · Reconciliación truncada a 500 documentos sin avisar — MODERADO
**`src/services/invoiceReconciliation.ts:88, 115`** · `MAX_RECONCILE_PAGES = 5` × `page_size=100`. Si la página 5 vuelve llena, el bucle termina y `matches[0] ?? null` devuelve `null` — es decir, **"no lo encontré en las 500 que miré" se convierte en "no existe"**, que es precisamente la conversión que el comentario de `:78-82` promete no hacer. Poco probable en una veterinaria, pero es fail-silent en el punto más caro.
**Fix:** lanzar en vez de devolver `null` al agotar las páginas.

#### N5 · `provetToQueue.ts:117` descarta líneas en silencio — **ALTO**
```ts
if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue;
```
`EVIDENCIA §2.1`: `invoicerow` contiene filas sin `consultationitem` y Provet deriva importes con reglas propias. Nada garantiza que todas sean positivas: una fila de descuento o ajuste es un `sum_total` negativo normal.
**Riesgo:** cualquier fila `<= 0` desaparece sin traza, y `paymentValue` se calcula sobre las supervivientes, de modo que **la suma cuadra consigo misma**, Siigo acepta y la DIAN timbra. Una consulta con descuento se factura **por el importe sin descuento**. Sobrefacturación silenciosa con validez legal — el peor fallo posible en este proyecto.
Viola frontalmente *"fail loudly, never silently"*.
**Fix:** filtrar solo `!Number.isFinite`, permitir negativos, y bloquear la emisión si el total de líneas no coincide con `invoice.total_with_vat` (que ya se lee en `provetToQueue.ts:145`).

#### N10 · `page_size=1000` sin ventana en seis colecciones — **ALTO**
**`src/services/provetApi.ts:72`**
Doc de Provet: peso = `ceil(page_size_pedido / page_size_default)`. Con default 50, **`page_size=1000` cuenta como 20 peticiones**. `GET /invoice/` tiene un límite de **60 req/60 s**. La doc dice literalmente: *"Prefer smaller page sizes combined with `modified__gte` filtering rather than requesting the maximum page size on each call"*, y para offsets sobre 10.000 recomienda `id__gt=`.
`/client`, `/patient`, `/invoice`, `/phonenumber`, `/consultationitem` e `/invoicerow` se traen **enteras, sin ventana**, a 1000 por página. Tres páginas de facturas agotan el presupuesto de ese endpoint.
**Riesgo:** con polling de 20 s y 2-3 recepcionistas, el 429 es cuestión de historia acumulada. Al llegar, `fetchProvetPage:83` duerme lo que diga `Retry-After` — que Provet puede fijar en 60 s — **dentro de una función serverless**. La cola deja de cargar.
La causa raíz está bien documentada en el propio archivo (`:100-130`): no se puede filtrar por padre. La salida no es la ventana (eso reintroduce la subfacturación de `§2.2`) sino **paginar más pequeño y cachear**.
**Fix:** `page_size=200` (peso 4) y `id__gt=` en lugar de offsets altos.

#### N11 · El presupuesto de tiempo de la emisión contradice lo observado — **ALTO, pendiente de verificación en vivo**
**`src/services/siigoApi.ts:106` + `src/app/api/invoices/route.ts` completo**

Peor caso de una invocación: `/auth` (sin timeout) + POST 120 s + 2 s + reconcile + POST 120 s + 2 s + reconcile ≈ **250 s**.

| Fuente | Presupuesto | ¿Cabe? |
|---|---|---|
| Doc Siigo | recomienda timeout ≥ 120 s | — |
| Doc Vercel, con Fluid compute | Hobby: 300 s por defecto y máximo | Justo |
| `EVIDENCIA_APIS §3.1` (observado) | *"cortan la conexión entre 10 y 60 segundos"* | **No** |

`vercel.json` no define `functions.maxDuration`; la ruta no exporta `maxDuration`; nada en el repo dice si el proyecto está en Fluid compute o es un despliegue legacy. **La regla del proyecto es que la evidencia observada gana a la documentación.**
**Riesgo si `EVIDENCIA` tiene razón:** Vercel mata el proceso a mitad. El `catch` **nunca corre**: ni `markClaimUnknown` ni `releaseInvoiceClaim`. El claim queda `pending` y el reintento choca con un 409. Y ocurre justo en el 10 % de POSTs que devuelven 500 — el escenario para el que se construyó todo esto.
**Esta es la respuesta a "¿alguna remediación introdujo un problema peor?".** La lógica de reconciliación es correcta; su presupuesto de ejecución nunca se midió contra la plataforma.
**Verificación en vivo:** Vercel → Settings → Functions, ¿está activo **Fluid compute**? Y logs de `/api/invoices` buscando `FUNCTION_INVOCATION_TIMEOUT` / 504.

#### N8 · El módulo de notas crédito está construido contra un contrato inventado — **CRÍTICO**
**`src/mappers/creditNote.ts` completo**
Fuente: `developers.siigo.com/docs/siigoapi/credit-note/1-create-credit-note`, recuperada completa (tabla de campos, ejemplo cURL, respuesta 201).

| Campo | Doc oficial | Código | Resultado |
|---|---|---|---|
| `invoice` | string, **GUID de la factura**. Obligatorio si es electrónica | No existe. Se envía `base_document: {id, cufe}` (`:83-86`) | `base_document` no está en la especificación |
| `date` | **Obligatorio**. No anterior a la fecha actual en electrónicas | **Ausente del payload** | `parameter_required` |
| `reason` | **`integer` 1-6**, motivo de rechazo DIAN, obligatorio en electrónicas | `z.enum([...])` de strings (`:70-76`) | `invalid_type` |
| `items.price` | Obligatorio, máx. 6 decimales, **positivo** | **Negado** (`:138-140`) | `invalid_amount` |
| `payments.value` | Obligatorio, máx. 2 decimales, **positivo** | **Negado** (`:144`) | `invalid_amount` |
| `total` | **No es campo de request** | `total: -itemsTotal` en la raíz (`:146`) | Ignorado o `parameters_exclusive` |
| `customer`, `seller` | Solo obligatorios si la factura NO existe en Siigo Nube | Se envían siempre | Posible `non_editable` |
| `payments.due_date` | Obligatorio si el medio maneja vencimiento | No modelado | Igual que N4 |
| **Respuesta 201** | `cufe`, `cude` y `status` **anidados bajo `stamp`** | `cufe` y `status: z.literal("Accepted")` **en la raíz** (`:113-114`) | **Toda nota crédito exitosa falla la validación local** |

Códigos `reason` reales: **2 = Anulación de factura electrónica** es el único que corresponde al flujo "Anular Factura". Los cinco de `ANNULMENT_REASONS` (`:18-24`) no mapean a nada; `duplicate_invoice`, `customer_request` y `other` no tienen equivalente DIAN.

**Contradicción interna de la doc de Siigo, a resolver antes del fix:** la tabla lista `1,2,3,4,6,7`; el esquema del request declara `Value in: 1|2|3|4|5|6`. No coinciden.

**Riesgo real:** ninguna nota crédito puede emitirse hoy. Y si la respuesta 201 llega como está documentada, cuando el payload se arregle una nota crédito **exitosa** seguirá fallando la validación local, el operador reintentará y **anulará la factura dos veces ante la DIAN**.

**La asimetría es lo grave:** `schemas/siigo.ts:212-256` dedica 40 líneas a explicar por qué un rechazo *después* de un POST exitoso es carísimo, y por eso usa `.nullish()`, `.passthrough()` y un `transform` con defaults. Esa lección no se trasladó al camino con más consecuencia legal y sin ninguna evidencia real.

#### N13 · Las notas crédito no tienen reconciliación — **ALTO**
**`src/app/api/credit-notes/route.ts`** · `POST /v1/credit-notes` está en la misma lista de idempotencia que `/v1/invoices` y sufre los mismos 500 al ~10 % (`EVIDENCIA §1.5`). Pero la ruta **no tiene claim, ni marcador, ni reintento, ni reconciliación**, y no envía `observations`, así que **no hay forma de preguntarle a Siigo si la nota ya existe**. Un 500 → error → el operador reintenta → segunda anulación. **Anular por duplicado es peor que emitir por duplicado.**

#### N16 · El cuadre que la recepción confirma no llega al payload — **ALTO**
**`src/components/QuickEditDrawer.tsx:56, 61` + `src/mappers/consultationQueue.ts:171-186` + `src/mappers/provetToSiigo.ts:87`**

El drawer calcula `balanced = toCents(detail.total) - toCents(values.paidAmount) === 0` y bloquea el botón si no cuadra, tal como exige `03_UI_UX_DESIGN_SPEC §3.3`. Pero **`values.paidAmount` no se usa en ninguna parte de la construcción del payload**: `buildInvoicePayloadFromQuickEdit` solo consume `name`, `identificationType`, `identificationNumber`, `email`, `phone` y `paymentMethod`. El valor que realmente se envía es `paymentValue = sumLineTotals(sourceItems)`, calculado dentro de `provetToSiigoInvoice`.

Además, `balanced` compara el total de la factura de Provet contra lo que el operador teclea — **nunca contra la suma de las líneas**. Combinado con N5, el operador ve "Balanceado ✅" sobre un número que no es el que se factura.

**Riesgo:** la única barrera de cuadre que la recepción ve antes de emitir un documento legal es decorativa respecto de lo que se emite.
**Fix:** comparar `sumLineTotals(items)` contra `detail.total` y bloquear ahí; o usar `values.paidAmount` como fuente de `payments[0].value`. Una de las dos, no ninguna.

### 4.2 Módulo Auth / sesión / seguridad

#### N15 · La frontera de admin se aplica a las páginas pero no a la API que las respalda — **ALTO**
**`src/middleware.ts:51-56` vs `src/app/api/catalog-mapping/route.ts:83`**

`ADMIN_ONLY_RULES` protege `/settings/mapping` y `/settings/credentials` (páginas). Pero:

| Endpoint | Guard actual | Qué escribe |
|---|---|---|
| `PUT /api/catalog-mapping` | `requireSession` | `document_type_id`, `credit_note_document_type_id`, `seller_id` y todo el mapeo de ítems y pagos |
| `POST /api/catalogs/sync` | `requireSession` | Lectura en vivo del catálogo de Siigo |
| `POST /api/credentials/health` | `requireSession` | Oráculo válido/inválido sobre credenciales Siigo arbitrarias del cuerpo |

**Riesgo:** un `employee` puede cambiar por API directa el tipo de comprobante DIAN con el que se factura, el vendedor y todo el mapeo de productos — exactamente lo que la página está protegida para impedir. Es la misma clase de bug que D0 (control solo en la UI), y sobrevivió al chat 6a. Y `credentials/health` es un oráculo de credenciales sin límite de intentos.
**Fix:** `requireAdmin` en `PUT /api/catalog-mapping` y en `POST /api/credentials/health`, y añadir ambos prefijos a `ADMIN_ONLY_RULES` para que las dos capas no se bifurquen — que es justo lo que `routeAuthz.ts` fue creado para evitar.

#### N19 · La justificación escrita de D1 no se sostiene — MODERADO
**`src/services/auth.ts:14-19`** · El comentario afirma que quien tenga acceso de lectura a las variables de entorno de Vercel *"sees an irreversible hash, not the real operational password"*.
`sha256(password)` **sin sal y de una sola ronda** sobre una contraseña elegida por humanos no es irreversible en ningún sentido operativo: se recupera con diccionario o GPU en segundos. La afirmación es falsa tal como está escrita.
El encargo pedía explícitamente evaluar si las justificaciones escritas se sostienen. Ésta no. D1 sigue siendo el fix correcto (Argon2id o scrypt con sal), pero **mientras tanto el comentario debe decir la verdad**, porque hoy sirve de argumento para seguir aplazándolo.

#### N20 · Sin revocación de sesión — BAJO
**`src/services/jwt.ts:78-101`** · El JWT se verifica solo por firma y `exp` (24 h). Cambiar la contraseña en Vercel **no invalida las sesiones vivas**. Con credenciales compartidas por rol y varios dispositivos, rotar una credencial comprometida deja hasta 24 h de ventana. Mitigación barata: incluir un `kid`/versión derivada del hash en el payload y rechazar los que no coincidan.

*(La verificación del JWT es correcta en lo demás: `crypto.subtle.verify` siempre con HS256 sin leer `alg` del header, así que el ataque `alg: none` no aplica.)*

### 4.3 Módulo Storage / Postgres

`src/services/db.ts` está bien: `rejectUnauthorized: true` con CA explícita, sin fallback silencioso, pool singleton, y fallo ruidoso si falta `DATABASE_URL` o `SUPABASE_DB_CA_CERT`. Sin hallazgos nuevos.

`login_rate_limits` falla-abierto de forma intencional y documentada (`loginRateLimitStore.ts:5-11`). Aceptable para la herramienta.

#### N22 · `instrucciones_proyecto.md` omite una tabla que existe — BAJO
El documento declara cuatro tablas (`invoices`, `catalog_mapping`, `credentials_config`, `login_rate_limits`). El DDL real tiene **cinco**: falta `invoice_claims`, que es la tabla central del mecanismo anti-duplicado. Un agente que confíe en ese documento no sabrá que existe.

### 4.4 Módulo UI / mappers / hooks

#### N23 · La ley de desacople está incumplida en 5 archivos y 12 llamadas — MODERADO
`.clinerules` §CODE EFFICIENCY: *"UI components must NEVER perform raw data mapping or direct API calls."*

| Archivo | `fetch(` |
|---|---|
| `src/app/page.tsx` | 5 |
| `src/app/settings/mapping/page.tsx` | 4 |
| `src/app/settings/credentials/page.tsx` | 3 |
| `src/components/InvoiceClaimsPanel.tsx` | ≥1 |
| `src/components/HealthCheckStatus.tsx` | ≥1 |

De los cinco archivos nuevos que el encargo señalaba, **`InvoiceClaimsPanel.tsx` (chat 2) viola la ley**; `EmissionModeBanner.tsx` (52 líneas) está limpio. No existe ningún `src/services/apiClient.ts`: cada pantalla construye su propia llamada, su propio manejo de error y su propio parseo.

#### N21 · El `.clinerules` del conocimiento del Project está desactualizado — BAJO
El repo tiene la versión corregida (apunta a `2_AGENT_WORKFLOW_RULES.md` y aclara que `## Current State` es la fuente de verdad). La copia en el conocimiento del Project sigue apuntando a **`02_AGENT_WORKFLOW_RULES.md`, archivo que no existe**, y le falta esa aclaración. Los otros tres `.md` son idénticos. Cualquier agente que lea el Project en vez del repo arranca con una referencia rota.

---

## 5. Calidad del suite de tests

**637 tests, 45 archivos, todos verdes. Prueban coherencia interna, no conformidad externa.**

### 5.1 El caso que lo demuestra sin necesidad de mutar nada

`src/mappers/creditNote.test.ts` — **23 tests que blindan el contrato equivocado**. Nombres literales:

- `"carries base_document with original invoice id and CUFE"` → afirma un campo que **no existe en la API**
- `"negates item prices, payment amounts, and total"` → afirma exactamente lo que Siigo rechaza
- `"parses an accepted credit note response"` → afirma una forma de respuesta que la doc contradice
- `"has exactly 5 reasons with non-empty labels"` → afirma 5 strings donde la API espera un entero 1-6
- `"rejects a missing base_document CUFE"` → **protege activamente el campo inventado contra que alguien lo quite**

La mutación busca tests que **no** fallan cuando el código cambia. Aquí el problema es el inverso y peor: fallarían correctamente ante cualquier mutación, **y por eso impiden corregir el código**. Un agente futuro que arregle el payload rompe 23 tests verdes y lo más probable es que revierta el fix.

No hace falta ejecutar mutación para probarlo: el contraste con la documentación oficial es la prueba.

### 5.2 Cobertura estructural

| Métrica | Valor |
|---|---|
| Archivos de producción **sin test hermano** | **42 de 84 (50 %)** |
| Líneas sin test hermano | **4.880 de 10.158 (48 %)** |
| Componentes con test | **0 de 20** |
| Hooks con test | 1 de 4 |

`vitest.config.ts` usa `environment: "node"` e `include: ["src/**/*.test.ts"]` — **sin `.tsx`, sin DOM**. No es que falten tests de componente: es que **la configuración los hace imposibles** sin modificarla.

Archivos sin test que más importan:

| Archivo | Líneas | Por qué importa |
|---|---|---|
| `src/services/invoiceClaims.ts` | 230 | **El guardián contra el doble timbrado ante la DIAN** |
| `src/hooks/useConsultationQueue.ts` | 233 | Orquesta la cola completa |
| `src/app/api/consultations/route.ts` | 82 | Entrada de datos de Provet |
| `src/services/db.ts` | 67 | Pool y TLS |
| `src/services/loginRateLimitStore.ts` | 57 | Rate limiting de login |

`invoiceClaims.ts` sí se ejercita indirectamente desde los tests de rutas, pero **el SQL de `acquireInvoiceClaim` — el `INSERT ... ON CONFLICT ... WHERE status = 'annulled'` del que depende toda la atomicidad — no tiene ningún test propio**.

### 5.3 Lo que sí funciona

`middleware.test.ts` (9), `routeGuard.test.ts` (10), `routeAuthz.test.ts` (10) y `vercelSecurityHeaders.test.ts` (8) prueban comportamiento real contra un contrato que el equipo controla. Son buenos tests. La distinción es exactamente ésa: **donde el contrato es interno, los tests valen; donde el contrato es de un tercero, valen lo que valga la fuente contra la que se escribieron.**

---

## 6. Cumplimiento de las leyes del proyecto

### L1 · Cap de 150 líneas — **incumplido, y correlaciona con los bugs**

| Criterio | Violaciones |
|---|---|
| `.clinerules` (`services`+`mappers`+`components`) | **17 archivos** |
| `2_AGENT_WORKFLOW_RULES.md` (todo `/src`) | **25 archivos** |
| SLOC real (sin blancos ni comentarios) | **11 archivos** |

Peores: `app/page.tsx` 370, `settings/mapping/page.tsx` 351, `errorTranslator.ts` 282, `schemas/siigo.ts` 271, `useConsultationQueue.ts` 233, `invoiceClaims.ts` 230, `InvoiceClaimsPanel.tsx` 230.

**Sí correlaciona, pero no como se esperaría.** Los archivos largos de `services/` y `schemas/` son largos por *comentarios de justificación*, y son los mejor razonados del repo (`schemas/siigo.ts` dedica 45 de sus 271 líneas a documentar por qué `.nullish()`). Donde el tamaño sí duele es en la UI: `app/page.tsx` (370) y `settings/mapping/page.tsx` (351) concentran **9 de las 12 llamadas `fetch` crudas** (N23) y **no tienen ni un test**. La correlación real no es longitud→bugs, es **longitud sin test→bugs**.

### L2 · Reusar antes de crear — **incumplido en 3 sitios**

- **Fecha en `America/Bogota` implementada tres veces**: `provetToSiigo.ts:15` (`todayInColombia`), `invoiceReconciliation.ts:70` (`colombiaDate`), `consultationQueue.ts`. Es exactamente la lógica en la que ya hubo un bug de producción, ahora triplicada.
- **`round2` en `provetToSiigo.ts:8` vs `toCents` en `schemas/provet.ts:29`**: dos utilidades de precisión decimal conviviendo. `creditNote.ts:99` compara flotantes con `===` en vez de usar cualquiera de las dos (N9, ahora obsoleto por N8).
- **Ningún cliente HTTP compartido para la propia API**: 12 `fetch` crudos repiten manejo de error y parseo.

### L3 · Desacople de capas — **incumplido**
Ver N23. `/services` y `/mappers` están limpios (sin JSX, sin estado); la violación es unidireccional: la UI se salta la capa de servicios.

### L4 · Cero duplicación — **incumplido**, mismos casos que L2.

### L5 · Fail loudly — **incumplido en 2 sitios**
`provetToQueue.ts:117` (N5) y `invoiceReconciliation.ts:115` (N18). Ambos convierten una ausencia de información en una afirmación.

### L6 · UI clínica (`03_UI_UX_DESIGN_SPEC`) — **cumplido**
Paleta, `rounded-md`, `text-xs`/`text-sm`, iconos `lucide-react` con significado funcional, drawer de 480 px con backdrop `bg-slate-900/40`, `Esc` y `Ctrl+Enter`, barra de reconciliación con bloqueo del botón. Sin glassmorphism, sin neón, sin `rounded-2xl`. Lo único que falla no es visual sino funcional: N16.

---

## 7. Resumen ejecutivo

| # | Módulo | Archivo | Riesgo | ¿Credenciales? |
|---|---|---|---|---|
| **N8** | Siigo | `mappers/creditNote.ts` completo | **CRÍTICO** | Sí — capturar respuesta 201 real |
| **N5** | Siigo/Provet | `mappers/provetToQueue.ts:117` | **ALTO** | No |
| **N10** | Provet | `services/provetApi.ts:72` | **ALTO** | No |
| **N11** | Infra | `siigoApi.ts:106` + ruta invoices | **ALTO** | Sí — panel Vercel |
| **N13** | Siigo | `app/api/credit-notes/route.ts` | **ALTO** | No |
| **N15** | Auth | `middleware.ts:51` + `catalog-mapping:83` | **ALTO** | No |
| **N16** | UI | `QuickEditDrawer.tsx:56` + `consultationQueue.ts:171` | **ALTO** | No |
| **N17** | Siigo | `invoiceReconciliation.ts:92` | **ALTO** | Sí — verificar ventana |
| **N4** | Siigo | `schemas/siigo.ts:153` | MODERADO | No |
| **N6** | Siigo | `app/api/invoices/route.ts:73,83` | MODERADO | No |
| **N7** | Siigo | `app/api/invoices/route.ts:40` | MODERADO | No |
| **N18** | Siigo | `invoiceReconciliation.ts:115` | MODERADO | No |
| **N19** | Auth | `services/auth.ts:14` | MODERADO | No |
| **N23** | UI | 5 archivos, 12 `fetch` | MODERADO | No |
| **N1** | Siigo | `siigoApi.ts:26` | BAJO | No |
| **N2** | Siigo | `schemas/siigo.ts:135` | BAJO | No |
| **N3** | Siigo | `schemas/siigo.ts:173` | BAJO | No |
| **N12** | Siigo | `siigoApi.ts:171`, `siigoAuth.ts:110` | BAJO | No |
| **N20** | Auth | `services/jwt.ts:78` | BAJO | No |
| **N21** | Gobernanza | `.clinerules` del Project | BAJO | No |
| **N22** | Gobernanza | `instrucciones_proyecto.md` | BAJO | No |
| **N14** | Tests | `mappers/creditNote.test.ts` | **ALTO** (bloquea el fix de N8) | No |

**8 ALTO/CRÍTICO · 6 MODERADO · 7 BAJO · 1 obsoleto (N9).**
Solo **3 requieren credenciales o acceso a paneles** para cerrarse: N8, N11, N17.

---

## 8. Orden de resolución propuesto

| # | Sesión | Contenido | Por qué en este orden |
|---|---|---|---|
| 1 | **Next.js 16.3.4** | Migración | Sin cambios. 27 advisories, ninguno parcheable en 14.x, y 14.2.35 es EOL confirmado. Además cambia el terreno de N11 (`maxDuration`) y de la CSP, así que hacerla después obligaría a rehacer trabajo |
| 2 | **Emisión: los cuatro que se tocan entre sí** | N5, N16, N17, N7 | Los cuatro viven en la ruta crítica de la factura y comparten los mismos ficheros. N5 y N16 son el mismo problema visto desde dos capas; N17 y N7 son el mismo problema en el protocolo de reconciliación. Separarlos multiplicaría los gates |
| 3 | **N11 — presupuesto de ejecución** | Medir Fluid compute, fijar `maxDuration` explícito, y bajar `SIIGO_POST_TIMEOUT_MS` a lo que quepa | Requiere tu respuesta sobre el panel. Todo el trabajo de la sesión 2 depende de que la función llegue a terminar |
| 4 | **N15 + N19 + N20 — frontera de admin y sesión** | Aislada, sin dependencias | Es una sesión corta y cierra el hueco que sobrevivió al chat 6a |
| 5 | **N8 + N13 + N14 — reescritura de notas crédito** | **Borrar `creditNote.test.ts` ANTES de tocar el mapper.** Reescribir mapper, esquema y ruta contra la tabla oficial. Añadir claim + marcador + reconciliación. Tests nuevos al final, marcando qué viene de doc y qué de respuesta capturada | La más grande. Va después de la 2 porque reutiliza el `invoiceReconciliation` ya corregido en vez de duplicarlo |
| 6 | **N10 — paginación de Provet** | `page_size=200`, `id__gt=` | Aislada |
| 7 | **CSP fase 2** | Tras ventana limpia en report-only | Sin cambios |
| 8 | **Higiene** | N1, N2, N3, N4, N6, N12, N18, N21, N22 + L2/L4 (unificar `America/Bogota` y `round2`/`toCents`) | Todo lo pequeño junto, una sola tanda de gates |
| 9 | **Deuda de tests** | Cambiar `vitest.config.ts` a `jsdom` + `.tsx`, y escribir tests para `invoiceClaims.ts` y `useConsultationQueue.ts` | Va al final porque hasta entonces el código de UI va a cambiar |

---

## 9. Del backlog, esto ya no merece la pena

| Elemento | Veredicto |
|---|---|
| **N9** — `===` sobre flotantes en `creditNote.ts:99` | **Bórralo.** El `refine` compara contra un campo `total` que no debe existir en el request. Desaparece con la reescritura de N8, no se arregla por separado |
| **`ANNULMENT_REASONS` con 5 motivos** | **Bórralo.** El flujo real de la app es siempre `reason: 2` (Anulación de factura electrónica). El desplegable ofrece una elección que la DIAN no reconoce. Un `reason` fijo con la etiqueta correcta es más honesto y menos código |
| **Las dos filas de `invoices` sin `claim`** (anomalía del chat 5) | **Bórralo del backlog como tarea de código.** Es limpieza de datos del día de cutover, ya tiene el SQL preparado. Arrastrarlo como hallazgo seis sesiones más no aporta nada |
| **`03_UI_UX_DESIGN_SPEC` — paginación explícita, `overflow: hidden`** | **Cerrado.** Verificado cumplido. Quítalo de cualquier lista de pendientes |
| **`ts-prune` y sus falsos positivos** | **Bórralo como tarea recurrente.** El coste de filtrar las líneas `(used in module)` en cada sesión supera al de un barrido manual una vez al año en un repo de 84 archivos |
| **Vercel Hobby → Pro** | **Reclasifícalo.** Deja de ser "infraestructura fuera de alcance": si N11 se confirma, es un **prerrequisito de corrección funcional**, no una mejora de plan |

---

## 10. Verificaciones en vivo pendientes

| # | Qué | Comando o acción exacta |
|---|---|---|
| 1 | ¿Fluid compute activo? (N11) | Vercel → Settings → Functions. Y buscar `FUNCTION_INVOCATION_TIMEOUT` en los logs de `/api/invoices` |
| 2 | Forma real de la respuesta de nota crédito (N8) | `POST https://api.siigo.com/v1/credit-notes` válido → guardar el **JSON crudo del 201** |
| 3 | Contradicción `reason` en la doc (N8) | El mismo POST con `reason: 7`. Si lo acepta, manda la tabla; si no, manda el esquema |
| 4 | Ventana de reconciliación (N17) | Emitir una factura y acto seguido `GET /v1/invoices?created_start=<hoy>&created_end=<hoy>`. Si vuelve vacía, confirmado |
| 5 | Zona horaria de `created` en Siigo (N17) | En el mismo listado, comparar `metadata.created` con la hora COT real de emisión |
| 6 | `GET /item/` de Provet (pendiente antiguo) | Reintentar con credenciales de producción |

---

## 11. Lo que no pude verificar

- **Los dos documentos de auditoría anteriores** no me fueron facilitados. La sección 2 queda incompleta a propósito, no por descuido.
- **La ejecución de mutación** no se realizó sobre el resto del suite. El caso de `creditNote.test.ts` quedó demostrado por contraste documental, que es evidencia más fuerte; extenderlo al resto requeriría una sesión dedicada.
- **`developers.siigolatam.com`** (los enlaces guardados en `Documentacion_siigo`) no es alcanzable. **El contenido vivo está en `developers.siigo.com/docs/siigoapi/`** — actualiza ese archivo. Desde ahí sí recuperé, completas: Introducción, Novedades, Códigos de estado, Manejo de errores (61 códigos con regex literales), Partner-Id, Idempotencia, Facturación electrónica, Crear/Listar/Editar Factura, Enviar por mail y **Crear Nota Crédito**.
- **`developers.provetcloud.com`** sí es alcanzable. Recuperados: Rate limit, Billing & Invoicing, ERP & Accounting Integration.
