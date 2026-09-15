# Evidencia observada de las APIs — Siigo Nube y Provet Cloud

> **Regla de uso para cualquier agente que lea esto.** Este documento clasifica lo
> que el proyecto cree saber de Siigo y Provet en tres estados, y **hay dos clases
> de evidencia con reglas distintas**:
>
> **Clase A — contratos de API.** Formas de request y response, códigos de error,
> semántica de campos. Son estables durante años. Aquí **OBSERVADO gana siempre**
> a la documentación oficial.
>
> **Clase B — límites de plataforma.** Timeouts, tamaños de página, cuotas,
> retención, planes. **Caducan.** Aquí OBSERVADO gana **solo dentro de su ventana
> de vigencia**; pasada esa fecha se reverifica contra la doc antes de usarlo para
> decidir nada.
>
> Esta distinción existe porque no tenerla ya costó un hallazgo ALTO: §3.1 declaraba
> un límite de Vercel de 2025 como OBSERVADO, ese dato ganaba a la documentación por
> la regla anterior, y todo el diagnóstico del presupuesto de ejecución de la emisión
> se construyó sobre un número caducado.
>
> **Estados:** **OBSERVADO** (capturado de una llamada real) · **DOCUMENTADO**
> (viene de la doc oficial y nadie lo ha visto en una respuesta — hipótesis, no
> contrato) · **SIN EVIDENCIA** (afirmado en el código sin nada que lo respalde).
>
> Si escribes código contra algo **DOCUMENTADO**, dilo explícitamente en el
> comentario del código y en tu reporte de sesión.
>
> **Última actualización:** 2026-09-15 (sesión 8).
> **Cambios de esta revisión:** §1.12 nueva — cierra N25 (cap de `observations` en
> nota crédito) con evidencia del portal de ayuda al cliente de Siigo, fuente
> distinta de la doc de API ya citada en H-5/§1.8. Pendiente de confirmación
> empírica en P-2.
>
> **Cambios de la revisión anterior (2026-09-10):** §3.1 corregida y reclasificada
> (era el dato caducado que originó N11) · §1.8 pasa de "sin verificar" a
> DOCUMENTADO con la tabla oficial · §1.9 pasa de SIN EVIDENCIA a DOCUMENTADO ·
> §2.3 y §2.4 ampliadas · §2.6 nueva.

**Documentos hermanos, en la raíz del repo:** `API_SIIGO_REFERENCIA_COMPLETA.md` y
`API_PROVET_CLOUD_REFERENCIA_COMPLETA.md`. Contienen la doc oficial capturada,
endpoint por endpoint. **Este documento no los duplica**: cuando algo está resuelto
allí, aquí queda un puntero y el estado de verificación, nada más.

---

## 1. Siigo Nube

### 1.1 OBSERVADO (clase A) — Respuesta de `POST /v1/invoices` en factura SIN timbrar

La clave `stamp` **no llega**. No llega como `null`: la clave está **ausente** del objeto.

Claves raíz presentes en la respuesta:

```
balance, cost_center, customer, date, document, id, items, mail, metadata,
name, number, observations, payments, prefix, public_url, seller, total
```

**Implicación en el código:** `siigoInvoiceRawResponseSchema` (`src/schemas/siigo.ts`)
usa `.nullish()` en `stamp` y sus campos internos. `.optional()` habría bastado para
el caso observado; `.nullable()` solo habría fallado. Se eligió `.nullish()` porque un
rechazo aquí ocurre **después** de un POST exitoso, y `POST /api/invoices` clasifica un
fallo de validación post-emisión como ambiguo, fijando el claim en `unknown` y
bloqueando una consulta cuya factura sí existe.

### 1.2 OBSERVADO (clase A) — El sandbox SÍ tiene tipos de documento electrónicos

**Versiones anteriores de este documento afirmaban que todos los tipos del sandbox eran
`NoElectronic`. Era falso.** Medido con `GET /v1/document-types` (2026-09-06):

```
FV:  72 ElectronicInvoice · 1 ContingencyInvoice · 1 ExportInvoice · 191 NoElectronic
NC:  19 ElectronicCreditNote · 37 NoElectronic
```

74 tipos electrónicos de FV y 19 de NC, la mayoría con `active: true`.

**Lo que sigue siendo cierto:** un `POST` con `stamp.send: true` devolvió en su momento:

```json
{
  "Code": "document_settings",
  "Message": "The send cannot be used, you must verify the document settings",
  "Params": ["stamp.send"]
}
```

**Lo que NO se ha determinado:** si ese error vino de apuntar a un tipo `NoElectronic`
o de un problema de permisos.

