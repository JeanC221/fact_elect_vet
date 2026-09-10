# API de Siigo Nube (Colombia) — Referencia completa de endpoints

**Fecha de compilación:** 2026-09-09
**Base URL de producción:** `https://api.siigo.com`
**Documentación oficial:** `https://developers.siigo.com/docs/siigoapi/`
**Soporte técnico:** `soporteapi@siigo.com`

---

## 0. Cómo leer este documento

Cada endpoint lleva una marca de procedencia. **No mezcles los niveles al escribir código.**

| Marca | Significado |
|---|---|
| **[DOC]** | Recuperado literalmente de la documentación oficial de Siigo el 2026-09-09. Tabla de campos, ejemplo cURL y/o respuesta completos |
| **[SDK]** | Ruta y verbo confirmados en el SDK oficial `SiigoSAS/siigo_sdk_javascript` (generado con OpenAPI desde el contrato real). La ruta es fiable; **los campos no están verificados aquí** |
| **[TER]** | Confirmado en clientes de terceros ampliamente usados (MCP server `jdlar1/siigo-mcp` v3.2, SDKs de Python/PHP/Node). Fiable como indicio, **no como contrato** |
| **[OBS]** | Comportamiento observado en llamadas reales del proyecto `fact_elect_vet` (`EVIDENCIA_APIS.md`). **Gana sobre la documentación cuando se contradicen** |

**Advertencia importante sobre las dos URLs de documentación.** El proyecto guarda enlaces a `developers.siigolatam.com`, que **no responde**. El contenido vivo está en **`developers.siigo.com/docs/siigoapi/`**. La documentación también aparece en `siigoapi.docs.apiary.io`, que es la versión antigua y requiere JavaScript.

**Advertencia sobre Siigo API México.** Existe un producto paralelo en `https://api.siigo.mx` documentado en `/docs/siigoapimexico/`. **No es compatible.** Usa un header adicional obligatorio `SiigoAPI-Application-Id`, `rfc_id` en vez de `identification`, y un objeto `payment` singular en vez de `payments[]`. Si un ejemplo que encuentras en internet incluye `SiigoAPI-Application-Id` o `"use": "G01"`, es de México y no aplica.

---

## 1. Fundamentos

### 1.1 Autenticación — `POST /auth`

**[DOC/OBS]** Client Credentials. Devuelve un JWT con validez de 24 h.

```
POST https://api.siigo.com/auth
Content-Type: application/json

{
  "username": "<usuario API>",
  "access_key": "<access key>"
}
```

Respuesta:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

Las credenciales se generan en **Siigo Nube → Alianzas → Mi credencial API**, que entrega tres valores: **Partner-ID**, **Usuario API** y **Access Key**. Requiere un plan compatible (Profesional Independiente, Emprendedor o Premium).

El token se envía después como `Authorization: Bearer <access_token>`.

**Recomendación práctica:** cachear el token y renovarlo antes de expirar. Si rotas el `access_key` manteniendo el mismo `Partner-Id`, **la clave de caché debe incluir el access_key**, o seguirás usando un token emitido con la credencial vieja.

### 1.2 Header `Partner-Id` — obligatorio en TODAS las peticiones

**[DOC]** `developers.siigo.com/docs/siigoapi/partner-id/`

> En todos los request que envíes a Siigo API debes enviar un Header llamado `Partner-Id`, en el "value" de este header se debe enviar el nombre del software/aplicación que estás integrando con Siigo Nube, este debe tener **entre 3 y 100 caracteres alfanuméricos, sin espacios en blanco ni caracteres especiales**.

- Si integras varias empresas, **envía el mismo valor para todas**.
- Siigo monitorea este header y **bloquea a los usuarios API que no envíen información real**.
- Omitirlo → error `header_required`.
- Formato inválido → error `invalid_partner_id`.

> ⚠️ **El guion es carácter especial.** `mi-app` es inválido; `miapp` es válido.

### 1.3 Header `Idempotency-Key`

**[DOC]** `developers.siigo.com/docs/siigoapi/idempotencia/`

Aplica **solo a POST** de estos cuatro comprobantes:

- `POST /v1/invoices`
- `POST /v1/credit-notes`
- `POST /v1/journals`
- `POST /v1/vouchers`

Características oficiales: **opcional, alfanumérico, sin caracteres especiales, sin espacios en blanco, máximo 30 caracteres**.

> **Contradicción documentada en la propia doc de Siigo:** la página de Idempotencia dice **máximo 30**; el error `invalid_idempotency-key` en la página de Manejo de errores dice **máximo 32**. Usa 30 y quédate del lado seguro.

No lo envíes en GET, PUT ni DELETE — no tiene efecto.

**Comportamiento documentado:** si reenvías la misma clave y el documento ya existe, Siigo devuelve la información del comprobante creado previamente.

> **[OBS] — CONTRADICE LA DOCUMENTACIÓN.** En el sandbox, **un HTTP 500 consume la clave de forma permanente**. El reintento con la misma clave falla. Debes generar una clave nueva. Esto está medido, no supuesto.

### 1.4 Límites de peticiones

**[DOC]**

| Entorno | Límite |
|---|---|
| Producción | **100 peticiones / minuto por empresa** |
| Empresa de pruebas (sandbox) | **10 peticiones / minuto** |

Al superarlo: HTTP **429**, error `requests_limit`. Siigo recomienda **retirada exponencial**.

### 1.5 Tiempos de respuesta

**[DOC]** Media por debajo de 2 segundos, pero:

> Recomendamos establecer tiempos de espera de **120 segundos o más**, especialmente en creaciones de comprobantes, ya que en picos altos algunas transacciones podrían tardar más de lo esperado.

> ⚠️ **Choque con plataformas serverless.** Vercel, Netlify Functions y Lambda tienen límites de duración. Si tu función muere antes que el timeout de 120 s, pierdes la respuesta de un documento que **puede haberse creado igualmente**. Diseña la reconciliación asumiendo esto.

### 1.6 Bloqueo de usuarios

**[DOC]** `developers.siigo.com/docs/siigoapi/bloqueo-de-usuarios/`

> Se bloqueará de manera temporal tu usuario de Siigo API si realizas un uso incorrecto del servicio: **si durante 7 días la proporción de errores supera el 80 % del total de requests**, serás notificado por mail con el bloqueo temporal, hasta que hagas las correcciones.

Consecuencia práctica: un bucle de reintentos mal diseñado no solo falla — **te puede dejar sin API**.

### 1.7 Códigos de estado HTTP

**[DOC]** `developers.siigo.com/docs/siigoapi/codigos-de-estado-http/`

| Código | Mensaje | Descripción |
|---|---|---|
| 200 | OK | La solicitud ha tenido éxito |
| 201 | Created | Éxito y se ha creado un recurso nuevo |
| 400 | Bad Request | Problema del lado del cliente, a menudo falta un parámetro obligatorio |
| 401 | Unauthorized | No se ha proporcionado un `access_token` válido |
| 403 | Forbidden | El usuario del token no tiene permisos para la solicitud |
| 404 | Not Found | El recurso no existe |
| 408 | Request Timeout | Siigo no completó la solicitud en el tiempo previsto |
| 409 | Conflict | Petición válida, pero pondría los recursos en un estado inconsistente |
| 415 | Unsupported media type | Media type no soportado (esperaba JSON, recibió XML) |
| 429 | Too Many Requests | Rate limiting. Máximo 100 peticiones por minuto |
| 500 | Internal Server Error | Error no controlado durante el proceso |
| 503 | Service Unavailable | Sobrecarga temporal o mantenimiento programado |
| 504 | Timed Out | Siigo no pudo responder en los tiempos requeridos |

> **[OBS]** El sandbox devuelve **HTTP 500 en aproximadamente 1 de cada 10 POST de factura**, de forma no determinista y con payload idéntico. **Trátalo como condición normal, no como excepción.**

### 1.8 Estructura de errores

**[DOC]**

```json
{
  "Status": 400,
  "Errors": [
    {
      "Code": "parameter_required",
      "Message": "The field code is required",
      "Params": ["code"],
      "Detail": "Check the API documentation: [url_to_documentation]"
    }
  ]
}
```

| Campo | Significado |
|---|---|
| `Status` | Código HTTP |
| `Code` | Cadena corta manejable programáticamente |
| `Message` | Explicación del error |
| `Params` | Parámetro relacionado, si el error es específico de uno |
| `Detail` | Detalle adicional |

El catálogo completo de 61 códigos está en la **sección 6**.

### 1.9 Paginación

**[DOC/TER]** Los listados devuelven:

```json
{
  "pagination": { "page": 1, "page_size": 25, "total_results": 250 },
  "results": [ ... ],
  "__links": { "previous": {...}, "self": {...}, "next": {...} }
}
```

Parámetros: `page`, `page_size`. **[TER]** El límite de `page_size` es **100** en varios recursos (productos, clientes, usuarios).

### 1.10 Formatos de fecha

**[DOC]**

- Fecha: `yyyy-MM-dd`
- Fecha y hora en UTC: `yyyy-MM-ddTHH:mm:ssZ` (RFC3339)

> ⚠️ **Regla crítica de facturación electrónica:** en facturas de venta y notas crédito **de tipo electrónico**, la `date` **no puede ser anterior a la fecha actual**. Además, `invalid_date` menciona un límite de **±10 días** respecto de la fecha actual para facturas electrónicas. Si facturas consultas de días pasados, la fecha del documento debe ser **hoy**, no la del hecho económico.

---

## 2. Mapa completo de endpoints

Todos bajo `https://api.siigo.com`. Todos requieren `Authorization: Bearer` y `Partner-Id`.