El sandbox de Siigo es **compartido / multi-tenant**: `GET /v1/document-types` devuelve
el catálogo global, con tipos de otras empresas (se ven nombres como "Nota Credito
Saludtools", "PRUEBA SANTIAGO NOTA CREDITO"). Que un tipo electrónico exista y esté
activo **no prueba que esta cuenta pueda emitir con él**.

**Candidato sospechoso:** `id=30640, code=312, "prueba fac elec",
electronic_type: NoElectronic, active: true`. El nombre sugiere configuración propia de
pruebas. Si es el `documentTypeId` mapeado en `catalog_mapping`, el error
`document_settings` se explica solo y **el sandbox nunca estuvo bloqueado**.

**Pendiente:** determinar cuál de los 74 pertenece a esta cuenta. Vía más limpia: entrar
a Siigo Nube por web con las credenciales de sandbox y mirar el catálogo de la propia
empresa, sin el ruido de otros tenants. **No cambiar el `documentTypeId` a uno de la
lista global** — emitir contra el tipo de otro tenant gastaría su consecutivo.

### 1.3 NO VERIFICADO (clase A) — Forma de un `stamp` poblado con CUFE

**Nadie en este proyecto ha visto jamás un `stamp` con CUFE.** Los campos `cufe`,
`cude`, `status`, `observations` y `errors` están modelados **según la documentación**,
no según una respuesta inspeccionada.

Riesgo concreto: si Siigo nombra esos campos de otra forma en producción, el
`.transform()` de `siigoInvoiceResponseSchema` devuelve `cufe: ""` y `status: "Draft"`
para una factura realmente aceptada — **sin lanzar y sin avisar**. La UI mostraría
"Borrador" para un documento timbrado ante la DIAN.

**Contrato de tolerancia que aplica aquí, y que es una decisión de diseño cerrada:**
el esquema tolera campos extra (`.passthrough()`), la lógica **nunca** tolera campos
ausentes. Un `transform` con defaults sobre un `stamp` incompleto está **prohibido**.
Si el campo no está, se lanza. El día que llegue la credencial real: o funciona, o
grita. Nunca miente.

Condiciones para verificarlo: credenciales de producción + `documentTypeId` **60345**
(FV-3, confirmado en la cuenta Siigo real; verificado que **no existe** en el catálogo
del sandbox). **Posible atajo:** si alguno de los 74 tipos electrónicos del sandbox
resulta ser de esta cuenta (ver §1.2), podría verificarse sin esperar a producción.

**Tarea pendiente:** en la primera emisión real, capturar el JSON crudo y actualizar
esta sección.

### 1.4 OBSERVADO (clase A) — El endpoint de listado no devuelve `stamp`

`GET /v1/invoices` (listado) **no incluye el bloque `stamp`**. Además, `observations`
llega como **nullable**: `src/services/invoiceReconciliation.ts:46` ya lo modela como
`z.string().nullable().optional()`.

Esto es precedente de que Siigo **sí envía `null`** en al menos un endpoint.

**Añadido 2026-09-10, DOCUMENTADO:** los parámetros `created_start` y `created_end` de
ese listado son `date-time` RFC3339. Se acepta `yyyy-MM-dd`, pero **una fecha sin hora
se interpreta como `T00:00:00`**, así que una factura creada hoy a las 10:00 queda fuera
de `created_end = hoy`. Es la causa de N17. Verificar en vivo si `metadata.created`
viene en COT o en UTC.

### 1.5 OBSERVADO (clase A) — HTTP 500 no determinista, ~10% de las emisiones

El sandbox devuelve HTTP 500 en aproximadamente **1 de cada 10** emisiones, de forma no
determinista.

Dos consecuencias medidas:
- Es necesario **reconciliar antes de reintentar**
  (`src/services/invoiceReconciliation.ts`): consultar si el documento existe usando un
  marcador en `observations`, y reintentar solo si se confirma su ausencia.
- Tras un 500, **la `Idempotency-Key` queda consumida permanentemente**. Un reintento
  debe generar una clave nueva; reusarla falla.

**Aplica igual a `POST /v1/credit-notes`**, que está en la misma lista de idempotencia.
Hoy esa ruta no tiene claim ni reconciliación (N13). **Anular por duplicado ante la DIAN
es peor que emitir por duplicado.**

### 1.6 OBSERVADO (clase A) — El sandbox es compartido / multi-tenant

Se ven datos de otras empresas. No asumir que los catálogos, consecutivos o documentos
listados pertenecen a esta clínica.

### 1.7 OBSERVADO (clase A) — Patrón correcto de IVA

`items.taxed_price` junto con `items.taxes` (con los ids del producto mapeado) es el
patrón correcto. Siigo deriva la base gravable sin inflar el total.

`siigoInvoiceItemSchema` impone una regla **XOR**: exactamente uno de `price` o
`taxed_price`, nunca ambos, nunca ninguno.

**Añadido 2026-09-10, DOCUMENTADO — colisión no resuelta.** El error
`invalid_total_payments` documenta el algoritmo que Siigo aplica:

```
ValorBase = Redondear(Cantidad × ValorUnitario − Descuento, 2)
IVA       = Redondear(ValorBase × %IVA / 100, 2)
TotalItem = Redondear(ValorBase + IVA, 2)
```

Provet entrega `sum_total` ya calculado (§2.1) y Siigo **recalcula desde `quantity` y
`price`**. Ambas reglas son correctas por separado y **pueden discrepar por redondeo**.
Nada en el código reconcilia las dos antes del POST. Se manifestará en la primera línea
con descuento o con un IVA que no redondee limpio, y el síntoma será
`invalid_total_payments` — que la capa de traducción presenta como un problema de datos
del cliente, mandando a la recepcionista a corregir un NIT que está bien.

### 1.8 DOCUMENTADO (clase A) — Nota crédito: el contrato ya no es desconocido

**Cambio de estado respecto a la revisión anterior.** Este bloque decía "sin verificar".
La documentación oficial se recuperó completa y está en
`API_SIIGO_REFERENCIA_COMPLETA.md`: tabla de campos, ejemplo cURL y respuesta 201.

Lo que eso reveló: **el mapper actual está construido contra un contrato inventado**
(hallazgo N8, CRÍTICO). Resumen de las divergencias, para que ninguna sesión futura
las reintroduzca:

| Campo | Doc oficial | Qué hace el código hoy |
|---|---|---|
| `invoice` | string, **GUID de la factura**; obligatorio si es electrónica | No existe; envía `base_document: {id, cufe}` |
| `date` | **Obligatorio** | Ausente del payload |
| `reason` | **entero 1-6**, motivo DIAN | `z.enum([...])` de strings |
| `items.price` | Obligatorio, **positivo** | Negado |
| `payments.value` | Obligatorio, **positivo** | Negado |
| `total` | **No es campo de request** | Se envía en la raíz |
| `customer`, `seller` | Solo si la factura NO existe en Siigo Nube | Se envían siempre |
| **Respuesta 201** | `cufe`, `cude`, `status` **bajo `stamp`** | Los espera en la raíz |

`reason: 2` = *Anulación de factura electrónica* es el único que corresponde al flujo
real de esta app.

**Contradicción interna de la doc, sin resolver:** la tabla de campos lista los motivos
`1,2,3,4,6,7`; el esquema del request declara `Value in: 1|2|3|4|5|6`. No coinciden.
Se resuelve con un POST real usando `reason: 7`.

**Sigue NO VERIFICADO:** la forma real del 201 y la restricción de año fiscal. Aplica el
contrato de tolerancia de §1.3.

**`stamp.send` debe ser `true` siempre en notas crédito**, por Resolución DIAN 000042.
Esto es una excepción a la regla de sandbox de `.clinerules §3`, que no la menciona.

**Precondición legal, DOCUMENTADO:** el error `invalid_document` establece que si el
comprobante tiene marcación electrónica, **debe haberse enviado a la DIAN para poder
aplicarle nota crédito**. No es falta de datos: es una condición del flujo.

### 1.9 DOCUMENTADO (clase A) — El saneado de comillas, resuelto sin experimento

**Cambio de estado: era SIN EVIDENCIA.** El catálogo de errores lo responde:

- `invalid_code`: regex `^[^'\s]+$` → el **código** no admite comilla simple ni espacios.
- `invalid_description` / `invalid_name`: el conjunto permitido **excluye `'`** pero
  **incluye `"`**.

Conclusión: la comilla simple sí se rechaza; la doble parece admitida. `sanitizeText()`
es **sobre-restrictivo pero seguro**, y la justificación escrita en el código ("Siigo
rechaza comillas") es **imprecisa, no falsa**. No hay que aflojarlo.

**La inconsistencia sí es un bug:** las líneas de factura sanean, las de nota crédito
(`src/mappers/creditNote.ts:44`) no.

### 1.10 DOCUMENTADO (clase A) — Ambigüedades de la doc y la decisión tomada

La doc de Siigo se contradice a sí misma en dos puntos. **En ambos se elige
deliberadamente el límite más restrictivo, porque la fuente es ambigua, no porque sea
el único valor posible.** Registrado aquí para que nadie lo lea como arbitrario:

| Punto | Contradicción | Decisión |
|---|---|---|
| Longitud de `Idempotency-Key` | La sección de Idempotencia dice **30**; el error `invalid_idempotency-key` dice **32** | **30** |
| Fecha de la factura | La tabla dice que no puede ser anterior a hoy; `invalid_date` habla de un margen de **±10 días** y a renglón seguido repite que no se admite fecha anterior a hoy | **Hoy en `America/Bogota`** |

**`Partner-Id`, DOCUMENTADO:** entre 3 y 100 caracteres **alfanuméricos**, sin espacios
ni caracteres especiales. El guion **es** carácter especial (N1).

### 1.11 DOCUMENTADO (clase A) — Errores que la capa de traducción no conoce

Faltan en la tabla de `01_PROJECT_REQUIREMENTS §3` y la recepción no puede
diagnosticarlos hoy:

- `invalid_dian_resolution` — resolución agotada por rango de fecha o consecutivo.
  **Parada dura en producción.**
- `customer_settings` — el tercero debe tener **contactos creados** en Siigo o la
  creación del documento falla.
- `blocked_transactions` — bloqueo por fecha configurado en Siigo Nube.

**Riesgo operativo, DOCUMENTADO:** Siigo bloquea temporalmente el usuario API si durante
7 días la proporción de errores supera el **80%** de las peticiones. Con el sandbox
devolviendo 500 en ~10% y sesiones largas de scripts de prueba, es alcanzable.

### 1.12 DOCUMENTADO (clase A) — Nota crédito: límite de `observations`, fuente distinta de la doc de API

**No es el mismo hallazgo que H-5, ni la misma fuente.** El límite de `observations`
de **factura** (500 → 4.000 caracteres, ya corregido en H-5) sale de
`API_SIIGO_REFERENCIA_COMPLETA.md` §3.1 — la doc de API para desarrolladores
(`developers.siigo.com`). Para **nota crédito**, esa misma doc de API (§4.1, tabla
de campos) no da un número: solo dice "Comentarios adicionales", sin cifra.

El número sí existe, pero en una fuente **distinta y no capturada hasta ahora en el
repo**: el **portal de ayuda al cliente** de Siigo (manuales de uso de la interfaz
web — `siigonube.portaldeclientes.siigo.com`, `posweb.portaldeclientes.siigo.com`
—, no documentación de API para integradores). Cinco páginas independientes de ese
portal (nota crédito sin referencia, con cargos y descuentos, con orden de compra y
entrega, en POS, y la nota débito hermana) repiten el mismo texto literal:
*"Observaciones: puedes incluir comentarios adicionales... Es posible ingresar
máximo 500 caracteres."*

**Conclusión:** el cap de 500 que ya tenía `creditNote.ts`
(`siigoCreditNoteSchema.observations: z.string().max(500)`) coincide con esta
fuente. No se tocó código — no hay nada que corregir.

**Sigue siendo más débil que OBSERVADO, y más débil que la doc de API citada en
H-5.** Es documentación oficial de Siigo, pero del manual de la interfaz web, no de
la API — el formulario y el endpoint podrían divergir; no hay garantía de que
compartan la misma validación de backend. Un POST real con más de 500 caracteres en
`observations` de nota crédito (dentro de **P-2**, cuando haya credenciales de
producción) es lo único que lo sube a OBSERVADO. Hasta entonces, DOCUMENTADO con
esta salvedad explícita, y **pendiente de confirmación empírica**.

---

## 2. Provet Cloud

### 2.1 OBSERVADO (clase A) — `invoicerow.sum_total` se lee literal

Los importes de línea **deben leerse tal cual** de `invoicerow.sum_total`. **Nunca**
recalcularse como `quantity × price_with_vat`.

Medido: antes de corregirlo, **19 de 33 consultas facturaban un importe incorrecto**.

**Corolario que el código incumple (N5):** que se lea literal **no autoriza a
descartar** las filas cuyo `sum_total` sea `<= 0`. Una fila de descuento o de ajuste es
un negativo normal. Filtrarlas hace que la suma cuadre consigo misma y que la DIAN
timbre el importe sin descuento. Filtrar solo `!Number.isFinite`.

### 2.2 OBSERVADO (clase A) — `modified__gte` en recursos hijos provoca subfacturación

Aplicar el filtro `modified__gte` a recursos hijos (`invoicerow`, `consultationitem`)
**descarta líneas modificadas antes de la ventana**, facturando de menos sin ningún
error. Se aplica **solo a `/consultation`**, jamás a los hijos.

### 2.3 OBSERVADO (clase A) — `/item/` devuelve 403

El endpoint de catálogo `/item/` responde **403** con las credenciales actuales. Por eso
la cola deriva los ítems mapeables de las consultas dentro de la ventana temporal, en
lugar del catálogo atemporal.

**Añadido 2026-09-10, DOCUMENTADO — el 403 puede tener salida.** El release del
2026-09-03 añadió `price_with_vat` a `/item/`, `/medicine/`, `/procedure/`, `/supply/`,
`/food/`, `/laboratoryanalysis/` y `/laboratoryanalysispanel/`. **Los catálogos por tipo
son endpoints distintos de `/item/`** y pueden no compartir el mismo permiso. Cuesta
cinco minutos con el token actual y, si alguno responde 200, el bloqueante desaparece
sin esperar a que Provet habilite nada.

Los endpoints de exportación `POST /item/export/start/` y `GET /item/export/status/`
(añadidos el 2026-08-20) cuelgan del mismo recurso `/item/` y **probablemente comparten
el 403**. Probar los de tipo primero.

### 2.4 OBSERVADO (clase A) + DOCUMENTADO — Autenticación y rate limiting

- Cabecera `Authorization: Bearer`.
- Responde **429 con `Retry-After`**; el cliente lo respeta.
- Paginación necesaria en `/consultation`.

**Añadido 2026-09-10, DOCUMENTADO — el detalle que cambia el diseño (N10).** Los límites
son **por endpoint**, en ventana deslizante de 60 segundos. `GET /invoice/` admite **60
peticiones por minuto**. Y el coste de una petición **no es uno**: el peso es
`ceil(page_size_solicitado / page_size_por_defecto)`. Con un default de 50, pedir
`page_size=1000` cuenta como **20 peticiones**. La doc recomienda literalmente preferir
páginas pequeñas combinadas con filtrado por `modified__gte` antes que pedir el máximo
en cada llamada, y usar `id__gt=` en lugar de paginar por encima de 10.000 registros de
desplazamiento.

Un `page_size` grande **no ahorra presupuesto de rate limit**: lo gasta igual.

### 2.5 NO VERIFICADO (clase A) — `consultationitem` vs `invoicerow`

El mapeo correcto entre ambos recursos, y las reglas de dosificación y cantidades
fraccionarias, **requieren datos de producción**. Es el hallazgo H6 de la auditoría de
Provet, el único de aquella tanda que sigue abierto.

### 2.6 DOCUMENTADO (clase A) — Lo que Provet expone y el código no lee

Sección nueva. Todo verificado como ausente en `src/` por grep:

- **`credited_invoicerow`** — marca una línea **ya abonada** en Provet. Facturarla igual
  es **sobrefacturación**. Cero apariciones en el código.
- **`invoicable_quantity`** — no es necesariamente igual a `quantity`. Cero apariciones.
- **`total_vat` / `total_with_vat`** — el invoice sí los expone y el esquema **sí los
  lee**, pero se usan como fuente **distinta** de las líneas: el total mostrado sale de
  `total_with_vat` y las líneas de `sum_total`, **sin ninguna comparación entre ambos en
  todo el código**. Ese assert es el control de mayor retorno del backlog.
- **`financial_period_lock_date`** — `GET /api/0.1/settings/department/<id>/` expone la
  fecha más temprana permitida para cualquier factura, pago o nota de crédito nueva, más
  un indicador de avance automático mensual. Es el gemelo del `blocked_transactions` de
  Siigo. Se manifiesta en la frontera de mes. Cero apariciones.
- **`external_info`** (`external_id` + `metadata`) — mecanismo nativo de write-back para
  marcar registros ya procesados. Si existe en `invoice`, es un ancla de idempotencia más
  robusta que la tabla `invoice_claims`, porque vive en el sistema origen. **Registrado
  como alternativa, no como tarea:** `invoice_claims` funciona y está probado.
- **El disparador entrante de anulación.** El ciclo de vida de la factura en Provet
  incluye el estado **99 (anulada)**, y las notas de crédito son **registros de factura
  nuevos marcados con `credit_note=true`**. Existen además los triggers 23 (línea
  borrada) y 60 (cargo extra tras la finalización). **Nada de eso llega a la
  integración**: se pollean `/consultation`, `/consultationitem` e `/invoicerow`, y cero
  apariciones de `credit_note` o `status__is`. Una factura timbrada ante la DIAN cuya
  anulación ocurrió solo en Provet deja un documento con validez fiscal vigente por una
  operación que la clínica considera revertida.

### 2.7 Confirmaciones — no cambiar nada

- El trigger **45 es "Consultation finalized"**. `01_PROJECT_REQUIREMENTS §1.2.1` es
  correcto.
- Enum autoritativo para el mapeo de pagos, `invoicepayment.payment_type`: 0 tarjeta,
  1 efectivo, 2 transferencia, 3 redondeo, 4 cheque, 5 vale, 6 factura consolidada,
  7 pago móvil, 9 tarjeta regalo, 10 financiera, 11 otro, 12 factura de crédito,
  15 reclamación de seguro. El **8 (prepago) no se acepta** en ese endpoint.
- `developers.provetcloud.com` **es accesible y recuperable por completo**, con
  changelog vía RSS y una página de cambios incompatibles anunciados. No hay ninguno
  planeado a fecha de hoy.
- `developers.siigolatam.com` **no es alcanzable**. El contenido vivo está en
  **`developers.siigo.com/docs/siigoapi/`**.

---

### 2.8 OBSERVADO (clase A) — Notas de crédito de Provet: forma, join y signo

**Medido el 2026-09-10** contra el tenant `awstest.provetcloud.com/9174` con las
credenciales de sandbox. Siete `GET`, ninguna escritura. Todo lo de esta sección
es **contrato del software de Provet**, no datos del tenant, salvo donde se diga.

**a) Una nota de crédito es un registro de factura nuevo, sin consulta.**

```
id=5   credit_note=False  consultation=.../consultation/4/  total_with_vat=1699.04  status=3
id=6   credit_note=True   consultation=None                 total_with_vat=125.00   status=3
id=10  credit_note=False  consultation=None                 total_with_vat=-29.22   status=3
id=13  credit_note=True   consultation=None                 total_with_vat=29.22    status=3
```

`consultation` es **`null` en toda nota de crédito**. El vínculo con el documento
original va por `credit_note_original_invoice`, que es una **URI absoluta**, no un
id: hay que extraer el id del path. A nivel de línea el vínculo es
`invoicerow.credited_invoicerow`, también URI.

**b) El signo NO identifica un abono.** Contraejemplos medidos, ambos:

| Documento | `credit_note` | `total_with_vat` | `quantity` de su línea |
|---|---|---|---|
| id=13 | **true** | **+29.22** | **−1.0** |
| id=6 | **true** | **+125.00** | **+2.0** |
| id=10 | false | **−29.22** | +1.0 |

Un abono puede llegar con importe positivo y cantidad positiva. Una factura
ordinaria puede llegar con importe negativo. **Los únicos marcadores fiables son
`invoice.credit_note` y `invoicerow.credited_invoicerow`.** Cualquier heurística
por signo es incorrecta.

**c) Un abono puede exceder la línea que abona.** `invoicerow/3` (factura 5) vale
62.50 con `qty 1.0`; la línea de abono de la factura 6 vale 125.00 con `qty 2.0`.
Ninguna reconciliación debe asumir `abono <= línea`.

**d) Existen filas con `sum_total` negativo.** `invoicerow/37`: `sum_total=-29.22`,
`qty=1.0`. Esto es lo que hace real —no teórico— el descarte silencioso de
`provetToQueue.ts:117`.

**e) `discount_amount` existe pero está a cero en todo el tenant** (`0.0` y `-0.0`).
**El mecanismo del descuento sigue NO VERIFICADO:** no se sabe si Provet crea una
fila negativa o lo aplica dentro de la fila. No escribir "descarta descuentos"
como si estuviera medido.
Trampa: `-0.0` en JSON se parsea como `-0` en JS, y `-0 <= 0` es `true`.