### Autenticación
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/auth` | Obtener access token (24 h) | **[DOC]** |

### Facturas de venta (FV)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/invoices` | Crear factura de venta | **[DOC]** |
| GET | `/v1/invoices` | Listar facturas (paginado, filtrable) | **[DOC]** |
| GET | `/v1/invoices/{id}` | Consultar factura por GUID | **[SDK]** |
| PUT | `/v1/invoices/{id}` | Editar factura | **[DOC]** |
| DELETE | `/v1/invoices/{id}` | Eliminar factura | **[SDK]** |
| POST | `/v1/invoices/{id}/annul` | Anular factura | **[SDK]** |
| POST | `/v1/invoices/{id}/stamp` | Enviar a la DIAN (timbrar) una factura ya creada | **[SDK]** |
| GET | `/v1/invoices/{id}/stamp/errors` | Errores de rechazo DIAN de una factura rechazada | **[SDK]** |
| POST | `/v1/invoices/{id}/mail` | Enviar factura por correo (hasta 5 copias) | **[DOC]** |
| GET | `/v1/invoices/{id}/pdf` | Descargar PDF (base64) | **[SDK]** |
| GET | `/v1/invoices/{id}/xml` | Descargar XML electrónico (base64) | **[TER]** |
| POST | `/v1/invoices/batch` | Crear facturas por lote (asíncrono, notifica por webhook) | **[TER]** |

### Notas crédito (NC)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/credit-notes` | Crear nota crédito | **[DOC]** |
| GET | `/v1/credit-notes` | Listar notas crédito (paginado) | **[SDK]** |
| GET | `/v1/credit-notes/{id}` | Consultar nota crédito por GUID | **[SDK]** |
| GET | `/v1/credit-notes/{id}/pdf` | Descargar PDF de la nota crédito | **[SDK]** |

### Cotizaciones (C)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/quotations` | Crear cotización | **[TER]** |
| GET | `/v1/quotations` | Listar cotizaciones | **[TER]** |
| GET | `/v1/quotations/{id}` | Consultar cotización | **[TER]** |
| PUT | `/v1/quotations/{id}` | Editar cotización | **[TER]** |
| DELETE | `/v1/quotations/{id}` | Eliminar cotización | **[TER]** |

### Recibos de caja / Vouchers (RC)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/vouchers` | Crear recibo de caja | **[SDK]** |
| GET | `/v1/vouchers` | Listar recibos de caja | **[SDK]** |
| GET | `/v1/vouchers/{id}` | Consultar recibo de caja | **[SDK]** |
| POST | `/v1/vouchers/{id}/stamp` | Enviar recibo electrónico a la DIAN | **[SDK]** |
| POST | `/v1/vouchers/{id}/mail` | Enviar recibo por correo | **[SDK]** |

### Recibos de pago / egreso (RP)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/payment-receipts` | Crear recibo de pago / comprobante de egreso | **[TER]** |
| GET | `/v1/payment-receipts` | Listar | **[TER]** |
| GET | `/v1/payment-receipts/{id}` | Consultar | **[TER]** |
| PUT | `/v1/payment-receipts/{id}` | Editar | **[TER]** |
| DELETE | `/v1/payment-receipts/{id}` | Eliminar | **[TER]** |

### Facturas de compra (FC)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/purchases` | Crear factura de compra o gasto | **[TER]** |
| GET | `/v1/purchases` | Listar facturas de compra | **[TER]** |
| GET | `/v1/purchases/{id}` | Consultar factura de compra | **[TER]** |
| PUT | `/v1/purchases/{id}` | Editar factura de compra | **[DOC]** |
| DELETE | `/v1/purchases/{id}` | Eliminar factura de compra | **[TER]** |

### Documentos soporte (DS)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/purchase-support-documents` | Crear documento soporte | **[TER]** |
| GET | `/v1/purchase-support-documents` | Listar | **[TER]** |
| GET | `/v1/purchase-support-documents/{id}` | Consultar | **[TER]** |
| PUT | `/v1/purchase-support-documents/{id}` | Editar | **[TER]** |
| DELETE | `/v1/purchase-support-documents/{id}` | Eliminar | **[TER]** |

### Comprobantes contables (CC)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/journals` | Crear comprobante contable (débitos = créditos) | **[SDK]** |
| GET | `/v1/journals` | Listar comprobantes contables | **[SDK]** |
| GET | `/v1/journals/{id}` | Consultar comprobante contable | **[SDK]** |

### Clientes / terceros
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/customers` | Crear cliente, proveedor u otro tercero | **[DOC]** |
| GET | `/v1/customers` | Listar terceros (paginado, filtrable) | **[SDK]** |
| GET | `/v1/customers/{id}` | Consultar tercero por GUID | **[SDK]** |
| PUT | `/v1/customers/{id}` | Actualizar tercero | **[DOC]** |
| DELETE | `/v1/customers/{id}` | Eliminar tercero | **[SDK]** |

### Productos y servicios
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/products` | Crear producto, servicio, bien de consumo o combo | **[SDK]** |
| GET | `/v1/products` | Listar productos (paginado, filtrable) | **[SDK]** |
| GET | `/v1/products/{id}` | Consultar producto por GUID | **[DOC]** |
| PUT | `/v1/products/{id}` | Actualizar producto | **[SDK]** |
| DELETE | `/v1/products/{id}` | Eliminar producto | **[SDK]** |

### Grupos de inventario (clasificaciones)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| GET | `/v1/account-groups` | Listar clasificaciones de inventario | **[SDK]** |
| POST | `/v1/account-groups` | Crear clasificación de inventario | **[TER]** |
| PUT | `/v1/account-groups/{id}` | Editar clasificación de inventario | **[TER]** |