**f) `status` es `integer` y `readOnly`, sin enum publicado.** Las cuatro filas
traen `3`. **No hay evidencia del "estado 99 = anulada"** que se citó en
auditorías previas. No usar `status` como marcador de anulación.

### 2.9 OBSERVADO (clase A) — `/invoicerow/` SÍ se puede filtrar por su factura padre

**Medido el 2026-09-10.**

```
GET /invoicerow/?invoice__in=11,48  ->  8 filas
GET /invoicerow/                    ->  223 filas
```

El filtro **funciona**; no es el caso de "aceptado e ignorado". Esto corrige la
causa raíz escrita en `provetApi.ts:100-130`, que generalizó desde un único caso
medido (`consultationitem?consultation=`) a las seis colecciones.

El esquema OpenAPI explica la diferencia: **`/consultationitem/` no declara ningún
filtro por consulta — cero —** mientras que `/invoicerow/` declara `invoice__is`,
`invoice__in`, `invoice__is_not`, `invoice__is_null`, `invoice__not_in`.
`/invoice/` declara además `consultation__is`, `consultation__in`, `_status__is`,
`credit_note__is`, `modified__gte` e `id__gt`.

**Consecuencia:** `/invoicerow/` deja de traerse entera. `/consultationitem/`
se queda como está — para esa colección la causa raíz escrita era correcta.