### Webhooks
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/webhooks` | Suscribirse a un evento | **[DOC]** |
| GET | `/v1/webhooks` | Listar suscripciones | **[TER]** |
| PUT | `/v1/webhooks/{id}` | Actualizar suscripción | **[TER]** |
| DELETE | `/v1/webhooks/{id}` | Eliminar suscripción | **[TER]** |

### Catálogos (todos de solo lectura)
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| GET | `/v1/document-types` | Tipos de comprobante (FV, NC, RC, FC, CC, RP, C, DS) | **[SDK]** |
| GET | `/v1/payment-types` | Formas de pago | **[SDK]** |
| GET | `/v1/taxes` | Impuestos (IVA, Retefuente, ReteIVA, ReteICA, Ad Valorem…) | **[SDK]** |
| GET | `/v1/cost-centers` | Centros de costo | **[SDK]** |
| GET | `/v1/users` | Usuarios / vendedores | **[SDK]** |
| GET | `/v1/warehouses` | Bodegas | **[SDK]** |
| GET | `/v1/price-lists` | Listas de precios (hasta 12) | **[SDK]** |
| GET | `/v1/fixed-assets` | Activos fijos | **[SDK]** |
| GET | `/v1/asset-groups` | Grupos de activos | **[SDK]** |
| GET | `/v1/available-documents` | Saldo de documentos disponibles del cliente | **[SDK]** |
| GET | `/v1/cities` | Ciudades de Colombia | **[TER]** |
| GET | `/v1/id-types` | Tipos de identificación | **[TER]** |
| GET | `/v1/fiscal-responsibilities` | Responsabilidades fiscales | **[TER]** |
| GET | `/v1/expenses` | Conceptos de gasto (ajustes en recibos de caja) | **[TER]** |
| GET | `/v1/misc-income` | Conceptos de ingreso vario (recibos de caja) | **[TER]** |

### Reportes
| Verbo | Ruta | Descripción | Marca |
|---|---|---|---|
| POST | `/v1/test-balance-report` | Balance de prueba general (genera Excel) | **[SDK]** |
| POST | `/v1/test-balance-report-by-thirdparty` | Balance de prueba por tercero | **[SDK]** |
| GET | `/v1/accounts-payable` | Reporte de cuentas por pagar | **[SDK]** |

**Total: 68 operaciones sobre 19 recursos.**

---

## 3. Facturas de venta — el recurso principal

### 3.1 `POST /v1/invoices` — Crear factura **[DOC]**

Prerrequisito: **el cliente debe existir y estar activo en Siigo Nube**, o crearse en la misma petición (ver 3.2).

#### Campos raíz

| Campo | Tipo | Obligatorio | Características |
|---|---|---|---|
| `document.id` | number | **Sí** | Tipo de comprobante. Debe existir. Consultar `/document-types` |
| `date` | date | **Sí** | `yyyy-MM-dd`. **Para electrónicas NO puede ser anterior a la fecha actual** |
| `number` | number | No | Consecutivo. Si se envía, no debe existir ya en Nube |
| `customer.identification` | string | **Sí** | Debe existir y estar activo |
| `customer.branch_office` | number | No | Por defecto 0 |
| `seller` | number | **Sí** | ID del vendedor. Consultar `/users` |
| `stamp` | object | No | `{"send": true}` → envía a la DIAN. **Por defecto `false`** |
| `mail` | object | No | `{"send": true}` → envía por correo. **Por defecto `false`** |
| `observations` | string | No | **Máximo 4.000 caracteres** |
| `retentions` | array | No | IDs de ReteICA, ReteIVA o Autorretención. Consultar `/taxes` |
| `advance_payment` | number | No | Anticipo o copago. Máx 2 decimales. Positivo y no mayor al total |
| `cost_center` | number | No | Debe existir y estar activo |
| `currency.code` | string | No | Requiere configuración de moneda extranjera |
| `currency.exchange_rate` | number | No | Idem |
| `additional_fields` | object | No | `purchase_order` y `delivery_order`. Máx 20 caracteres por campo |
| `global_discounts` | array | No | Descuentos globales |
| `global_charges` | array | No | Cargos globales |
| `healthcare_company` | object | Sí en sector salud | Ver 3.6 |

#### Campos de ítem

| Campo | Tipo | Obligatorio | Características |
|---|---|---|---|
| `items.code` | string | **Sí** | Código único del producto. Debe existir y estar activo |
| `items.description` | string | No | Comportamiento según la configuración de descripción larga |
| `items.quantity` | number | **Sí** | **Máximo 2 decimales** |
| `items.price` | number | **Sí** | Precio unitario. **Máximo 6 decimales** |
| `items.taxed_price` | number | No | Precio **con IVA incluido**. **Si se envía, reemplaza `items.price`** |
| `items.discount` | number | No | Por valor o porcentaje según configuración |
| `items.seller` | number | Condicional | Obligatorio si está activa la configuración "vendedor por ítem" |
| `items.warehouse` | number | No | Debe existir y estar activa |
| `items.taxes[].id` | number | No | ID del impuesto. **No se permiten dos del mismo tipo por ítem** |
| `items.tax_base` | number | Condicional | Obligatorio si `price` es 0 (obsequios). Máx 11 enteros y 2 decimales |
| `items.taxpayer` | string | Condicional | Obligatorio si `price` es 0. Solo `"Customer"` o `"Company"` |
| `items.customer.identification` | string | No | Ingresos para terceros. Requiere `customer_by_item: true` en el tipo de documento |
| `items.transport.*` | object | No | Sector transporte de carga. Ver 3.7 |

#### Campos de pago

| Campo | Tipo | Obligatorio | Características |
|---|---|---|---|
| `payments[].id` | number | **Sí** | Medio de pago. Consultar `/payment-types`. **Solo se permite UN medio con vencimiento** |
| `payments[].value` | number | **Sí** | Máximo 2 decimales |
| `payments[].due_date` | string | Condicional | **Obligatorio si el medio de pago maneja vencimiento**. `yyyy-MM-dd` |

#### Límites duros

| Límite | Valor |
|---|---|
| Ítems por factura | **500** |
| Impuestos por ítem | **3** |
| Contactos por cliente | **10** |
| Listas de precio por producto | **12** |
| Monto máximo por ítem | 99.999.999.999,99 |
| Total de `payments` | máx. 9.999.999.999.999,99 |
| Copias por correo | 5 direcciones |

#### Regla de cuadre — la más importante

**[DOC]** Error `invalid_total_payments`. Siigo valida que la suma de `payments[i].value` coincida con la suma de los totales de ítem, y **calcula el total de ítem así**:

```
ValorBase = Redondear(Cantidad × ValorUnitario − Descuento, 2)
IVA       = Redondear((ValorBase × PorcentajeIVA) / 100, 2)
TotalItem = Redondear(ValorBase + IVA, 2)
```

Ejemplo oficial: `Cantidad=10`, `ValorUnitario=100.00`, `Descuento=50.00` → `ValorBase=950.00`, `IVA(19%)=180.50`, `TotalItem=1130.50`.

> Si construyes `payments[].value` por un camino de redondeo distinto al de Siigo, la factura se rechaza. **Redondea cada línea antes de sumar, exactamente como arriba.**

#### Ejemplo de petición

```bash
curl -X POST "https://api.siigo.com/v1/invoices" \
  -H "Authorization: Bearer <token>" \
  -H "Partner-Id: miapp" \
  -H "Idempotency-Key: a1b2c3d4e5f6" \
  -H "Content-Type: application/json" \
  -d '{
    "document": { "id": 24446 },
    "date": "2026-09-09",
    "customer": { "identification": "13832081", "branch_office": 0 },
    "seller": 629,
    "observations": "Consulta veterinaria",
    "items": [
      { "code": "SRV-001", "description": "Consulta general",
        "quantity": 1, "taxed_price": 119000,
        "taxes": [ { "id": 13156 } ] }
    ],
    "payments": [ { "id": 5636, "value": 119000 } ],
    "stamp": { "send": true },
    "mail":  { "send": true }
  }'
```

#### Respuesta 201 — forma real

```json
{
  "id": "63f918c2-ca65-4edc-a7db-66bcdd5159fb",
  "document": { "id": 22 },
  "prefix": "FV",
  "number": 25,
  "name": "FV-2-22",
  "date": "2026-09-09",
  "customer": { "id": "...", "identification": "13832081", "branch_office": 0 },
  "cost_center": 235,
  "currency": { "code": "USD", "exchange_rate": 3825.03 },
  "seller": 629,
  "retentions": [ ... ],
  "advance_payment": 0,
  "total": 119000,
  "balance": 0,
  "observations": "...",
  "items": [ { "id": "...", "code": "...", "quantity": 1, "price": 100000,
               "discount": { "percentage": 0, "value": 0 },
               "taxes": [ { "id": 13156, "name": "IVA 19%", "type": "IVA",
                            "percentage": 19, "value": 19000, "base_value": 100000 } ],
               "total": 119000 } ],
  "payments": [ { "id": 5636, "name": "Efectivo", "value": 119000 } ],
  "stamp": { "status": "...", "cufe": "...", "cude": "...",
             "observations": "...", "errors": "..." },
  "mail": { "status": "...", "observations": "..." },
  "metadata": { "created": "...", "last_updated": "...", "stock_updated": "..." },
  "annulled": false
}
```

> ⚠️ **`cufe` y `status` viven ANIDADOS bajo `stamp`, nunca en la raíz.** Es el error de modelado más común contra esta API.

> ⚠️ **[OBS] — el bloque `stamp` puede estar AUSENTE.** Medido en el sandbox: cuando `stamp.send` es `false`, la clave `stamp` **no llega como `null`, simplemente no está**. Las claves raíz observadas fueron: `balance, cost_center, customer, date, document, id, items, mail, metadata, name, number, observations, payments, prefix, public_url, seller, total`. Un esquema que exija `stamp` o que lo modele como `nullable` pero no `optional` **falla después de un POST exitoso**, que es el peor momento posible.

#### Estados de factura electrónica **[DOC]**

| Estado | ¿Recibido por la DIAN? | Descripción |
|---|---|---|
| `Draft` | NO | Guardada en Siigo Nube pero no enviada a la DIAN. **No tiene CUFE** |
| `Accepted` | SÍ | Enviada y aceptada por la DIAN |
| `Rejected` | NO | Enviada con errores y rechazada. Debe corregirse y reenviarse desde Siigo Nube |

### 3.2 Crear el cliente desde la propia factura **[DOC]**

Se puede evitar el `POST /v1/customers` previo enviando el objeto `customer` completo:

```json
{
  "customer": {
    "person_type": "Person",
    "id_type": "13",
    "identification": "209048401",
    "branch_office": "0",
    "name": ["Manuel", "Camacho"],
    "address": {
      "address": "Cra. 18 #79A - 42",
      "city": { "country_code": "CO", "state_code": "11", "city_code": "11001" }
    },
    "phones": [ { "number": "3006003344" } ],
    "contacts": [ { "first_name": "Manuel", "last_name": "Camacho",
                    "email": "manuel@ejemplo.com" } ]
  }
}
```

| Campo | Obligatorio | Restricción |
|---|---|---|
| `person_type` | Sí | Solo `"person"` o `"company"` |
| `id_type` | Sí | Código del tipo de documento (13 = cédula, 31 = NIT) |
| `identification` | Sí | Sin caracteres especiales, **máx 50 caracteres** |
| `name` | Sí | `Company`: 1 elemento. `Person`: 2 elementos. Máx 100 caracteres cada uno |
| `address.address` | Sí | Alfanumérico, máx 256 caracteres |
| `address.city.country_code` | Sí | Ej. `"CO"` |
| `address.city.state_code` | Sí | Ej. `"11"` (Bogotá D.C.) |
| `address.city.city_code` | Sí | Ej. `"11001"` (Bogotá) |
| `contacts.first_name` | Sí | Máx 50 caracteres |
| `contacts.email` | No | **Sin espacios ni caracteres especiales**, máx 100 caracteres |

### 3.3 `GET /v1/invoices` — Listar facturas **[DOC]**

| Parámetro | Descripción |
|---|---|
| `document_id` | Filtra por ID de tipo de comprobante |
| `customer_identification` | Filtra por identificación del cliente |
| `customer_branch_office` | Filtra por sucursal |
| `name` | Nombre completo del documento, ej. `FV-003-457` |
| `created_start` / `created_end` | Rango por fecha de **creación** |
| `date_start` / `date_end` | Rango por fecha de **elaboración** |
| `updated_start` / `updated_end` | Rango por fecha de última modificación |
| `page`, `page_size` | Paginación |

Formato: `yyyy-MM-dd` o `yyyy-MM-ddTHH:mm:ssZ`.

> ⚠️ **Trampa de fechas sin hora.** Los parámetros están documentados como `date-time` RFC3339. Una fecha sin hora se interpreta como `T00:00:00`. **`created_end=<hoy>` excluye todo lo creado hoy después de medianoche.** Si buscas un documento recién creado, usa mañana como `created_end` o directamente no lo envíes.

> ⚠️ **[OBS] El listado NO devuelve el bloque `stamp`.** No hay CUFE ni estado DIAN en la respuesta del listado, aunque la documentación los muestre en el esquema. Para obtenerlos hay que hacer una segunda llamada a `GET /v1/invoices/{id}`. Además, `observations` llega como **nullable** en el listado.

### 3.4 `PUT /v1/invoices/{id}` — Editar factura **[DOC]**

Mismo cuerpo que la creación. `{id}` es un GUID `00000000-0000-0000-0000-000000000000`.

Restricción documentada: en facturas electrónicas ya enviadas a la DIAN, los campos que afectan al documento fiscal **no son editables** (error `non_editable`).

### 3.5 `POST /v1/invoices/{id}/mail` — Enviar por correo **[DOC]**

```bash
curl -X POST "https://api.siigo.com/v1/invoices/{id}/mail" \
  -H "Authorization: Bearer <token>" \
  -H "Partner-Id: miapp" \
  -d '{
    "guid": "a84cb564-8217-4061-98d6-4e0128e517c1",
    "mail_to": "cliente@ejemplo.com",
    "copy_to": "a@x.com;b@x.com"
  }'