**Pendiente de medir:** cuántos ids caben en un `invoice__in` antes de reventar el
límite de longitud de URL. Hay que lotear; el tamaño del lote se mide, no se elige.

### 2.10 OBSERVADO (clase A) — `page_size` por defecto = 50, y la barra final importa

**Medido el 2026-09-10.** El esquema no publica el `page_size` por defecto.
Llamando sin el parámetro, las colecciones con volumen suficiente devuelven **50**
(`/invoice/`, `/invoicerow/`, `/consultationitem/`). `/consultation/` 39,
`/client/` 11 y `/patient/` 16 **no son defaults**: son el total de registros del
tenant, menor que la página. **El default es 50.**

Con eso el peso del rate limit deja de ser estimación:

| `page_size` | Peso `ceil(pedido/50)` | Páginas hasta agotar 60 req/min |
|---|---|---|
| **1000 (hoy)** | **20** | **3** |
| 200 | 4 | 15 |
| 50 | 1 | 60 |

**Barra final:** `provetApi.ts:71` compone `${base}/invoice?page=1...`, sin barra.

```
GET /invoice   ->  301
GET /invoice/  ->  200
```

Cada página de la sincronización son **dos viajes de red**. Si Provet contabiliza
el `301` contra el presupuesto, el peso real es el doble del de la tabla. **No
verificado**: se comprueba mirando la cabecera de rate limit antes y después de
una llamada redirigida.