```

`copy_to` acepta **máximo 5 direcciones**, separadas por punto y coma.

### 3.6 Sector salud (Resolución 948) **[DOC]**

Desde el 22 de julio de 2025 se pueden enviar distintos tipos de operación.

| Campo | Obligatorio | Descripción |
|---|---|---|
| `healthcare_company.operation_type` | Sí en sector salud | `SS-CUFE`, `SS-SinAporte` o `SS-Recaudo` |
| `period_start` / `period_end` | Sí en `SS-CUFE` y `SS-SinAporte` | `AAAA-MM-DD` |
| `payment_method` | No | Modalidad de pago (ver tabla) |
| `service_plan` | No | Cobertura / plan de servicios (ver tabla) |
| `policy_number` | No | Máx 50 caracteres |
| `contract_number` | No | Máx 64 caracteres. **Excluyente con `policy_number` y `non_contract_invoice_reason`** |
| `copayment` | No | Copago. Solo `SS-CUFE` |
| `coinsurance` | No | Cuota moderadora. Solo `SS-CUFE` |
| `cost_sharing` | No | Pagos compartidos. Solo `SS-CUFE` |
| `recovery_charge` | No | Cuota de recuperación. Solo `SS-CUFE` |
| `non_contract_invoice_reason` | Condicional | Obligatorio si no se envía `contract_number` |

En `SS-CUFE` hay que enviar **al menos uno** de los cuatro campos de recaudo.

**`payment_method`:** `01` Pago individual por caso · `02` Pago global prospectivo · `03` Pago por capitación · `04` Pago por evento

**`service_plan`:** `02` Presupuesto máximo · `03` Prima EPS/EOC · `04` Póliza SOAT · `05` ARL · `06` ADRES · `07` Salud pública · `08` Entidad territorial · `09` Urgencias migrante · `10` Plan complementario · `11` Medicina prepagada · `12` Otras pólizas · `13` Régimen especial · `14` Fondo PPL · `15` Particular · `16` UPC contributivo · `17` UPC subsidiado

**`non_contract_invoice_reason`:** `01` Urgencias · `02` ADRES/SOAT/PVS · `03` Tutela u orden judicial · `04` Portabilidad · `05` Sin contrato excepcional · `06` Recuperación de órganos · `07` Profesional independiente a paciente particular

> **Nota para clínicas veterinarias:** este bloque **no aplica**. Es para facturación a EPS y aseguradoras del sistema de salud humana.

### 3.7 Sector transporte de carga **[DOC]**

| Campo | Descripción | Restricción |
|---|---|---|
| `items.transport.file_number` | Número de radicado | Numérico entre 1 y 100.000.000.000 |
| `items.transport.shipment_number` | Número de remesa | Alfanumérico, permite `-`, `_`, `/`, `,`. Máx 15 |
| `items.transport.transported_quantity` | Cantidad transportada | Sin decimales, máx 8 caracteres |
| `items.transport.measurement_unit` | Unidad de medida | Solo `"GLL"` (galón) o `"KGM"` (kilogramo) |
| `items.transport.freight_value` | Valor flete | Sin decimales, máx 12 caracteres |
| `items.transport.purchase_order` | Orden de compra | Alfanumérico, máx 50 |
| `items.transport.service_type` | Tipo de servicio | `"AdditionalService"` o `"Shipment"` |

### 3.8 Productos de obsequio (precio 0) **[DOC]**

Para facturar ítems con valor 0 hay que declarar ante la DIAN el valor real y quién asume el IVA:

```json
{
  "items": [{
    "code": "1", "description": "Alquiler", "quantity": 2, "price": 0,
    "tax_base": 1000, "taxpayer": "Company",
    "taxes": [ { "id": 31779 } ]
  }]
}
```

### 3.9 Facturación por lote **[TER]**

`POST /v1/invoices/batch`. Proceso **asíncrono**: se envía un arreglo de facturas y una `notification_url` obligatoria; el estado de cada una llega por webhook.

- Tamaño máximo del cuerpo: **1 MB**
- Cada factura del arreglo debe incluir su propio campo `idempotency_key`
- La estructura de cada factura es la misma del endpoint de creación

---

## 4. Notas crédito

### 4.1 `POST /v1/credit-notes` — Crear nota crédito **[DOC]**

Comprobante que registra devoluciones parciales o totales de una factura de venta.

#### Campos

| Campo | Tipo | Obligatorio | Características |
|---|---|---|---|
| `document.id` | number | **Sí** | Tipo de nota crédito. Debe existir en Siigo Nube |
| `date` | date | **Sí** | **Para electrónicas no puede ser anterior a la fecha actual** |
| `number` | number | No | Consecutivo. Si se envía, no debe existir |
| `invoice` | string | **Sí si es electrónica** | **GUID de la factura** a la que se aplica. Formato UUID |
| `reason` | **integer** | **Sí en electrónicas** | Motivo de rechazo DIAN. **Numérico, no string** |
| `seller` | number | Condicional | Obligatorio si la factura **no existe** en Siigo Nube |
| `cost_center` | number | No | — |
| `currency` | object | No | En NC debe coincidir con la moneda de la factura |
| `observations` | string | No | Comentarios adicionales |
| `retentions` | array | No | — |
| `advance_payment` | number | No | — |
| `items.code` | string | **Sí** | Debe existir, estar activo y ser alfanumérico |
| `items.description` | string | No | — |
| `items.quantity` | number | **Sí** | **Máximo 2 decimales** |
| `items.price` | number | **Sí** | **Máximo 6 decimales** |
| `items.discount` | number | No | — |
| `items.taxes[].id` | number | No | — |
| `items.tax_base` / `items.taxpayer` | — | Condicional | Si `price` es 0 (obsequios) |
| `payments[].id` | number | **Sí** | Debe existir y estar activo |
| `payments[].value` | number | **Sí** | **Máximo 2 decimales** |
| `payments[].due_date` | string | Condicional | Si el medio de pago maneja vencimiento |
| `stamp` | object | No | **Por defecto `false`** |
| `mail` | object | No | Por defecto `false` |
| `healthcare_company` | object | Condicional | Sector salud |
| `customer.identification` | string | Condicional | Obligatorio si la factura **no existe** en Siigo Nube |
| `invoice_data` | object | Condicional | **Reemplaza a `invoice`** cuando la factura no existe en Siigo Nube |

> ⚠️ **No existe ningún campo llamado `base_document`.** El vínculo con la factura original es el campo **`invoice`** (GUID), o el objeto **`invoice_data`** si la factura es externa a Siigo Nube.

> ⚠️ **Los valores van en positivo.** El ejemplo oficial usa `price: 2000` y `value: 2000`. La nota crédito ya es, por naturaleza, un documento de reversión; no se envían importes negativos. El error `invalid_amount` exige que el monto sea "un número positivo".

> ⚠️ **No hay campo `total` en el request.** `total` solo aparece en la respuesta.

#### Códigos de motivo de rechazo DIAN **[DOC]**

| Código | Motivo |
|---|---|
| 1 | Devolución parcial de los bienes y/o no aceptación parcial del servicio |
| **2** | **Anulación de factura electrónica** |
| 3 | Rebaja o descuento parcial o total |
| 4 | Ajuste de precio |
| 6 | Descuento comercial por pronto pago |
| 7 | Descuento comercial por volumen de ventas |

> ⚠️ **Contradicción dentro de la propia documentación de Siigo.** La tabla de motivos lista `1, 2, 3, 4, 6, 7` (sin el 5). El esquema del request declara `Value in: 1 | 2 | 3 | 4 | 5 | 6` (sin el 7). **Las dos listas no coinciden.** Antes de escribir código que dependa de los códigos 5, 6 o 7, confírmalo con un POST de prueba o con `soporteapi@siigo.com`.

#### Nota crédito a factura que NO existe en Siigo Nube

Se sustituye `invoice` por `invoice_data` y se vuelven obligatorios `customer.identification` y `seller`:

| Campo | Obligatorio | Características |
|---|---|---|
| `invoice_data.date` | Sí | `aaaa/mm/dd`. **Debe ser menor a la fecha de la nota crédito** |
| `invoice_data.prefix` | No | Prefijo de la factura |
| `invoice_data.number` | Condicional | **Obligatorio si `reason` = 2** |
| `invoice_data.cufe` | Condicional | **Obligatorio si `reason` = 2**. Máx 200 caracteres |

```json
{
  "document": { "id": 2379 },
  "date": "2026-05-24",
  "reason": 2,
  "customer": { "identification": "28211179", "branch_office": "0" },
  "seller": 62,
  "invoice_data": {
    "date": "2026-03-20", "prefix": "FV",
    "number": "458", "cufe": "302580df-838b-..."
  },
  "items": [ { "code": "Code-1", "description": "Producto",
               "quantity": 1, "price": 2000 } ],
  "payments": [ { "id": 542, "value": 2000 } ]
}
```

#### Respuesta 201 **[DOC]**

```json
{
  "id": "63f918c2-...",
  "document": { "id": 22 },
  "number": 25,
  "name": "NC-2-22",
  "date": "2026-09-09",
  "invoice": { "id": "302580df-...", "name": "FV-2-20" },
  "customer": { "id": "...", "identification": "13832081", "branch_office": 0 },
  "cost_center": 235,
  "currency": { "code": "USD", "exchange_rate": 3825.03 },
  "seller": 629,
  "retentions": [ ... ],
  "advance_payment": 0,
  "total": 25.5,
  "observations": "...",
  "items": [ ... ],
  "payments": [ ... ],
  "stamp": { "status": "...", "cufe": "...", "cude": "...",
             "observations": "...", "errors": "..." },
  "metadata": { "created": "...", "last_updated": "...", "stock_updated": "..." }
}
```

> ⚠️ Igual que en factura: **`cufe`, `cude` y `status` están anidados bajo `stamp`**, nunca en la raíz. Y el objeto `invoice` de la respuesta es `{id, name}`, no un string.

### 4.2 Requisitos previos de la factura

**[DOC]** Error `invalid_document`:

> En Nota Crédito, debes verificar que `invoice` sea del mismo `electronic_type`. Si se está usando un tipo de comprobante con marcación electrónica en su definición, **esta debe estar enviada ante la DIAN** si se desea aplicar nota crédito.

En claro: **no puedes emitir nota crédito electrónica sobre una factura que sigue en `Draft`.**

### 4.3 Obligación legal — Resolución DIAN 000042

Una nota crédito emitida contra una factura electrónica timbrada **debe enviarse a la DIAN**. `stamp.send` por defecto es `false`; hay que ponerlo explícitamente en `true`. Dejarlo en `false` produce un documento sin efecto fiscal: la factura sigue vigente ante la DIAN aunque en Siigo aparezca anulada.

> **[OBS]** En este proyecto **nunca se ha emitido una nota crédito real**. La forma exacta del `stamp` poblado y la restricción de año fiscal siguen sin verificarse contra una respuesta real.

---

## 5. El resto de recursos

### 5.1 Clientes / terceros — `POST /v1/customers` **[DOC]**

Crea un tercero: cliente, proveedor u otro.

| Campo | Obligatorio | Características |
|---|---|---|
| `type` | No | `"Customer"`, `"Supplier"` u `"Other"`. Por defecto `"Customer"` |
| `person_type` | **Sí** | Solo `"person"` o `"company"` |
| `id_type` | **Sí** | 13 = cédula, 31 = NIT (tabla completa abajo) |
| `identification` | **Sí** | Sin caracteres especiales, máx 50. Solo se repite si es sucursal nueva |
| `check_digit` | No | Dígito 0-9. **Se calcula automáticamente si se omite** |
| `name` | **Sí** | Company: 1 elemento. Person: 2. Máx 100 c/u |
| `commercial_name` | No | Permite espacios y caracteres especiales |
| `branch_office` | No | Entero 0-999. Por defecto 0 |
| `active` | No | Por defecto `true` |
| `vat_responsible` | No | Por defecto `false` |
| `fiscal_responsibilities[].code` | **Sí** | Comúnmente `"R-99-PN"` |
| `address.address` | **Sí** | Máx 256 caracteres |
| `address.city.country_code` | **Sí** | Ej. `CO` |
| `address.city.state_code` | **Sí** | Ej. `11` |
| `address.city.city_code` | **Sí** | Ej. `11001` |
| `address.postal_code` | No | Sin espacios, máx 10 |
| `phones[].indicative/number/extension` | No | Numérico, máx 10 c/u |
| `contacts[].first_name` | **Sí** | Máx 50 |
| `contacts[].last_name` | No | Máx 50 |
| `contacts[].email` | No | Sin espacios ni caracteres especiales, máx 100 |
| `comments` | No | Máx **4.000** caracteres |
| `related_users.seller_id` | No | Vendedor asignado |
| `related_users.collector_id` | No | Cobrador asignado |
| `custom_fields` | No | Campo CUCON del sector salud: `{"key":"CUCON","value":"<código>"}`, 64 caracteres |

#### Tipos de identificación en Colombia **[DOC]**

| ID | Tipo | Formato de `identification` |
|---|---|---|
| **13** | Cédula de ciudadanía | **Numérico, ≥ 3 y ≤ 13 dígitos** |
| **31** | NIT | **Numérico, ≥ 3 y ≤ 13 dígitos** |
| 22 | Cédula de extranjería | Alfanumérico, 1-20 |
| 42 | Documento de identificación extranjero | Alfanumérico, 1-20 |
| 50 | NIT de otro país | Alfanumérico, 1-20 |
| R-00-PN | No obligado a registrarse en el RUT PN | Alfanumérico, 1-20 |
| 91 | NUIP | Alfanumérico, 1-20 |
| 41 | Pasaporte | Alfanumérico, 1-20 |
| 47 | Permiso especial de permanencia (PEP) | Alfanumérico, 1-20 |
| 11 | Registro civil | Numérico, ≥ 3 y ≤ 13 |
| 43 | Sin identificación del exterior / uso DIAN | Alfanumérico, 1-20 |
| 21 | Tarjeta de extranjería | Alfanumérico, 1-20 |
| 12 | Tarjeta de identidad | Alfanumérico, máx 20 |
| 89 | Salvoconducto de permanencia | Alfanumérico, 1-20 |
| 48 | Permiso protección temporal (PPT) | Alfanumérico, 1-20 |

#### Responsabilidades fiscales **[DOC]**

| Código | Responsabilidad |
|---|---|
| `R-99-PN` | No aplica – Otros |
| `O-13` | Gran contribuyente |
| `O-15` | Autorretenedor |
| `O-23` | Agente de retención IVA |
| `O-47` | Régimen simple de tributación |

#### Ciudades

Se consultan en Siigo Nube (**Reportes → Carteras/Proveedores → Reportes de sistema → Países-Departamentos-Ciudades**) o vía `GET /v1/cities`. Ejemplos: Bogotá `CO/11/11001`, Medellín `CO/05/05001`.

**Filtros de `GET /v1/customers`** **[TER]**: `identification`, `branch_office`, `created_start`, `created_end`, `updated_start`, `updated_end`, `page`, `page_size` (límite 100).

### 5.2 Productos — `/v1/products` **[DOC/TER]**

Campos de la respuesta de `GET /v1/products/{id}`:

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | GUID del producto |
| `code` | string | **Código único**. Es lo que se referencia desde `items.code` de una factura |
| `name` | string | Nombre del producto o servicio |
| `account_group.id` / `.name` | number/string | Clasificación de inventario |
| `type` | string | `Product`, `Service`, `ConsumerGood` o `Combo` |
| `stock_control` | boolean | Control de inventario. Por defecto `false` |
| `active` | boolean | Por defecto `true` |
| `tax_classification` | string | `Taxed`, `Exempt` o `Excluded` |
| `tax_included` | boolean | Si el precio ya incluye el IVA |
| `tax_consumption_value` | number | Valor del impuesto al consumo |
| `taxes[]` | array | `{id, name, type, percentage}` |
| `prices[].currency_code` | string | Ej. `COP` |
| `prices[].price_list[]` | array | `{position, name, value}` |
| `unit.code` / `unit.name` | string | Unidad de medida |
| `unit_label` | string | Unidad para impresión de factura |
| `reference` | string | Referencia o código de fábrica |
| `description` | string | Descripción |
| `additional_fields` | object | `barcode`, `brand`, `tariff`, `model` |
| `available_quantity` | number | Cantidad disponible (suma de todas las bodegas) |
| `warehouses[]` | array | `{id, name, quantity}` |
| `components[]` | array | **Solo en productos tipo `Combo`**: `{id, code, name}` |
| `metadata` | object | `created`, `last_updated`, `stock_updated` |

**Campos obligatorios en la creación** **[TER]**: `code` (único), `name`, `account_group` (id), `type`.

**Filtros de `GET /v1/products`** **[TER]**: `code`, `created_start`, `created_end`, `updated_start`, `updated_end`, `id` (admite varios separados por comas), `page`, `page_size` (límite 100).

> ⚠️ **[OBS] Siigo NO aplica el IVA por su cuenta.** Una línea de factura sin `items.taxes` explícito se guarda con impuesto cero **aunque el producto esté configurado como `Taxed` al 19 %**. Verificado: un producto al 19 % facturado a 100 volvió con total 100,00 y sin línea de impuesto. Si necesitas que el documento DIAN desglose el IVA, **debes reenviar los ids de impuesto del producto en cada línea**.

### 5.3 Recibos de caja — `/v1/vouchers` (RC) **[SDK/TER]**

Registra el cobro de dinero. Tres tipos de operación: **DebtPayment** (abono a deuda), **AdvancePayment** (anticipo) y **MiscIncome** (ingreso vario).

- `POST /v1/vouchers` — admite `Idempotency-Key`
- `POST /v1/vouchers/{id}/stamp` — envío electrónico a la DIAN
- `POST /v1/vouchers/{id}/mail` — envío por correo

Error relacionado: `invalid_array` sobre `Items` — *"En recibo de caja, si envías items en un Anticipo o en un Abono a deuda el mismo vencimiento más de una vez"*. Y `invalid_payment` — *"se envía payment en un recibo de caja avanzado"*.

Catálogos auxiliares: `GET /v1/expenses` (conceptos de gasto para ajustes) y `GET /v1/misc-income` (conceptos de ingreso vario).

### 5.4 Recibos de pago / egreso — `/v1/payment-receipts` (RP) **[TER]**

Registra la salida de dinero: pagos a proveedores y comprobantes de egreso. CRUD completo. Tipos: `DebtPayment`, `AdvancePayment`, `Advanced`.

### 5.5 Facturas de compra — `/v1/purchases` (FC) **[DOC/TER]**

Registra compras y gastos. CRUD completo.

```bash
curl -X PUT "https://api.siigo.com/v1/purchases/{id}" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "document": { "id": 58246 },
    "date": "2026-05-22",
    "supplier": { "identification": "101020201", "branch_office": 0 },
    "provider_invoice": { "prefix": "VEN", "number": "987" },
    "items": [ { "type": "Product", "code": "SGNB002",
                 "description": "Producto", "quantity": 8, "price": 1000 } ],
    "payments": [ { "id": 51279, "value": 8000, "name": "MercadoPago" } ]
  }'