### 2.11 OBSERVADO (clase A) — El 403 de catálogo cubre TODOS los tipos

**Medido el 2026-09-10.** Los siete devuelven **403** con el token actual:
`/item/`, `/medicine/`, `/procedure/`, `/supply/`, `/food/`,
`/laboratoryanalysis/`, `/laboratoryanalysispanel/`.

**La hipótesis de que los catálogos por tipo esquivaran el permiso de `/item/` es
falsa.** El bloqueante no desaparece.

`GET /settings/department/<id>/` también devuelve **403** para los departamentos 1
y 2, así que **`financial_period_lock_date` no es verificable** con estas
credenciales.

El esquema OpenAPI nombra la familia de permisos como **`Settings: Items`**, distinta
de `General: Consultations` y `Financial: Invoices`. Eso es evidencia del esquema,
no una respuesta de la API: Provet devuelve `403` a secas. **Los dos 403 son la
misma petición de permisos a la clínica, no dos.**

### 2.12 DESCARTADO (clase A) — `external_info` no existe en `/invoice/`

El objeto `external_info` (`external_id` + `metadata`) existe **únicamente** bajo
`/unallocatedpayment/{...}/external_info/`. **No hay `external_info` en `invoice`**,
así que no es una alternativa a la tabla `invoice_claims`. Cerrado, no diferido.