```

Diferencias frente a la factura de venta: usa **`supplier`** en vez de `customer`, añade **`provider_invoice`** (prefijo y número de la factura del proveedor), y los ítems llevan **`type`**.

### 5.6 Documentos soporte — `/v1/purchase-support-documents` (DS) **[TER]**

Documento soporte en adquisiciones a no obligados a facturar (DIAN). CRUD completo. También accesible mediante `POST /v1/purchases` con el flag `document_support`.

### 5.7 Cotizaciones — `/v1/quotations` (C) **[TER]**

CRUD completo. Estructura muy parecida a la factura pero sin `payments` obligatorios ni bloque `stamp`:

```json
{
  "document": { "id": 12345 },
  "date": "2026-02-13",
  "customer": { "identification": "13832081", "branch_office": 0 },
  "seller": 629,
  "items": [ { "code": "PROD001", "quantity": 5, "price": 50000,
               "taxes": [ { "id": 13156 } ] } ]
}
```

### 5.8 Comprobantes contables — `/v1/journals` (CC) **[SDK]**

Asientos contables manuales. Admite `Idempotency-Key`.

**Regla dura:** la suma de débitos debe igualar la suma de créditos. Error `invalid_balance` — *"aparece cuando la suma de los débitos y créditos no son iguales"*.

Errores relacionados: `invalid_account` (cuenta contable inexistente).

### 5.9 Webhooks — `/v1/webhooks` **[DOC]**

Suscripción a eventos. **Se necesita un request por cada evento.**

**Petición:**

| Campo | Tipo | Descripción |
|---|---|---|
| `application_id` | string | Nombre del software que recibirá las notificaciones |
| `topic` | string | Evento, ej. `"public.siigoapi.products.create"` |
| `url` | string | URL donde se reciben las notificaciones |

**Respuesta:**

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | string | ID de la suscripción |
| `application_id` | string | Nombre del software |
| `url` | string | URL de notificación |
| `topic` | string | Evento suscrito |
| `company_key` | string | Nombre de la empresa suscrita |
| `active` | boolean | Estado de la suscripción |
| `created_at` | date | Fecha y hora de la suscripción |

```bash
curl -X POST "https://api.siigo.com/v1/webhooks" \
  -H "Authorization: Bearer <token>" \
  -H "Partner-Id: miapp" \
  -d '{
    "application_id": "MiApp",
    "url": "https://miapp.com/webhooks/siigo",
    "topic": "public.siigoapi.products.create"
  }'