El mecanismo nativo de write-back que sí existe es
**`POST /consultation/{id}/set_integration_status/`** y **`/mark_sent/`**.
Registrado como alternativa; no ejecutado.

---

## 3. Entorno y despliegue — **clase B, todo caduca**

> Nada de esta sección gana a la documentación fuera de su ventana de vigencia.
> Antes de usar cualquier cifra de aquí para decidir algo, comprobar la fecha.

### 3.1 CORREGIDO 2026-09-10 (clase B) — Límites de ejecución de Vercel

**La versión anterior de esta sección decía, marcada como OBSERVADO, que las funciones
cortan la conexión entre 10 y 60 segundos. Ese dato es de 2025 y ya no es válido.**
Como la regla antigua daba prioridad absoluta a lo observado, ese número gobernó el
diseño y produjo el hallazgo N11.

**Estado actual, DOCUMENTADO, vigencia a revisar el 2026-12-01:** con Fluid compute,
Hobby tiene **300 s por defecto y 300 s de máximo**; Pro y Enterprise, 300 s por defecto
y **800 s de máximo**.

**Lo que sigue siendo cierto y no caduca:** las invocaciones **no comparten estado**.
SSE o push real requiere un pub/sub externo. La alternativa implementada — **polling de
20 segundos** más refresco en `focus`/`visibilitychange` — sigue siendo la decisión
correcta, y no depende de la cifra que cambió.

**Lo que hay que medir, y nadie ha medido:** si este proyecto está en Fluid compute o
es un despliegue legacy. Vercel → Project → Settings → Functions. **Hasta que eso se
compruebe, ninguna afirmación sobre el presupuesto de tiempo de la emisión está
respaldada.** El peor caso de una emisión con reintento y reconciliación ronda los
**250 s**: cabe en 300, no cabe en 60.