```

Convención de `topic`: `public.siigoapi.<recurso>.<acción>`. **La lista completa de topics no está publicada** en la documentación que pude recuperar — hay que pedírsela a `soporteapi@siigo.com`.

### 5.10 Catálogos

Todos son `GET`, solo lectura, y devuelven listas.

| Endpoint | Para qué sirve | Notas |
|---|---|---|
| `/v1/document-types` | Tipos de comprobante | Filtrable por `type` (FV, NC, RC, FC, CC, RP, C, DS). Devuelve `electronic_type` (`ElectronicInvoice`, `ContingencyInvoice`, `ExportInvoice`, `ElectronicCreditNote`, `NoElectronic`) y `active` |
| `/v1/payment-types` | Formas de pago | **Requiere el query param `document_type=FV`** (o NC, RC). Devuelve `due_date: boolean` — si es `true`, `payments[].due_date` pasa a ser obligatorio |
| `/v1/taxes` | Impuestos | IVA, Retefuente, ReteIVA, ReteICA, Ad Valorem, Impuesto al consumo |
| `/v1/cost-centers` | Centros de costo | Debe existir y estar activo para usarse |
| `/v1/users` | Usuarios / vendedores | Es la fuente del campo `seller` de las facturas |
| `/v1/warehouses` | Bodegas | Solo si el manejo de bodegas está activo |
| `/v1/price-lists` | Listas de precios | Máximo 12 por producto |
| `/v1/account-groups` | Clasificaciones de inventario | Obligatorio al crear productos |
| `/v1/cities` | Ciudades de Colombia | Códigos país / departamento / ciudad |
| `/v1/id-types` | Tipos de identificación | Ver tabla en 5.1 |
| `/v1/fiscal-responsibilities` | Responsabilidades fiscales | Ver tabla en 5.1 |
| `/v1/fixed-assets` | Activos fijos | — |
| `/v1/asset-groups` | Grupos de activos | — |
| `/v1/available-documents` | Saldo de documentos disponibles | Cuántos comprobantes quedan según el plan |
| `/v1/expenses` | Conceptos de gasto | Para ajustes en recibos de caja |
| `/v1/misc-income` | Conceptos de ingreso vario | Para recibos de caja |

> ⚠️ **[OBS] El sandbox de Siigo es compartido / multi-tenant.** `GET /v1/document-types` devuelve el catálogo **global**, con tipos de otras empresas (se ven nombres como "Nota Credito Saludtools" o "PRUEBA SANTIAGO NOTA CREDITO"). Medido: FV devuelve 72 `ElectronicInvoice`, 1 `ContingencyInvoice`, 1 `ExportInvoice` y 191 `NoElectronic`; NC devuelve 19 `ElectronicCreditNote` y 37 `NoElectronic`. **Que un tipo exista y esté activo no prueba que tu cuenta pueda emitir con él.** Emitir contra el tipo de otro tenant consumiría su consecutivo. También se han visto más de 27.000 productos ajenos en el catálogo del sandbox.

### 5.11 Reportes

| Endpoint | Verbo | Descripción |
|---|---|---|
| `/v1/test-balance-report` | POST | Balance de prueba general. Genera un Excel |
| `/v1/test-balance-report-by-thirdparty` | POST | Balance de prueba por tercero |
| `/v1/accounts-payable` | GET | Reporte de cuentas por pagar, paginado |

Parámetros de los balances **[DOC, vía errores]**: `month_start` y `month_end` deben estar **entre 1 y 13** (13 = ajustes de cierre); `account_start` debe ser menor o igual que `account_end` y ambas deben existir.

---

## 6. Catálogo completo de códigos de error **[DOC]**

Los 61 códigos documentados en `developers.siigo.com/docs/siigoapi/manejo-de-errores/`.

### Errores de configuración de la empresa

| Código | Causa | Cómo se resuelve |
|---|---|---|
| `company_settings` | Se envía un parámetro no configurado en la organización | Configuración → Más Configuraciones → Organización → Perfil (moneda extranjera, datos tributarios) |
| `customer_settings` | El tercero relacionado no tiene contactos creados | Crear contactos en Nube o vía `/customers` |
| `document_settings` | Parámetro no configurado en el comprobante | Configuración → Transacciones → Facturas: vendedor por ítem, centro de costos, numeración automática, descuentos, decimales |
| `warehouse_settings` | Se envía bodega y el manejo de bodegas no está activo | Configuración → Más Configuraciones → Inventarios → Configuración de bodegas |
| `product_settings` | Se envía bodega y el producto no maneja control de inventarios | Activar `stock_control` en el producto |
| `blocked_transactions` | La fecha del documento es anterior o igual al bloqueo de transacciones | Configuración → Transacciones → Procesos → Bloqueo por fecha |
| `date_settings` | La fecha del comprobante no está permitida | — |
| `invalid_plan_type` | Valor no permitido: el plan no tiene límite de documentos | — |

### Errores de duplicidad y existencia

| Código | Causa |
|---|---|
| `already_exists` | Se intenta crear un registro que ya existe. Usar un id o código distinto |
| `duplicated_document` | **El documento ya existe.** Siigo recomienda usar `Idempotency-Key` para prevenirlo |
| `not_found` | Recurso no encontrado |
| `invalid_reference` | Se envía un id o código que no existe |
| `delete_not_allowed` | El recurso tiene movimientos o transacciones relacionadas |
| `update_not_allowed` | No se puede actualizar el grupo de inventarios de un producto con movimientos |
| `non_editable` | Se intentan cambiar datos que no son editables |

> ⚠️ **`duplicated_document` llega con HTTP 400 y significa lo contrario de "no se creó nada".** Si tu lógica de reintentos trata todo 4xx como "el documento no existe", este código romperá esa suposición y puede generar duplicados.

### Errores de formato de campo — con las expresiones regulares reales

| Código | Regla |
|---|---|
| `invalid_identification` | `^[\d\w]{1}[\d\w\-]+[\d\w]{1}$` — mínimo 3 caracteres, empieza y termina en alfanumérico, **admite guiones intermedios** |
| `invalid_email` | `^([-+.]*\w)+[-+.]*@([\w-]+\.)+[\w-]{2,}$` |
| `invalid_code` | `^[^'\s]+$` — **no admite comillas simples ni espacios** |
| `invalid_description` | `^$\|^[\w\.@-\\%_;()\]#?¡[/:{ } *+,$"\sñáéíóúÁÉÍÓÚüÜ\-"]+$` |
| `invalid_name` | Misma expresión que `invalid_description` |
| `invalid_partner_id` | Sin caracteres especiales ni espacios, entre 3 y 100 caracteres |
| `invalid_idempotency-key` | Alfanumérico, sin caracteres especiales, **máximo 32 caracteres** (contradice los 30 de la página de Idempotencia) |
| `invalid_url` | URL mal formada |
| `invalid_type` | Tipo de dato incorrecto |

> **Nota sobre las comillas.** El proyecto `fact_elect_vet` elimina comillas simples y dobles de todos los campos de texto. La regla oficial que las prohíbe es **`invalid_code`** (`^[^'\s]+$`, aplicable al **código** del producto). Las expresiones de `invalid_description` e `invalid_name` **sí incluyen la comilla doble** en el conjunto permitido, y **no** la comilla simple. Es decir: eliminar la comilla simple está justificado; eliminar la doble es conservador pero innecesario según la documentación.

### Errores de importes y cuadre

| Código | Regla |
|---|---|
| `invalid_amount` | Monto positivo, no superior a 99.999.999.999,99. `price` admite 6 decimales; `advance_payment` y `discount`, 2. El total de `payments` debe coincidir con el de la factura (máx. 9.999.999.999.999,99). `advance_payment` debe ser mayor al subtotal |
| `invalid_total_payments` | La suma de `payments[i].value` no coincide con la suma de totales de ítem. **Fórmula exacta en la sección 3.1** |
| `invalid_value` | Valor inválido en cantidades, consecutivos o cuotas |
| `invalid_balance` | En comprobantes contables: débitos ≠ créditos |
| `values_limit` | Se excedió el límite de valores permitidos |
| `invalid_range` | Campo fuera del rango indicado (ej. `month_start`/`month_end` fuera de 1-13) |

### Errores de fecha

| Código | Regla |
|---|---|
| `invalid_date` | Límite de **±10 días** respecto de la fecha actual en facturas electrónicas. Formatos: `yyyy-MM-dd` o `yyyy-MM-ddTHH:mm:ssZ`. **En FV y NC electrónicas no se puede enviar fecha anterior a la actual** |
| `invalid_date_range` | Fechas fuera de un rango válido |
| `date_settings` | Fecha no permitida para el comprobante |

### Errores de arrays y límites

`invalid_array` cubre varios casos:

| Sub-caso | Regla |
|---|---|
| **Contacts** | Máximo **10 contactos por cliente** |
| **Name** | `Person` → array de 2 elementos; `Company` → array de 1 |
| **Payments** | Formas de pago inválidas para el tipo de comprobante |
| **Prices** | Máximo **12 listas de precio por producto** |
| **Retentions** | Solo ReteIVA, ReteICA y Autorretención, según la configuración del comprobante |
| **Taxes** | Máximo **3 impuestos** por producto. No IVA + Ad Valorem juntos. No repetir el mismo tipo. **No enviar ReteIVA ni ReteICA en los ítems** |
| **Items** | Máximo **500 ítems** en factura de venta y nota crédito |

### Errores de parámetros

| Código | Causa |
|---|---|
| `parameter_required` | Falta un valor obligatorio. En formas de pago hay que enviar `document_type=FV` |
| `parameter_empty` | Aplica a `unit` y `fiscal_responsibilities`; si no se envía se asigna el valor por defecto |
| `parameter_inactive` | El parámetro está inactivo (usuarios, formas de pago, impuestos, listas de precios) |
| `parameters_exclusive` | Se proporcionó un valor no permitido |
| `parameter_not_allowed` | `vat_excluded: true` fuera de los días de exención de IVA, o un `id` de impuesto que no corresponde al tipo |
| `header_required` | Falta un header obligatorio — normalmente `Partner-Id` |
| `length_max` / `length_min` | Longitud fuera de rango |

### Errores de documento y DIAN

| Código | Causa |
|---|---|
| `invalid_document` | El `id` del tipo de comprobante no corresponde. En NC: la factura debe ser del mismo `electronic_type` y **haber sido enviada a la DIAN** |
| `invalid_dian_resolution` | **La resolución electrónica superó el rango de fecha y/o el consecutivo.** Hay que cambiar de tipo de documento o ajustar en Siigo Nube |
| `invalid_currency` | No hace falta enviar la moneda local. En NC debe coincidir con la de la factura |
| `invalid_cost_center` | Centro de costos inválido |
| `invalid_account` | Cuenta contable inexistente |
| `invalid_payment` | Forma de pago inválida para el tipo de comprobante |
| `invalid_retentions` | Retención no permitida según la configuración |

### Errores de disponibilidad y servicio

| Código | Causa |
|---|---|
| `requests_limit` | Rate limit excedido. Producción 100/min, pruebas 10/min. Retirada exponencial |
| `unauthorized` | Token vencido, inválido, o **usuario bloqueado** |
| `service_unavailable` | Sobrecarga temporal o mantenimiento |
| `request_timeout` | Siigo no completó la solicitud a tiempo |
| `documents_service` | El servicio de documentos no está disponible |
| `payment_types_service` | El servicio de formas de pago no está disponible |
| `entry_service` | No es posible completar la solicitud con las condiciones actuales |
| `general_service` | Servicio no disponible |
| `disabled_functionality` | Funcionalidad inhabilitada temporal o permanentemente |
| `unhandled_error` | Error no controlado. Escribir a `soporteapi@siigo.com` |

---

## 7. Comportamientos observados que la documentación no cuenta **[OBS]**

Esta sección proviene de llamadas reales capturadas en el proyecto `fact_elect_vet`. **Tiene prioridad sobre la documentación oficial.**

| # | Observación | Implicación práctica |
|---|---|---|
| 1 | El bloque `stamp` **está ausente**, no `null`, en la respuesta de `POST /v1/invoices` cuando `stamp.send` es `false` | El esquema debe modelar `stamp` como opcional, no como nullable. Un esquema estricto rechaza una respuesta de una factura que **ya se creó** |
| 2 | `POST /v1/invoices` devuelve **HTTP 500 en ~1 de cada 10** peticiones en sandbox, con payload idéntico | Un 500 no es un fallo: es una condición esperada. Hay que reconciliar antes de reintentar |
| 3 | **Un 500 consume la `Idempotency-Key` de forma permanente** | El reintento debe generar una clave nueva. Reusarla falla |
| 4 | `GET /v1/invoices` (listado) **no devuelve el bloque `stamp`** | Para obtener el CUFE hace falta una segunda llamada a `GET /v1/invoices/{id}` |
| 5 | En el listado, `observations` llega como **nullable** | Precedente de que Siigo **sí** envía `null` en al menos un endpoint |
| 6 | `items.taxed_price` + `items.taxes[]` es el patrón correcto para IVA incluido | Siigo deriva la base gravable sin inflar el total. Verificado: `taxed_price 119` + IVA 19 % → `price 100`, `tax 19`, `total 119` |
| 7 | Siigo **no aplica impuestos por su cuenta** | Una línea sin `taxes` explícito se guarda con impuesto cero aunque el producto sea `Taxed` 19 % |
| 8 | El sandbox es **multi-tenant** | Más de 27.000 productos y cientos de tipos de documento de otras empresas. No concluir nada de esos datos |
| 9 | Un POST con `stamp.send: true` devolvió `{"Code":"document_settings","Message":"The send cannot be used, you must verify the document settings","Params":["stamp.send"]}` | Causa no determinada: puede ser el tipo de documento o los permisos. `document_settings` es un error genérico de configuración |
| 10 | `observations` sobrevive el viaje de ida y vuelta: se envía en el POST y vuelve en `GET /v1/invoices` | Es el **único mecanismo disponible** para etiquetar un documento con un identificador propio y buscarlo después. Siigo no ofrece búsqueda por referencia externa |

---

## 8. Guía de diseño para una integración robusta

Reglas derivadas de todo lo anterior. Cada una responde a un fallo concreto, no a una preferencia.

### 8.1 Modelado de respuestas

1. **Nunca uses `z.literal()` ni enums cerrados para `stamp.status`.** Un estado DIAN desconocido no debe hacer que un documento existente sea imposible de parsear.
2. **Marca `stamp` como opcional y nullable a la vez.** La observación #1 exige opcional; la #5 demuestra que Siigo envía `null` en algún endpoint.
3. **Usa `passthrough` / campos abiertos.** Siigo añade campos (`public_url`, `annulled`, `metadata.stock_updated`) sin avisar.
4. **`cufe`, `cude` y `status` van bajo `stamp`.** En factura y en nota crédito. Nunca en la raíz.
5. **Un rechazo de validación después de un POST 201 es el peor fallo posible:** el documento existe, está timbrado, y tu sistema dice que falló. El operador reintenta y duplica un documento legal.

### 8.2 Idempotencia y reintentos

6. **Genera la clave sin guiones.** `crypto.randomUUID()` los incluye; hay que quitarlos.
7. **Valida el formato de la clave antes de tocar cualquier estado local.** Si tomas un lock o marcas un registro antes de validar, una clave malformada te deja estado sucio sin haber llamado a Siigo.
8. **Ante 5xx, timeout o socket caído: reconcilia, no reintentes.** Un 4xx prueba que no se creó nada; nada más lo prueba. **Salvo `duplicated_document` y `already_exists`, que son 4xx y prueban lo contrario.**
9. **Etiqueta cada emisión con un marcador único en `observations`** y búscalo con `GET /v1/invoices` para saber si el documento existe. Es la única vía.
10. **Al reconciliar por fechas, extiende `created_end` a mañana.** Una fecha sin hora se interpreta como medianoche y excluye lo creado hoy.
11. **Vigila la tasa de errores.** Más del 80 % de errores durante 7 días **bloquea el usuario API**.

### 8.3 Construcción del payload

12. **Redondea línea a línea con la fórmula de Siigo** antes de sumar `payments[].value`. Redondear al final da un céntimo de diferencia y `invalid_total_payments`.
13. **`price` y `taxed_price` son excluyentes.** `taxed_price` reemplaza a `price`. Enviar los dos es ambiguo; enviar `taxed_price` cuando el importe ya incluye IVA evita que Siigo aplique el impuesto dos veces.
14. **La fecha de una factura electrónica es hoy**, no la del hecho económico. La API rechaza fechas anteriores.
15. **Comprueba `due_date` del medio de pago** en `/v1/payment-types` antes de permitir que se seleccione. Si es `true`, `payments[].due_date` es obligatorio.
16. **`seller` es obligatorio** y debe venir de `/v1/users`. No lo codifiques a mano.
17. **`quantity` admite 2 decimales; `price`, 6.** Si tu fuente da cantidades fraccionarias con más precisión (dosis, fracciones de envase), la opción segura es facturar la línea como **1 unidad al importe total** y mover la fracción a la descripción.

### 8.4 Notas crédito

18. **El vínculo es `invoice` (GUID)**, no `base_document`. `invoice_data` solo para facturas externas a Siigo Nube.
19. **`reason` es un entero.** Para anular una factura electrónica: **`reason: 2`**.
20. **Importes en positivo**, incluido `payments[].value`.
21. **`date` es obligatoria** y no puede ser anterior a hoy.
22. **`stamp.send: true` siempre** en notas crédito contra facturas timbradas (Resolución DIAN 000042). El defecto de la API es `false`.
23. **La factura original debe estar `Accepted`.** No se puede aplicar nota crédito electrónica sobre un `Draft`.
24. **Las notas crédito sufren los mismos 500 que las facturas** y están en la misma lista de idempotencia. Necesitan la misma reconciliación. Una anulación duplicada es peor que una emisión duplicada.

### 8.5 Operación

25. **Timeout de cliente ≥ 120 s**, según recomienda Siigo — pero verifica que tu plataforma te lo permita. En serverless el proceso puede morir antes y perderse la respuesta de un documento creado.
26. **Cachea el token** con clave derivada del triple completo (partner + usuario + access key), no solo del Partner-Id.
27. **Cachea los catálogos.** Productos, formas de pago y tipos de documento cambian poco y consumen cupo de rate limit.
28. **En sandbox el límite es 10 req/min**, no 100. Un solo refresco de catálogos lo agota.

---

## 9. Relevancia para `fact_elect_vet`

Qué usa hoy el proyecto, de los 68 endpoints disponibles:

| Endpoint | ¿En uso? | Nota |
|---|---|---|
| `POST /auth` | Sí | Con caché en memoria |
| `POST /v1/invoices` | Sí | Camino principal |
| `GET /v1/invoices` | Sí | Solo para reconciliación por marcador en `observations` |
| `GET /v1/invoices/{id}` | Sí | Para recuperar el `stamp` que el listado no trae |
| `GET /v1/invoices/{id}/pdf` | Sí | Descarga |
| `GET /v1/invoices/{id}/xml` | Sí | Descarga |
| `POST /v1/credit-notes` | Sí (roto) | Payload y respuesta mal modelados |
| `GET /v1/products` | Sí | Sincronización de catálogo |
| `GET /v1/payment-types` | Sí | Sincronización de catálogo |
| `GET /v1/document-types` | Sí | Sincronización de catálogo |
| `GET /v1/users` | Sí | Vendedores |
| Los otros 57 | No | — |

### Endpoints no usados que merecería la pena evaluar

| Endpoint | Por qué |
|---|---|
| `GET /v1/invoices/{id}/stamp/errors` | **El más valioste de los no usados.** Devuelve los errores de rechazo de la DIAN de una factura `Rejected`. Hoy, si la DIAN rechaza, el sistema no tiene forma de decir por qué |
| `POST /v1/invoices/{id}/stamp` | Permite timbrar **después** de crear. Desacopla "guardar en Siigo" de "enviar a la DIAN", lo que reduce el tamaño de la ventana ambigua de un solo POST |
| `POST /v1/invoices/{id}/annul` | Anulación en Siigo, complementaria a la nota crédito |
| `GET /v1/available-documents` | Avisa de cuántos comprobantes quedan según el plan. Quedarse sin cupo a mitad de un día de facturación es un fallo evitable |
| `POST /v1/webhooks` | Sustituiría el polling de 20 s por notificación push |
| `GET /v1/cities` | Hoy la dirección del cliente no lleva ciudad estructurada; es obligatoria al crear terceros desde la factura |
| `GET /v1/fiscal-responsibilities` | Hoy se asume `R-99-PN` implícitamente |

### Contrastes contra el código actual

| Punto | Documentación oficial | Código del proyecto |
|---|---|---|
| Regex de `Partner-Id` | Sin caracteres especiales | `/^[A-Za-z0-9-]+$/` — **admite guion** |
| Decimales de `quantity` | Máx 2 | Sin validar |
| Decimales de `price` | Máx 6 | Validado a 2 |
| `observations` | Máx 4.000 | Limitado a 500 |
| `payments[].due_date` | Obligatorio si el medio lo maneja | No modelado |
| Cédula (id_type 13) | Numérico, 3-13 dígitos | `^\d{6,10}$` — **más estricto que la API** |
| NIT (id_type 31) | Numérico, 3-13 dígitos | `^(?:\d{8,11}\|\d{6,9}-\d)$` — **más estricto** |
| Vínculo de la NC | `invoice` (GUID) | `base_document: {id, cufe}` — **campo inexistente** |
| `reason` de la NC | Entero 1-6 | Enum de strings — **tipo incorrecto** |
| `date` de la NC | Obligatorio | Ausente |
| Signo de los importes de la NC | Positivo | Negados |
| Respuesta de la NC | `cufe`/`status` bajo `stamp` | Exigidos en la raíz |

---

## 10. Fuentes y límites de este documento

### Páginas oficiales recuperadas íntegras (2026-09-09)

- `developers.siigo.com/docs/siigoapi/` — Introducción y tabla de recursos
- `.../codigos-de-estado-http/` — 13 códigos HTTP
- `.../manejo-de-errores/` — 61 códigos de error, límites y tiempos de respuesta
- `.../partner-id/` — Reglas del header
- `.../idempotencia/` — Reglas de la clave
- `.../bloqueo-de-usuarios/` — Política de bloqueo
- `.../facturacion-electronica/` — Envío manual desde Nube
- `.../invoice/1-create-invoice` — Crear factura, completa
- `.../invoice/2-update-invoice` — Editar factura
- `.../invoice/3-get-invoices` — Listar facturas, con parámetros y respuesta
- `.../invoice/send-invoice-by-email` — Envío por correo
- `.../credit-note/1-create-credit-note` — Crear nota crédito, completa
- `.../customer/1-create-customer` — Crear cliente, completa, con tablas de tipos de identificación y responsabilidades fiscales
- `.../customer/4-update-customer` — Actualizar cliente
- `.../productos/consultar-producto` — Consultar producto, con todos los campos
- `.../purchase/2-update-purchase` — Editar factura de compra
- `.../webhooks/1-create-webhook` — Suscripción a webhook

### Fuentes secundarias

- **SDK oficial** `github.com/SiigoSAS/siigo_sdk_javascript` — generado con OpenAPI desde el contrato real. Fuente de las 46 rutas marcadas **[SDK]**
- **MCP server** `github.com/jdlar1/siigo-mcp` v3.2.0 — 75 herramientas. Fuente de los endpoints más recientes marcados **[TER]**: cotizaciones, documentos soporte, recibos de pago, lote de facturas, y los catálogos `cities`, `id-types`, `fiscal-responsibilities`, `expenses`, `misc-income`
- **SDKs de terceros**: `siigo-python` (GearPlug), `siigo-api-node`, `srdorado/siigo-client-php`
- **`EVIDENCIA_APIS.md`** del proyecto — fuente de todo lo marcado **[OBS]**

### Lo que no pude verificar y no voy a inventar

1. **La lista completa de `topic` de webhooks.** Solo conozco el patrón `public.siigoapi.<recurso>.<acción>` y un ejemplo (`products.create`). Pídesela a `soporteapi@siigo.com`.
2. **La tabla de campos de:** vouchers, journals, payment-receipts, quotations, purchase-support-documents y purchases (creación). Las **rutas** están confirmadas; los **campos** no los he leído de documentación oficial.
3. **La contradicción del campo `reason`** en notas crédito: tabla `1,2,3,4,6,7` contra esquema `1|2|3|4|5|6`. Sin resolver.
4. **La contradicción de longitud de `Idempotency-Key`**: 30 según una página, 32 según otra. Sin resolver.
5. **Los códigos de unidad de medida** (`unit.code`). La documentación remite a Apiary, que requiere JavaScript y no pude leer.
6. **La forma real de un `stamp` poblado con CUFE.** Los campos `cufe`, `cude`, `status`, `observations` y `errors` están **documentados**, pero nadie en este proyecto ha inspeccionado jamás una respuesta con un CUFE real. Trátalos como hipótesis hasta capturar una emisión de producción.
7. **La restricción de año fiscal en notas crédito.** Mencionada en el proyecto, no encontrada en la documentación recuperada.
8. **El límite exacto de `page_size`.** Los SDK de terceros indican 100 para productos, clientes y usuarios; la documentación oficial no lo declara.