`vercel.json` **no define** ningún bloque `functions` ni `maxDuration`, y ninguna ruta
lo exporta. Siigo recomienda esperas de **120 s** para la creación de comprobantes.

### 3.2 OBSERVADO (clase A) — TLS de Supabase

El certificado del pooler **no es de confianza por defecto** en el runtime serverless de
Vercel. La verificación TLS está activa y requiere suministrar el CA cert
(`SUPABASE_DB_CA_CERT`). **Nunca revertir a `rejectUnauthorized: false`.**

### 3.3 OBSERVADO (clase A) — Zona horaria

Las fechas de factura se calculan en **`America/Bogota`**. Antes de corregirlo, las
facturas emitidas entre ~19:00 y medianoche salían fechadas al día siguiente.

Deuda conocida: la lógica está **implementada tres veces** (`provetToSiigo.ts`,
`invoiceReconciliation.ts`, `consultationQueue.ts`). Es exactamente la lógica que ya
produjo un bug de producción, ahora triplicada.

### 3.4 OBSERVADO (clase A) — `npm audit fix --force` rompe el build

Subió Next de 14 a 16 en silencio y rompió el build de Vercel. **Nunca ejecutarlo en
este proyecto.** Sigue armado: el audit actual propone `next@16.3.4` como cambio
incompatible.

### 3.5 OBSERVADO (clase A) — Ruido de lockfile en el build, no bloqueante

`next build` emite, en Mac y en CI:

```
⚠ Found lockfile missing swc dependencies, patching...
⨯ Failed to patch lockfile, please try uninstalling and reinstalling next in this workspace
TypeError: Cannot read properties of undefined (reading 'os')
```

**No bloquea**: el build completa con `✓ Compiled successfully` y todas las páginas. Son
entradas de binarios opcionales `@next/swc-*` ausentes del lockfile. Desaparece con la
migración a Next 16. **No intentar arreglarlo con `npm audit fix --force`.**

### 3.6 DOCUMENTADO (clase B) — Retención de logs, vigencia a revisar el 2026-12-01

Runtime logs: **Hobby 1 hora · Pro 1 día · Enterprise 3 días**.

Consecuencia para un sistema fiscal: un fallo de emisión el viernes por la tarde es
indiagnosticable el lunes por la mañana **incluso en Pro**. Subir de plan resuelve el
cumplimiento del ToS, **no** la trazabilidad. Para eso hace falta un log drain externo
u Observability Plus.

Mitigación parcial ya existente: la tabla `invoices` conserva `form_snapshot` y
`observations`, así que el rastro **de negocio** de cada emisión sí persiste. Lo que se
pierde es el rastro **técnico** del fallo.

### 3.7 DOCUMENTADO (clase B) — Plan de Vercel, vigencia a revisar el 2026-12-01

Los equipos Hobby están restringidos a uso **personal no comercial**. La definición de
uso comercial incluye explícitamente cualquier deployment usado para el beneficio
económico de cualquiera implicado en cualquier parte de la producción del proyecto,
mencionando de forma literal a un empleado o consultor pagado que escribe el código, y
lista entre los ejemplos recibir pago por crear, actualizar u hospedar el sitio.

**Este proyecto cumple dos condiciones independientes.** El coste de no corregirlo no es
una multa: Hobby no factura excedentes, **pausa la funcionalidad** hasta que la ventana
de 30 días se reinicia. Para una clínica, eso son días sin poder facturar legalmente.

---

## 4. Cómo actualizar este documento

Cada vez que se capture una respuesta real que contradiga o confirme algo de aquí:

1. Mover el punto de **NO VERIFICADO** o **DOCUMENTADO** a **OBSERVADO**, o corregirlo.
2. Pegar la respuesta cruda, sin resumir y sin datos personales de clientes.
3. Anotar **la fecha y las condiciones** de la captura: sandbox o producción, qué
   `documentTypeId`, qué credenciales.
4. **Declarar la clase.** Si es un límite de plataforma (clase B), ponerle **fecha de
   revisión**. Sin fecha de revisión, un dato de clase B no puede marcarse OBSERVADO.
5. Si el punto queda cubierto por `API_SIIGO_REFERENCIA_COMPLETA.md` o
   `API_PROVET_CLOUD_REFERENCIA_COMPLETA.md`, **dejar aquí un puntero, no una copia**.
   Dos fuentes diciendo lo mismo con distinta antigüedad es el fallo que este documento
   existe para evitar.

Un dato observado de clase A gana a la documentación y a lo que asuma un modelo.
Un dato de clase B gana **solo dentro de su vigencia**.
