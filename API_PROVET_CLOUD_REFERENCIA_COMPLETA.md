# API REST de Provet Cloud — Referencia completa de endpoints

**Fecha de compilación:** 2026-09-09
**Versión de la API:** 0.1 (única versión existente)
**Base URL:** `https://{domain}/{provet_id}/api/0.1`
**Documentación:** `https://developers.provetcloud.com/restapi/`
**Propietario:** Nordhealth

---

## 0. Procedencia y alcance

**Este documento no está reconstruido de memoria ni de SDKs de terceros.** Está generado directamente desde el **esquema OpenAPI 3.0.3 oficial** de Provet Cloud, descargado el 2026-09-09 de:

```
https://developers.provetcloud.com/restapi/0.1/openapi-schema-01.json
```

Son 4,5 MB de contrato máquina. La página `developers.provetcloud.com/restapi/0.1/` no es legible por búsqueda web porque renderiza con JavaScript (Scalar); el JSON que carga por debajo sí lo es. Esa es la razón por la que esta API "parecía" no documentada.

Todo lo de las secciones 4 a 24 —ruta, método, resumen, **permisos requeridos** y **límite de peticiones por endpoint**— sale de ese esquema, campo a campo. Nada está inferido.

Las secciones de contexto (1 a 3) provienen de las páginas Sphinx de `developers.provetcloud.com`, recuperadas íntegras: autenticación OAuth 2.0, webhooks, filtrado, paginación, expose, rate limit, permisos, changelog y las nueve guías de uso.

Lo marcado **[OBS]** proviene de llamadas reales del proyecto `fact_elect_vet` (`EVIDENCIA_APIS.md`) y **tiene prioridad sobre la documentación cuando se contradicen**.

### Cifras

| Métrica | Valor |
|---|---|
| Rutas distintas | **564** |
| Operaciones (ruta × método) | **1.122** |
| Recursos de primer nivel | **183** |
| Grupos temáticos | 22 |
| Etiquetas de recurso | 141 |
| `GET` | 499 |
| `POST` | 219 |
| `PUT` | 148 |
| `PATCH` | 143 |
| `DELETE` | 113 |
| Endpoints de acción (no CRUD, tipo `/{id}/accion/`) | **58** |
| Disparadores de webhook | **68** |

> En las tablas verás 1.126 filas y no 1.122: cuatro operaciones están etiquetadas en dos grupos a la vez y aparecen en ambos.

---

## 1. Fundamentos

### 1.1 Estructura de la URL

```
https://{domain}/{provet_id}/api/0.1/{recurso}/
```

| Variable | Valor | Descripción |
|---|---|---|
| `domain` | `provetcloud.com` por defecto | **Dominio específico de la región.** Hay instancias regionales |
| `provet_id` | numérico | Identificador único de la instancia de tu organización |

Ejemplo real: `https://provetcloud.com/54321/api/0.1/consultation/`

En las tablas de este documento las rutas se escriben relativas a `.../api/0.1`, es decir `/consultation/` significa `https://provetcloud.com/{provet_id}/api/0.1/consultation/`.

**Las barras finales son obligatorias.** Es una API Django REST Framework; omitir la barra provoca redirección o 404.

### 1.2 Autenticación

#### OAuth 2.0 — el método vigente

Cada instancia de Provet tiene sus propios endpoints:

| Función | URL |
|---|---|
| Authorize | `https://provetcloud.com/{provet_id}/oauth2/authorize/` |
| Token | `https://provetcloud.com/{provet_id}/oauth2/token/` |
| Revoke | `https://provetcloud.com/{provet_id}/oauth2/revoke_token/` |
| User info (OpenID) | `https://provetcloud.com/{provet_id}/oauth2/userinfo/` |

Dos flujos:

| Flujo | Cuándo usarlo | Permisos |
|---|---|---|
| **Authorization code** | Cuando los usuarios acceden como ellos mismos (interfaces de usuario). **PKCE muy recomendado; obligatorio en clientes públicos** | Los del usuario que inicia sesión |
| **Client credentials** | Cuando accede un sistema de fondo sin usuario | Los de un **usuario virtual** de Provet ligado a la integración |

Los endpoints de token, refresh y revoke aceptan los datos como `application/x-www-form-urlencoded`.

El `client_id` y el `client_secret` los entrega Provet una vez completada la configuración de la aplicación.

#### API tokens — obsoleto

El método de token estático **está deprecado y se desactivó a finales de 2023**. Si encuentras documentación o código que use `Authorization: Token <clave>`, está caducado.

### 1.3 Permisos

Todos los endpoints están protegidos por el sistema de permisos de Provet. **Las tablas de las secciones 4-24 indican el permiso exacto que exige cada operación.**

Familias de permisos que aparecen en el esquema:

| Familia | Cubre |
|---|---|
| `General:` | Pacientes y clientes, consultas y sus ítems, citas, notas |
| `Financial:` | Facturas, pagos, informes de fin de día, contabilidad |
| `Settings:` | Ítems, departamentos, usuarios, plantillas, configuración |
| `Medical:` | Prescripciones, laboratorio, imagen diagnóstica |
| `Stock:` | Inventario, pedidos, mayoristas |

Gestión de permisos:

- **Plantilla de permisos (recomendado).** Se añade a la plantilla de integración; el grupo de permisos en Provet se sincroniza automáticamente cuando la plantilla cambia. Hay que pedírsela a soporte de Provet.
- **Sin plantilla**, la integración hereda por defecto los permisos del grupo **Users**.
- **Gestión manual:** al añadir una aplicación se crea un usuario virtual llamado `Integration <nombre>` y un grupo de permisos homónimo. **Este método se está retirando.**

### 1.4 Límites de peticiones — por endpoint, no globales

Ésta es la parte de la API de Provet que más integraciones rompe.

**Los límites son por endpoint.** Y el peso de cada petición depende del `page_size` que pidas:

```
peso = ceil(page_size_solicitado / page_size_por_defecto_del_endpoint)
```

Es decir: si el endpoint devuelve 50 resultados por página por defecto y pides 500, **esa única llamada cuenta como 10 peticiones**.

La documentación es explícita en la recomendación:

> Prefiere páginas pequeñas combinadas con filtrado `modified__gte` antes que pedir el tamaño de página máximo en cada llamada.

Y para conjuntos grandes:

> Cuando el desplazamiento de resultados superaría los 10.000 registros, usa filtrado por rango de fechas o por id (`id__gt=<último_id_visto>`) en vez de paginar por todos los registros.

#### Límites reales de los endpoints más usados **[esquema oficial]**

| Operación | Límite |
|---|---|
| `GET /invoice/` | **60 / min** ← el más restrictivo de todos |
| `GET /consultation/` | 100 / min |
| `GET /invoicerow/` | 100 / min |
| `GET /consultationitem/` | 100 / min |
| `GET /item/` | 100 / min |
| `GET /client/` | 125 / min |
| `GET /patient/` | 300 / min |
| `GET /phonenumber/` | 900 / min |
| `POST /consultation/` | 300 / min |
| `POST /client/` | 300 / min |
| `POST /patient/` | 250 / min |

> ⚠️ **Combina las dos reglas y sale un problema real.** `GET /invoice/` admite **60 peticiones por minuto**. Si lo llamas con `page_size=1000` sobre un endpoint cuyo tamaño por defecto es 50, **cada llamada pesa 20**. Tres páginas agotan el presupuesto del minuto. Con varios dispositivos refrescando en paralelo, el 429 es cuestión de volumen de historia acumulada, no de mala suerte.

Distribución general de límites en la API: 742 operaciones a 300/min, 331 a 100/min, y una cola larga con casos entre 30/min y 3600/min.

### 1.5 Paginación

Los listados devuelven **hasta 1.000 resultados por página**.

```json
{
  "count": 1234,
  "num_pages": 2,
  "next": "https://provetcloud.com/1/api/0.1/consultation/?page=2",
  "previous": null,
  "results": [ ... ]
}
```

| Clave | Significado |
|---|---|
| `count` | Total de resultados encontrados |
| `num_pages` | Número de páginas |
| `next` | URL de la página siguiente, o `null` |
| `previous` | URL de la anterior, o `null` |
| `results` | Array de objetos |

Parámetros: `page` y `page_size`.

### 1.6 Filtrado por consulta

Sintaxis: `[campo]__[método]=valor`, o `[campo].[propiedad]__[método]=valor` para atravesar relaciones.

| Método | Sinónimos | Significado |
|---|---|---|
| `is` | `eq` | Igual |
| `is_not` | `not_eq`, `neq` | Distinto |
| `lt` | | Menor que |
| `lte` | | Menor o igual |
| `gt` | | Mayor que |
| `gte` | | Mayor o igual |
| `range` | | Entre dos valores `[desde,hasta]` |
| `not_in_range` | | Fuera del rango |
| `contains` | | Contiene el texto, **sensible a mayúsculas** |
| `contains_not` | | No contiene, sensible a mayúsculas |
| `icontains` | | Contiene el texto, **insensible a mayúsculas** |
| `icontains_not` | | No contiene, insensible a mayúsculas |
| `in` | | Está en la lista `[v1,v2,v3]` |
| `not_in` | | No está en la lista |
| `is_null` | | `true` o `false` |

**Formato de fechas en los filtros:** `YYYY-MM-DD hh:mm+[TZ]hh:mm`, por ejemplo `2017-12-24 15:30+00:00`. **El `+` debe ir codificado como `%2B`** o la consulta falla.

Por defecto los filtros se combinan con **AND**. Añadiendo `filter_type=or` se combinan con **OR** — útil para buscar por nombre sin saber si el cliente es persona o empresa:

```
GET /client/?firstname__icontains=hill&filter_type=or
```

Los campos filtrables de cada endpoint se ven en la propia página navegable del endpoint en tu instancia.

### 1.7 Expose — expandir relaciones en línea

Por defecto las relaciones se devuelven como URLs. Añadiendo `expose_<campo>` como parámetro, ese objeto viene incrustado y completo:

```
GET /invoicerow/1/?expose_consultation_item
```

Devuelve el `consultation_item` entero dentro de la fila de factura, en vez de su URL.

> **Esto es lo que evita el problema N+1.** Sin `expose`, recuperar 300 filas de factura con sus ítems de consulta implica 301 peticiones. Con `expose`, una.

### 1.8 Webhooks

Se gestionan con el recurso `/hook/`. Al crear uno se especifica un `trigger` numérico y un `content_type`.

`content_type`: **1** = `application/x-www-form-urlencoded` · **2** = `application/json`

#### Los 68 disparadores disponibles

| # | Evento | Descripción |
|---|---|---|
| 1 | Client | Cliente creado o modificado |
| 2 | Patient | Paciente creado o modificado |
| 3 | Consultation | Consulta creada o modificada |
| 4 | Consultation delete | Consulta eliminada |
| 5 | Consultation item | Ítem de consulta creado o modificado |
| 6 | Diagnostic imaging worklist | Lista de trabajo de imagen creada |
| 7 | Diagnostic imaging worklist update | Lista de trabajo actualizada |
| 8 | Diagnostic imaging worklist delete | Lista de trabajo eliminada |
| **9** | **Invoice** | **Factura creada o modificada** |
| 10 | Invoice draft | Borrador de factura creado o modificado |
| 11 | Invoice payment | Pago de factura creado o modificado |
| 12 | Unallocated payment | Pago no asignado creado o modificado |
| 13 | Insurance claim | Reclamación de seguro creada o modificada |
| 14 | Accounting report | Informe contable creado o modificado |
| 15 | Organization item | Ítem de la organización creado o modificado |
| 16 | Laboratory referral | Derivación de laboratorio creada o modificada |
| 17 | Consultation waiting discharge | Consulta pasa a estado "esperando alta" |
| 18 | Patient referral | Derivación de paciente creada o modificada |
| 19 | SMS sent log | SMS enviado |
| 20 | Email sent log | Correo enviado |
| 21 | Appointment | Cita creada o modificada |
| 22 | Appointment delete | Cita eliminada |
| 23 | Invoice row delete | Fila de factura eliminada |
| 24 | Reminder delete | Recordatorio eliminado |
| 25 | Reminder template delete | Plantilla de recordatorio eliminada |
| 26 | Treatment plan | Plan de tratamiento creado o modificado |
| 27 | Treatment plan item | Ítem del plan creado o modificado |
| 28 | User | Usuario creado o modificado |
| 29 | Treatment plan delete | Plan de tratamiento eliminado |
| 30 | Treatment plan item delete | Ítem del plan eliminado |
| 31 | Reminder create/modify | Recordatorio creado o modificado |
| 32 | Organization medicine | Medicamento de la organización creado o modificado |
| 33 | Organization supply | Insumo creado o modificado |
| 34 | Organization food | Alimento creado o modificado |
| 35 | Organization procedure | Procedimiento creado o modificado |
| 36 | Organization laboratory analysis | Análisis de laboratorio creado o modificado |
| 37 | Organization laboratory analysis panel | Panel de análisis creado o modificado |
| 38 | Patient referral feedback sent | Retroalimentación de derivación enviada |
| 39 | Client delete | Cliente eliminado |
| 40 | Notes & Communication | Nota o comunicación creada o modificada |
| 41 | Appointment reminder create | Recordatorio de cita creado |
| 42 | Appointment reminder update | Recordatorio de cita actualizado |
| 43 | Appointment reminder delete | Recordatorio de cita eliminado |
| 44 | Client communication preference | Preferencia de comunicación creada o modificada |
| **45** | **Consultation finalized** | **Consulta finalizada** |
| 46 | Stock order | Pedido de stock creado o modificado |
| 47 | Stock order delete | Pedido de stock eliminado |
| 48 | Stock item entry | Entrada de stock creada o modificada |
| 49 | Stock item entry delete | Entrada de stock eliminada |
| 50 | Cabinet item use | Ítem de armario usado |
| 51 | Organization cabinet item | Ítem de armario creado o modificado |
| 52 | Stock order item | Ítem de pedido creado o modificado |
| 53 | Stock order item delete | Ítem de pedido eliminado |
| 54 | Health plan status update | Estado de plan de salud actualizado |
| 55 | Cabinet item cancel use | Uso de ítem de armario cancelado |
| 56 | Home delivery order created | Pedido de entrega a domicilio creado |
| 57 | Home delivery item updated | Ítem de entrega actualizado |
| 58 | Home delivery item replaced | Ítem de entrega reemplazado |
| 59 | External SMS | SMS externo recibido |
| 60 | Invoice extra fee after finalization | Cargo extra añadido tras finalizar la factura |
| 61 | Reason group | Grupo de motivos creado o modificado |
| 62 | Reason | Motivo creado o modificado |
| 63 | Department settings | Configuración de departamento modificada |
| 64 | Organization settings | Configuración de organización modificada |
| 65 | Phone number | Teléfono creado o modificado |
| 66 | Cash register | Terminal de caja creado o modificado |
| 67 | Cash book entry | Movimiento de caja digital creado |
| 68 | Z report | Informe Z de cierre de caja creado |

Además, el esquema declara tres webhooks salientes del canal de mayoristas: `wholesaler.created`, `catalog.processed` y `order.placed`.

### 1.9 Cambios de la API

- **Changelog:** `developers.provetcloud.com/restapi/changelog.html`, con feed RSS. Cada entrega separa cambios rompedores, no rompedores y rompedores anunciados.
- **Cambios próximos:** `.../upcoming-changes.html`. **A fecha de hoy no hay cambios rompedores planificados.**
- El ritmo de publicación es alto: hubo entregas el 2026-09-03, 09-07 y 09-09.

---

## 2. Los objetos centrales del dominio

Antes de las tablas conviene entender cómo encajan cinco recursos, porque el resto de la API gira a su alrededor.

### 2.1 El grafo del negocio

```
client (dueño)
  └── patient (animal)          ← un cliente tiene N pacientes; un paciente pertenece a 1 cliente
        └── consultation        ← la visita clínica
              ├── consultationitem   ← lo que se hizo/usó (procedimientos, medicinas, insumos, alimentos)
              └── invoice            ← el documento de cobro
                    └── invoicerow   ← las líneas facturables
```

### 2.2 `consultation` — la visita

Representa un encuentro clínico. Puntos que la documentación subraya:

- Los ítems **no forman parte del registro de la consulta**: se añaden como subrecursos después de crearla.
- El campo `status` es **de solo lectura al crear**. Para moverla por su ciclo de vida hay que usar `POST /consultation/{id}/update_status/`.
- `supervising_veterinarian` es opcional; por defecto es el usuario autenticado.
- Los subrecursos siguen todos el mismo patrón: `/consultation/{consultation_id}/medicines/`, `/procedures/`, `/supplies/`, `/foods/`.
- Cada ítem enlaza con los datos maestros de la organización por el campo `item`, cuya URL se obtiene de `GET /item/`.

### 2.3 `invoice` — la factura de Provet

**No confundir con una factura electrónica DIAN.** Es el documento de cobro interno de la clínica.

Campos clave de la respuesta:

| Campo | Significado |
|---|---|
| `status` | Estado del ciclo de vida. **`3` = Finalizada** |
| `total` | Importe **sin IVA** |
| `total_with_vat` | Importe **bruto, con IVA** |
| `consultation` | URL de la consulta de origen |
| `client` | URL del cliente |

### 2.4 `invoicerow` — la línea facturable

Es la unidad de facturación real. Los campos económicos, tal como los devuelve la API:

| Campo | Significado |
|---|---|
| `quantity` | Cantidad |
| `price` | Precio unitario **sin IVA** |
| `price_with_vat` | Precio unitario **con IVA** |
| `vat_percentage` | Porcentaje de IVA |
| `sum` | Total de la línea **sin IVA** |
| `sum_vat` | IVA de la línea |
| **`sum_total`** | **Total de la línea con IVA** |
| `percentage_change` | Descuento o recargo aplicado, en porcentaje |
| `calculated_price` / `calculated_price_with_vat` | Precios calculados |
| `invoicable_quantity` | Cantidad facturable |
| `credited_invoicerow` | Línea a la que abona, si es un abono |
| `first_credit_invoicerows` | Líneas de abono asociadas |
| `consultation_item` | URL del ítem de consulta de origen |
| `is_dispense_fee_item` | Marca de cargo de dispensación |

> ⚠️ **[OBS] `sum_total` se lee literal. Nunca se recalcula.**
> Recalcular desde `quantity × price_with_vat` produjo importes incorrectos en **19 de 33 consultas** verificadas contra el tenant real. Provet aplica descuentos, redondeos de línea, tarifas por departamento y multiplicadores de manada con reglas que **no se pueden reconstruir desde los campos expuestos**. `sum_total` es el número que la clínica cobra.

> ⚠️ **[OBS] Hay filas de `invoicerow` sin `consultationitem` correspondiente.** Los cargos de dispensación (`is_dispense_fee_item`) y otros conceptos generados por el sistema existen solo en la factura. Si construyes las líneas desde `consultationitem` en vez de desde `invoicerow`, **subfacturas**.

### 2.5 `client` y `patient`

`GET /client/` admite estos filtros documentados:

| Parámetro | Descripción |
|---|---|
| `firstname__icontains` | Coincidencia parcial en el nombre, insensible a mayúsculas |
| `lastname__icontains` | Ídem en el apellido |
| `organization_name__icontains` | Coincidencia parcial en la razón social |
| `email__is` | Coincidencia exacta de correo |
| `phone__icontains` | Coincidencia parcial en cualquier teléfono |
| `archived__is=false` | Excluir clientes archivados |
| (filtro de pacientes vivos) | Solo clientes con al menos un paciente vivo |
| `modified__gte` | Registros cambiados desde una marca temporal — **para sincronización delta** |

Al crear un cliente:

```json
{
  "firstname": "John",
  "lastname": "Smith",
  "email": "john.smith@example.com",
  "country": "GB",
  "customer_type": 0
}
```

`customer_type`: **0** persona privada · **1** empresa · **2** empresa UE · **3** organización benéfica · **4** entidad benéfica del Reino Unido

`country` usa ISO 3166-1 alfa-2 (`CO`, `FI`, `GB`, `US`, `NO`).

> **Los teléfonos no forman parte del registro del cliente.** Viven en el recurso independiente `/phonenumber/`, que es también el que tiene el límite más generoso de toda la API (900/min).

---

## 3. Trampas verificadas

Esta sección resume comportamientos medidos, no supuestos. Ahorra días.

| # | Trampa | Consecuencia si la ignoras |
|---|---|---|
| 1 | **`modified__gte` en recursos HIJO causa subfacturación silenciosa** | Filtrar `invoicerow` o `consultationitem` por fecha de modificación **descarta líneas modificadas antes de la ventana** pero que pertenecen a una consulta que sí entra. La factura sale incompleta y nada falla. **La ventana temporal se aplica solo al recurso padre (`consultation`); los hijos se traen enteros y se filtran en memoria** |
| 2 | **Filtrar hijos por su padre no funciona en todos los casos** | `GET /consultationitem/?consultation=38` **ignora el filtro** y devuelve la colección entera. Hay que comprobar endpoint por endpoint qué filtros respeta cada uno antes de confiar en ellos |
| 3 | **El peso del rate limit escala con `page_size`** | `page_size=1000` sobre un endpoint con 50 por defecto cuenta como **20 peticiones**. En `GET /invoice/` (60/min) eso son 3 páginas y estás fuera |
| 4 | **`GET /item/` devuelve 403 con el ámbito OAuth actual del proyecto** | El catálogo maestro de la organización no es accesible sin el permiso `Settings: Items`. Es un permiso distinto del de consultas y facturas |
| 5 | **`sum_total` literal, siempre** | Ver 2.4 |
| 6 | **Existen `invoicerow` sin `consultationitem`** | Ver 2.4 |
| 7 | **La barra final de la URL es obligatoria** | Sin ella, redirección o 404 |
| 8 | **El `+` de la zona horaria hay que codificarlo como `%2B`** | La consulta con fecha falla silenciosamente o devuelve un rango equivocado |
| 9 | **`status` de la consulta es de solo lectura al crear** | Hay que usar `POST /consultation/{id}/update_status/` |
| 10 | **Los tokens estáticos están muertos desde 2023** | Cualquier ejemplo con `Authorization: Token` está caducado |

---

## 4. Índice de recursos por grupo temático

Las tablas que siguen cubren **las 1.122 operaciones**. Cada fila indica el método, la ruta relativa a `/api/0.1`, qué hace, el permiso exacto que exige y el límite de peticiones por minuto — todo extraído del esquema oficial.

| Grupo | Recursos |
|---|---|
| Clients & Patients | 6 |
| Appointments & Scheduling | 8 |
| Clinical & Consultations | 11 |
| Laboratory & Diagnostics | 6 |
| Treatment & Care Plans | 2 |
| Prescriptions & Medicine | 6 |
| Invoicing & Payments | 9 |
| Accounting & Finance | 12 |
| Insurance & Health Plans | 3 |
| Inventory & Products | 10 |
| Pricing & Discounts | 2 |
| Patient Referrals | 3 |
| Organization & Settings | 5 |
| Users & Permissions | 1 |
| Tags & Organization | 1 |
| Communications & Reminders | 3 |
| Tasks & Notes | 3 |
| Knowledge Base & Templates | 2 |
| Lists & Data | 5 |
| Utilities & System | 7 |
| Health plan self-service | 1 |
| Wholesaler API | 1 |
| Otros | 34 |

---

## 5. Todos los endpoints

### Clients & Patients


#### Alternative payers

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/alternative_payer/` | List Alternative Payer | General: Patients and clients | 100/min |
| `POST` | `/alternative_payer/` | Create Alternative Payer | General: Patients and clients | 300/min |
| `GET` | `/alternative_payer/{id}/` | Get Alternative Payer | General: Patients and clients | 300/min |
| `PUT` | `/alternative_payer/{id}/` | Update Alternative Payer | General: Patients and clients | 300/min |
| `PATCH` | `/alternative_payer/{id}/` | Patch Alternative Payer | General: Patients and clients | 300/min |
| `DELETE` | `/alternative_payer/{id}/` | Delete Alternative Payer | General: Patients and clients | 300/min |

#### Client communication preference rows

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/client_communication_preference_row/` | List Client Communication Preference Row | General: Patients and clients | 100/min |
| `POST` | `/client_communication_preference_row/` | Create Client Communication Preference Row | General: Patients and clients | 300/min |
| `GET` | `/client_communication_preference_row/{id}/` | Get Client Communication Preference Row | General: Patients and clients | 300/min |
| `PUT` | `/client_communication_preference_row/{id}/` | Update Client Communication Preference Row | General: Patients and clients | 300/min |
| `PATCH` | `/client_communication_preference_row/{id}/` | Patch Client Communication Preference Row | General: Patients and clients | 300/min |
| `DELETE` | `/client_communication_preference_row/{id}/` | Delete Client Communication Preference Row | General: Patients and clients | 300/min |

#### Client communication preferences

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/client_communication_preferences/` | List Client Communication Preferences | General: Patients and clients | 100/min |
| `POST` | `/client_communication_preferences/` | Create Client Communication Preferences | General: Patients and clients | 300/min |
| `GET` | `/client_communication_preferences/{id}/` | Get Client Communication Preferences | General: Patients and clients | 300/min |
| `PUT` | `/client_communication_preferences/{id}/` | Update Client Communication Preferences | General: Patients and clients | 300/min |
| `PATCH` | `/client_communication_preferences/{id}/` | Patch Client Communication Preferences | General: Patients and clients | 300/min |
| `DELETE` | `/client_communication_preferences/{id}/` | Delete Client Communication Preferences | General: Patients and clients | 300/min |

#### Clients

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/client/` | List Client | General: Patients and clients | 125/min |
| `POST` | `/client/` | Create Client | General: Patients and clients | 300/min |
| `GET` | `/get_max_client_id/` | Get Get Max Client Id | General: Patients and clients | 100/min |
| `GET` | `/client/{id}/` | Get Client | General: Patients and clients | 500/min |
| `PUT` | `/client/{id}/` | Update Client | General: Patients and clients | 200/min |
| `PATCH` | `/client/{id}/` | Patch Client | General: Patients and clients | 200/min |
| `DELETE` | `/client/{id}/` | Delete Client | General: Patients and clients | 300/min |
| `GET` | `/client/{parent_lookup_client}/custom_field_values/` | List Client Custom Field Values | General: Patients and clients | 100/min |
| `POST` | `/client/{parent_lookup_client}/custom_field_values/` | Create Client Custom Field Values | General: Patients and clients | 300/min |
| `GET` | `/client/{parent_lookup_client}/custom_field_values/{id}/` | Get Client Custom Field Values | General: Patients and clients | 300/min |
| `PUT` | `/client/{parent_lookup_client}/custom_field_values/{id}/` | Update Client Custom Field Values | General: Patients and clients | 300/min |
| `PATCH` | `/client/{parent_lookup_client}/custom_field_values/{id}/` | Patch Client Custom Field Values | General: Patients and clients | 300/min |
| `DELETE` | `/client/{parent_lookup_client}/custom_field_values/{id}/` | Delete Client Custom Field Values | General: Patients and clients | 300/min |

#### Patients

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/get_max_patient_id/` | Get Get Max Patient Id | General: Patients and clients | 100/min |
| `GET` | `/patient/` | List Patient | General: Patients and clients | 300/min |
| `POST` | `/patient/` | Create Patient | General: Patients and clients | 250/min |
| `POST` | `/patient/bulk/` | Create Patient Bulk | General: Patients and clients | 300/min |
| `GET` | `/patient/{id}/` | Get Patient | General: Patients and clients | 1200/min |
| `PUT` | `/patient/{id}/` | Update Patient | General: Patients and clients | 250/min |
| `PATCH` | `/patient/{id}/` | Patch Patient | General: Patients and clients | 250/min |
| `DELETE` | `/patient/{id}/` | Delete Patient | General: Patients and clients | 300/min |
| `POST` | `/patient/{id}/merge/` | Create Patient Merge | General: Patients and clients | 100/min |
| `POST` | `/patient/{id}/unmerge/` | Create Patient Unmerge | General: Patients and clients | 100/min |
| `GET` | `/patient/{parent_lookup_patient}/blood_pressure/` | List Patient Blood Pressure | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/blood_pressure/` | Create Patient Blood Pressure | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/body_condition_score/` | List Patient Body Condition Score | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/body_condition_score/` | Create Patient Body Condition Score | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/consultations/` | List Patient Consultations | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/consultations/` | Create Patient Consultations | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/custom_field_values/` | List Patient Custom Field Values | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/custom_field_values/` | Create Patient Custom Field Values | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/external_vaccination/` | List Patient External Vaccination | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/external_vaccination/` | Create Patient External Vaccination | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/extras/` | List Patient Extras | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/extras/` | Create Patient Extras | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/heart_rate/` | List Patient Heart Rate | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/heart_rate/` | Create Patient Heart Rate | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/history/` | Get Patient History | General: Patients and clients | 100/min |
| `GET` | `/patient/{parent_lookup_patient}/json_history/` | Get Patient Json History | General: Patients and clients | 100/min |
| `GET` | `/patient/{parent_lookup_patient}/peripheral_oxygen_saturation/` | List Patient Peripheral Oxygen Saturation | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/peripheral_oxygen_saturation/` | Create Patient Peripheral Oxygen Saturation | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/respiratory_rate/` | List Patient Respiratory Rate | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/respiratory_rate/` | Create Patient Respiratory Rate | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/temperature/` | List Patient Temperature | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/temperature/` | Create Patient Temperature | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/weight/` | List Patient Weight | General: Patients and clients | 100/min |
| `POST` | `/patient/{parent_lookup_patient}/weight/` | Create Patient Weight | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/blood_pressure/{id}/` | Get Patient Blood Pressure | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/blood_pressure/{id}/` | Update Patient Blood Pressure | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/blood_pressure/{id}/` | Patch Patient Blood Pressure | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/blood_pressure/{id}/` | Delete Patient Blood Pressure | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/body_condition_score/{id}/` | Get Patient Body Condition Score | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/body_condition_score/{id}/` | Update Patient Body Condition Score | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/body_condition_score/{id}/` | Patch Patient Body Condition Score | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/body_condition_score/{id}/` | Delete Patient Body Condition Score | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/consultations/{id}/` | Get Patient Consultations | General: Patients and clients; General: Consultations and its items | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/consultations/{id}/` | Update Patient Consultations | General: Patients and clients; General: Consultations and its items | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/consultations/{id}/` | Patch Patient Consultations | General: Patients and clients; General: Consultations and its items | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/consultations/{id}/` | Delete Patient Consultations | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/custom_field_values/{id}/` | Get Patient Custom Field Values | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/custom_field_values/{id}/` | Update Patient Custom Field Values | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/custom_field_values/{id}/` | Patch Patient Custom Field Values | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/custom_field_values/{id}/` | Delete Patient Custom Field Values | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/external_vaccination/{id}/` | Get Patient External Vaccination | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/external_vaccination/{id}/` | Update Patient External Vaccination | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/external_vaccination/{id}/` | Patch Patient External Vaccination | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/extras/{id}/` | Get Patient Extras | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/extras/{id}/` | Update Patient Extras | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/extras/{id}/` | Patch Patient Extras | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/extras/{id}/` | Delete Patient Extras | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/heart_rate/{id}/` | Get Patient Heart Rate | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/heart_rate/{id}/` | Update Patient Heart Rate | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/heart_rate/{id}/` | Patch Patient Heart Rate | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/heart_rate/{id}/` | Delete Patient Heart Rate | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/peripheral_oxygen_saturation/{id}/` | Get Patient Peripheral Oxygen Saturation | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/peripheral_oxygen_saturation/{id}/` | Update Patient Peripheral Oxygen Saturation | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/peripheral_oxygen_saturation/{id}/` | Patch Patient Peripheral Oxygen Saturation | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/peripheral_oxygen_saturation/{id}/` | Delete Patient Peripheral Oxygen Saturation | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/respiratory_rate/{id}/` | Get Patient Respiratory Rate | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/respiratory_rate/{id}/` | Update Patient Respiratory Rate | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/respiratory_rate/{id}/` | Patch Patient Respiratory Rate | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/respiratory_rate/{id}/` | Delete Patient Respiratory Rate | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/temperature/{id}/` | Get Patient Temperature | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/temperature/{id}/` | Update Patient Temperature | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/temperature/{id}/` | Patch Patient Temperature | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/temperature/{id}/` | Delete Patient Temperature | General: Patients and clients | 300/min |
| `GET` | `/patient/{parent_lookup_patient}/weight/{id}/` | Get Patient Weight | General: Patients and clients | 300/min |
| `PUT` | `/patient/{parent_lookup_patient}/weight/{id}/` | Update Patient Weight | General: Patients and clients | 300/min |
| `PATCH` | `/patient/{parent_lookup_patient}/weight/{id}/` | Patch Patient Weight | General: Patients and clients | 300/min |
| `DELETE` | `/patient/{parent_lookup_patient}/weight/{id}/` | Delete Patient Weight | General: Patients and clients | 300/min |

#### Phone numbers

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/phonenumber/` | List Phonenumber | General: Patients and clients | 900/min |
| `POST` | `/phonenumber/` | Create Phonenumber | General: Patients and clients | 900/min |
| `GET` | `/phonenumber/{id}/` | Get Phonenumber | General: Patients and clients | 3600/min |
| `PUT` | `/phonenumber/{id}/` | Update Phonenumber | General: Patients and clients | 900/min |
| `PATCH` | `/phonenumber/{id}/` | Patch Phonenumber | General: Patients and clients | 900/min |
| `DELETE` | `/phonenumber/{id}/` | Delete Phonenumber | General: Patients and clients | 300/min |

### Appointments & Scheduling


#### Appointment reminders

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/appointment_reminder/` | List Appointment Reminder | Calendar: Appointments | 100/min |
| `POST` | `/appointment_reminder/` | Create Appointment Reminder | Calendar: Appointments | 300/min |
| `GET` | `/appointment_reminder/{id}/` | Get Appointment Reminder | Calendar: Appointments | 300/min |
| `PUT` | `/appointment_reminder/{id}/` | Update Appointment Reminder | Calendar: Appointments | 300/min |
| `PATCH` | `/appointment_reminder/{id}/` | Patch Appointment Reminder | Calendar: Appointments | 300/min |
| `POST` | `/appointment_reminder/{id}/mark_external_sending/` | Create Appointment Reminder Mark External Sending | Calendar: Appointments | 100/min |
| `PUT` | `/appointment_reminder/{id}/mark_sent/` | Update Appointment Reminder Mark Sent | Calendar: Appointments | 100/min |

#### Appointments

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/appointment/` | List Appointment | Calendar: Appointments | 300/min |
| `POST` | `/appointment/` | Create Appointment | Calendar: Appointments | 500/min |
| `GET` | `/appointment/check_conflicts/` | List Appointment Check Conflicts | Calendar: Appointments | 100/min |
| `GET` | `/appointment/combined/` | Get Appointment Combined | Calendar: Appointments | 100/min |
| `GET` | `/appointment/{id}/` | Get Appointment | Calendar: Appointments | 900/min |
| `PUT` | `/appointment/{id}/` | Update Appointment | Calendar: Appointments | 500/min |
| `PATCH` | `/appointment/{id}/` | Patch Appointment | Calendar: Appointments | 500/min |
| `POST` | `/appointment/{id}/admit/` | Create Appointment Admit | Calendar: Appointments | 100/min |
| `POST` | `/appointment/{id}/cancel_appointment/` | Create Appointment Cancel Appointment | Calendar: Appointments | 100/min |
| `POST` | `/appointment/{id}/create_advance_payment/` | Create Appointment Create Advance Payment | Calendar: Appointments | 100/min |
| `POST` | `/appointment/{id}/create_telemedicine_room/` | Create Appointment Create Telemedicine Room | Calendar: Appointments | 100/min |
| `POST` | `/appointment/{id}/send_appointment_confirmation/` | Create Appointment Send Appointment Confirmation | Calendar: Appointments | 100/min |
| `POST` | `/appointment/{parent_lookup_appointment}/multi_upload/` | Create Appointment Multi Upload | Calendar: Appointments | 300/min |
| `GET` | `/appointment/{parent_lookup_appointment}/upload/` | List Appointment Upload | Calendar: Appointments | 100/min |
| `POST` | `/appointment/{parent_lookup_appointment}/upload/` | Create Appointment Upload | Calendar: Appointments | 300/min |
| `GET` | `/appointment/{parent_lookup_appointment}/upload/{id}/` | Get Appointment Upload | Calendar: Appointments | 300/min |
| `DELETE` | `/appointment/{parent_lookup_appointment}/upload/{id}/` | Delete Appointment Upload | Calendar: Appointments | 300/min |

#### Cancellation reasons

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/cancellationreason/` | List Cancellationreason | Settings: Reasons | 100/min |
| `POST` | `/cancellationreason/` | Create Cancellationreason | Settings: Reasons | 300/min |
| `GET` | `/cancellationreason/{id}/` | Get Cancellationreason | Settings: Reasons | 300/min |
| `PUT` | `/cancellationreason/{id}/` | Update Cancellationreason | Settings: Reasons | 300/min |
| `PATCH` | `/cancellationreason/{id}/` | Patch Cancellationreason | Settings: Reasons | 300/min |
| `DELETE` | `/cancellationreason/{id}/` | Delete Cancellationreason | Settings: Reasons | 300/min |

#### Online booking

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/onlinebookingclient/` | List Onlinebookingclient | Calendar: Appointments | 100/min |
| `POST` | `/onlinebookingclient/` | Create Onlinebookingclient | Calendar: Appointments | 300/min |
| `GET` | `/onlinebookingpatient/` | List Onlinebookingpatient | Calendar: Appointments | 100/min |
| `POST` | `/onlinebookingpatient/` | Create Onlinebookingpatient | Calendar: Appointments | 300/min |
| `GET` | `/onlinebookingclient/{id}/` | Get Onlinebookingclient | Calendar: Appointments | 300/min |
| `GET` | `/onlinebookingpatient/{id}/` | Get Onlinebookingpatient | Calendar: Appointments | 300/min |

#### Preliminary bookings

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/preliminary_booking/` | List Preliminary Booking | Calendar: Appointments | 100/min |
| `POST` | `/preliminary_booking/` | Create Preliminary Booking | Calendar: Appointments | 300/min |
| `GET` | `/preliminary_booking/{id}/` | Get Preliminary Booking | Calendar: Appointments | 300/min |

#### Resources

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/resource/` | List Resource | Settings: Department settings | 100/min |
| `POST` | `/resource/` | Create Resource | Settings: Department settings | 300/min |
| `GET` | `/resource/{id}/` | Get Resource | Settings: Department settings | 300/min |
| `PUT` | `/resource/{id}/` | Update Resource | Settings: Department settings | 300/min |
| `PATCH` | `/resource/{id}/` | Patch Resource | Settings: Department settings | 300/min |

#### Shifts

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/shift/` | List Shift | Calendar: Shifts | 100/min |
| `POST` | `/shift/` | Create Shift | Calendar: Shifts | 300/min |
| `GET` | `/shifttype/` | List Shifttype | Calendar: Shifts | 100/min |
| `POST` | `/shifttype/` | Create Shifttype | Calendar: Shifts | 300/min |
| `GET` | `/shift/{id}/` | Get Shift | Calendar: Shifts | 300/min |
| `PUT` | `/shift/{id}/` | Update Shift | Calendar: Shifts | 300/min |
| `PATCH` | `/shift/{id}/` | Patch Shift | Calendar: Shifts | 300/min |
| `DELETE` | `/shift/{id}/` | Delete Shift | Calendar: Shifts | 300/min |
| `GET` | `/shifttype/{id}/` | Get Shifttype | Calendar: Shifts | 300/min |
| `PUT` | `/shifttype/{id}/` | Update Shifttype | Calendar: Shifts | 300/min |
| `PATCH` | `/shifttype/{id}/` | Patch Shifttype | Calendar: Shifts | 300/min |

#### Veterinarians availability

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/veterinarians_availibility/` | List Veterinarians Availibility | Calendar: Shifts | 100/min |

### Clinical & Consultations


#### Consultation antibiotics

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultationantibiotic/` | List Consultationantibiotic | General: Consultations and its items | 100/min |
| `POST` | `/consultationantibiotic/` | Create Consultationantibiotic | General: Consultations and its items | 300/min |
| `GET` | `/consultationantibioticpanel/` | List Consultationantibioticpanel | General: Consultations and its items | 100/min |
| `POST` | `/consultationantibioticpanel/` | Create Consultationantibioticpanel | General: Consultations and its items | 300/min |
| `GET` | `/consultationantibiotic/{id}/` | Get Consultationantibiotic | General: Consultations and its items | 300/min |
| `PUT` | `/consultationantibiotic/{id}/` | Update Consultationantibiotic | General: Consultations and its items | 300/min |
| `PATCH` | `/consultationantibiotic/{id}/` | Patch Consultationantibiotic | General: Consultations and its items | 300/min |
| `DELETE` | `/consultationantibiotic/{id}/` | Delete Consultationantibiotic | General: Consultations and its items | 300/min |
| `GET` | `/consultationantibioticpanel/{id}/` | Get Consultationantibioticpanel | General: Consultations and its items | 300/min |
| `PUT` | `/consultationantibioticpanel/{id}/` | Update Consultationantibioticpanel | General: Consultations and its items | 300/min |
| `PATCH` | `/consultationantibioticpanel/{id}/` | Patch Consultationantibioticpanel | General: Consultations and its items | 300/min |
| `DELETE` | `/consultationantibioticpanel/{id}/` | Delete Consultationantibioticpanel | General: Consultations and its items | 300/min |

#### Consultation bundles

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultationitemtemplate/` | List Consultationitemtemplate | General: Consultations and its items | 100/min |
| `POST` | `/consultationitemtemplate/` | Create Consultationitemtemplate | General: Consultations and its items | 300/min |
| `GET` | `/consultationitemtemplate/{id}/` | Get Consultationitemtemplate | General: Consultations and its items | 300/min |
| `PUT` | `/consultationitemtemplate/{id}/` | Update Consultationitemtemplate | General: Consultations and its items | 300/min |
| `PATCH` | `/consultationitemtemplate/{id}/` | Patch Consultationitemtemplate | General: Consultations and its items | 300/min |

#### Consultation items

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultationitem/` | List Consultationitem | General: Consultations and its items | 100/min |
| `GET` | `/consultation_items/analysis/` | List Consultation Items Analysis | General: Consultations and its items | 150/min |
| `POST` | `/consultation_items/analysis/` | Create Consultation Items Analysis | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/food/` | List Consultation Items Food | General: Consultations and its items | 100/min |
| `POST` | `/consultation_items/food/` | Create Consultation Items Food | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/medicine/` | List Consultation Items Medicine | General: Consultations and its items | 100/min |
| `POST` | `/consultation_items/medicine/` | Create Consultation Items Medicine | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/procedure/` | List Consultation Items Procedure | General: Consultations and its items | 100/min |
| `POST` | `/consultation_items/procedure/` | Create Consultation Items Procedure | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/supply/` | List Consultation Items Supply | General: Consultations and its items | 100/min |
| `POST` | `/consultation_items/supply/` | Create Consultation Items Supply | General: Consultations and its items | 300/min |
| `GET` | `/consultationitem/{id}/` | Get Consultationitem | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/analysis/{id}/` | Get Consultation Items Analysis | General: Consultations and its items | 600/min |
| `PUT` | `/consultation_items/analysis/{id}/` | Update Consultation Items Analysis | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_items/analysis/{id}/` | Patch Consultation Items Analysis | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_items/analysis/{id}/` | Delete Consultation Items Analysis | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/food/{id}/` | Get Consultation Items Food | General: Consultations and its items | 300/min |
| `PUT` | `/consultation_items/food/{id}/` | Update Consultation Items Food | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_items/food/{id}/` | Patch Consultation Items Food | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_items/food/{id}/` | Delete Consultation Items Food | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/medicine/{id}/` | Get Consultation Items Medicine | General: Consultations and its items | 300/min |
| `PUT` | `/consultation_items/medicine/{id}/` | Update Consultation Items Medicine | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_items/medicine/{id}/` | Patch Consultation Items Medicine | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_items/medicine/{id}/` | Delete Consultation Items Medicine | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/procedure/{id}/` | Get Consultation Items Procedure | General: Consultations and its items | 300/min |
| `PUT` | `/consultation_items/procedure/{id}/` | Update Consultation Items Procedure | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_items/procedure/{id}/` | Patch Consultation Items Procedure | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_items/procedure/{id}/` | Delete Consultation Items Procedure | General: Consultations and its items | 300/min |
| `GET` | `/consultation_items/supply/{id}/` | Get Consultation Items Supply | General: Consultations and its items | 300/min |
| `PUT` | `/consultation_items/supply/{id}/` | Update Consultation Items Supply | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_items/supply/{id}/` | Patch Consultation Items Supply | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_items/supply/{id}/` | Delete Consultation Items Supply | General: Consultations and its items | 300/min |
| `POST` | `/consultation_items/medicine/{id}/delete_withdrawal_period/` | Create Consultation Items Medicine Delete Withdrawal Period | General: Consultations and its items | 100/min |

#### Consultation laboratory referrals

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultation_laboratory_referral/` | List Consultation Laboratory Referral | General: Consultations and its items | 150/min |
| `POST` | `/consultation_laboratory_referral/` | Create Consultation Laboratory Referral | General: Consultations and its items | 300/min |
| `GET` | `/consultation_laboratory_referral/{id}/` | Get Consultation Laboratory Referral | General: Consultations and its items | 500/min |
| `PUT` | `/consultation_laboratory_referral/{id}/` | Update Consultation Laboratory Referral | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_laboratory_referral/{id}/` | Patch Consultation Laboratory Referral | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_laboratory_referral/{id}/` | Delete Consultation Laboratory Referral | General: Consultations and its items | 300/min |

#### Consultation organisms

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultationorganism/` | List Consultationorganism | General: Consultations and its items | 100/min |
| `POST` | `/consultationorganism/` | Create Consultationorganism | General: Consultations and its items | 300/min |
| `GET` | `/consultationorganism/{id}/` | Get Consultationorganism | General: Consultations and its items | 300/min |
| `PUT` | `/consultationorganism/{id}/` | Update Consultationorganism | General: Consultations and its items | 300/min |
| `PATCH` | `/consultationorganism/{id}/` | Patch Consultationorganism | General: Consultations and its items | 300/min |
| `DELETE` | `/consultationorganism/{id}/` | Delete Consultationorganism | General: Consultations and its items | 300/min |

#### Consultation samples

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultation_sample/` | List Consultation Sample | General: Consultations and its items | 100/min |
| `POST` | `/consultation_sample/` | Create Consultation Sample | General: Consultations and its items | 300/min |
| `GET` | `/consultation_sample/{id}/` | Get Consultation Sample | General: Consultations and its items | 300/min |
| `PUT` | `/consultation_sample/{id}/` | Update Consultation Sample | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_sample/{id}/` | Patch Consultation Sample | General: Consultations and its items | 300/min |

#### Consultation target areas

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultation_targetarea/` | List Consultation Targetarea | General: Consultations and its items | 100/min |
| `POST` | `/consultation_targetarea/` | Create Consultation Targetarea | General: Consultations and its items | 300/min |
| `GET` | `/consultation_targetarea/{id}/` | Get Consultation Targetarea | General: Consultations and its items | 300/min |
| `PUT` | `/consultation_targetarea/{id}/` | Update Consultation Targetarea | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation_targetarea/{id}/` | Patch Consultation Targetarea | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation_targetarea/{id}/` | Delete Consultation Targetarea | General: Consultations and its items | 300/min |

#### Consultations

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultation/` | List Consultation | General: Consultations and its items | 100/min |
| `POST` | `/consultation/` | Create Consultation | General: Consultations and its items | 300/min |
| `POST` | `/consultation/admit/` | Create Consultation Admit | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{id}/` | Get Consultation | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{id}/` | Update Consultation | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{id}/` | Patch Consultation | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/admit/{id}/` | Update Consultation Admit | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/admit/{id}/` | Patch Consultation Admit | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{id}/mark_sent/` | Get Consultation Mark Sent | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{id}/mark_sent/` | Create Consultation Mark Sent | General: Consultations and its items | 100/min |
| `PUT` | `/consultation/{id}/mark_sent/` | Update Consultation Mark Sent | General: Consultations and its items | 100/min |
| `PATCH` | `/consultation/{id}/mark_sent/` | Patch Consultation Mark Sent | General: Consultations and its items | 100/min |
| `GET` | `/consultation/{id}/set_integration_status/` | Get Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{id}/set_integration_status/` | Create Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `PUT` | `/consultation/{id}/set_integration_status/` | Update Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `PATCH` | `/consultation/{id}/set_integration_status/` | Patch Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{id}/update_started_time/` | Create Consultation Update Started Time | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{id}/update_status/` | Create Consultation Update Status | General: Consultations and its items | 100/min |
| `GET` | `/consultation/{parent_lookup_consultation}/analyses/` | List Consultation Analyses | General: Consultations and its items | 150/min |
| `POST` | `/consultation/{parent_lookup_consultation}/analyses/` | Create Consultation Analyses | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultation_json_history/` | Get Consultation Consultation Json History | General: Consultations and its items | 100/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationclinicalsign/` | List Consultation Consultationclinicalsign | General: Consultations and its items | 100/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationdiagnosis/` | List Consultation Consultationdiagnosis | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/consultationdiagnosis/` | Create Consultation Consultationdiagnosis | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationdischargeinstruction/` | List Consultation Consultationdischargeinstruction | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/consultationdischargeinstruction/` | Create Consultation Consultationdischargeinstruction | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationnote/` | Get Consultation Consultationnote | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/consultationnote/` | Create Consultation Consultationnote | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationpatientstatus/` | List Consultation Consultationpatientstatus | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/consultationpatientstatus/` | Create Consultation Consultationpatientstatus | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/extras/` | List Consultation Extras | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/extras/` | Create Consultation Extras | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/foods/` | List Consultation Foods | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/foods/` | Create Consultation Foods | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/medicines/` | List Consultation Medicines | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/medicines/` | Create Consultation Medicines | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/patient_groups/` | List Consultation Patient Groups | General: Patients and clients; General: Consultations and its items | 100/min |
| `GET` | `/consultation/{parent_lookup_consultation}/procedures/` | List Consultation Procedures | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/procedures/` | Create Consultation Procedures | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/supplies/` | List Consultation Supplies | General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/supplies/` | Create Consultation Supplies | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/treatmentplans/` | List Consultation Treatmentplans | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/consultation/{parent_lookup_consultation}/treatmentplans/` | Create Consultation Treatmentplans | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/analyses/{id}/` | Get Consultation Analyses | General: Consultations and its items | 600/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/analyses/{id}/` | Update Consultation Analyses | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/analyses/{id}/` | Patch Consultation Analyses | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/analyses/{id}/` | Delete Consultation Analyses | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationclinicalsign/{id}/` | Get Consultation Consultationclinicalsign | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationdiagnosis/{id}/` | Get Consultation Consultationdiagnosis | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/consultationdiagnosis/{id}/` | Update Consultation Consultationdiagnosis | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/consultationdiagnosis/{id}/` | Patch Consultation Consultationdiagnosis | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/consultationdiagnosis/{id}/` | Delete Consultation Consultationdiagnosis | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationdischargeinstruction/{id}/` | Get Consultation Consultationdischargeinstruction | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/consultationdischargeinstruction/{id}/` | Update Consultation Consultationdischargeinstruction | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/consultationdischargeinstruction/{id}/` | Patch Consultation Consultationdischargeinstruction | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/consultationdischargeinstruction/{id}/` | Delete Consultation Consultationdischargeinstruction | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationnote/{id}/` | Get Consultation Consultationnote | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/consultationnote/{id}/` | Update Consultation Consultationnote | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/consultationnote/{id}/` | Patch Consultation Consultationnote | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/consultationnote/{id}/` | Delete Consultation Consultationnote | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/consultationpatientstatus/{id}/` | Get Consultation Consultationpatientstatus | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/consultationpatientstatus/{id}/` | Update Consultation Consultationpatientstatus | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/consultationpatientstatus/{id}/` | Patch Consultation Consultationpatientstatus | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/consultationpatientstatus/{id}/` | Delete Consultation Consultationpatientstatus | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/extras/{id}/` | Get Consultation Extras | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/extras/{id}/` | Update Consultation Extras | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/extras/{id}/` | Patch Consultation Extras | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/extras/{id}/` | Delete Consultation Extras | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/foods/{id}/` | Get Consultation Foods | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/foods/{id}/` | Update Consultation Foods | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/foods/{id}/` | Patch Consultation Foods | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/foods/{id}/` | Delete Consultation Foods | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/medicines/{id}/` | Get Consultation Medicines | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/medicines/{id}/` | Update Consultation Medicines | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/medicines/{id}/` | Patch Consultation Medicines | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/medicines/{id}/` | Delete Consultation Medicines | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/patient_groups/{id}/` | Get Consultation Patient Groups | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/procedures/{id}/` | Get Consultation Procedures | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/procedures/{id}/` | Update Consultation Procedures | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/procedures/{id}/` | Patch Consultation Procedures | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/procedures/{id}/` | Delete Consultation Procedures | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/supplies/{id}/` | Get Consultation Supplies | General: Consultations and its items | 300/min |
| `PUT` | `/consultation/{parent_lookup_consultation}/supplies/{id}/` | Update Consultation Supplies | General: Consultations and its items | 300/min |
| `PATCH` | `/consultation/{parent_lookup_consultation}/supplies/{id}/` | Patch Consultation Supplies | General: Consultations and its items | 300/min |
| `DELETE` | `/consultation/{parent_lookup_consultation}/supplies/{id}/` | Delete Consultation Supplies | General: Consultations and its items | 300/min |
| `GET` | `/consultation/{parent_lookup_consultation}/treatmentplans/{id}/` | Get Consultation Treatmentplans | General: Patients and clients; General: Consultations and its items | 300/min |
| `POST` | `/consultation/{parent_lookup_consultation}/medicines/{id}/delete_withdrawal_period/` | Create Consultation Medicines Delete Withdrawal Period | General: Consultations and its items | 100/min |

#### Create consultation

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/create_consultation/` | List Create Consultation | General: Consultations and its items | 100/min |
| `POST` | `/create_consultation/` | Create Create Consultation | General: Consultations and its items | 300/min |
| `GET` | `/create_consultation/{id}/` | Get Create Consultation | General: Consultations and its items | 300/min |
| `PUT` | `/create_consultation/{id}/` | Update Create Consultation | General: Consultations and its items | 300/min |
| `PATCH` | `/create_consultation/{id}/` | Patch Create Consultation | General: Consultations and its items | 300/min |
| `GET` | `/create_consultation/{id}/mark_sent/` | Get Create Consultation Mark Sent | General: Consultations and its items | 100/min |
| `POST` | `/create_consultation/{id}/mark_sent/` | Create Create Consultation Mark Sent | General: Consultations and its items | 100/min |
| `PUT` | `/create_consultation/{id}/mark_sent/` | Update Create Consultation Mark Sent | General: Consultations and its items | 100/min |
| `PATCH` | `/create_consultation/{id}/mark_sent/` | Patch Create Consultation Mark Sent | General: Consultations and its items | 100/min |
| `GET` | `/create_consultation/{id}/set_integration_status/` | Get Create Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `POST` | `/create_consultation/{id}/set_integration_status/` | Create Create Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `PUT` | `/create_consultation/{id}/set_integration_status/` | Update Create Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `PATCH` | `/create_consultation/{id}/set_integration_status/` | Patch Create Consultation Set Integration Status | General: Consultations and its items | 100/min |
| `POST` | `/create_consultation/{id}/update_started_time/` | Create Create Consultation Update Started Time | General: Consultations and its items | 100/min |
| `POST` | `/create_consultation/{id}/update_status/` | Create Create Consultation Update Status | General: Consultations and its items | 100/min |

#### Procedures

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/procedure/` | List Procedure | Settings: Items | 100/min |
| `POST` | `/procedure/` | Create Procedure | Settings: Items | 300/min |
| `GET` | `/procedure/{id}/` | Get Procedure | Settings: Items | 300/min |
| `PUT` | `/procedure/{id}/` | Update Procedure | Settings: Items | 300/min |
| `PATCH` | `/procedure/{id}/` | Patch Procedure | Settings: Items | 300/min |
| `DELETE` | `/procedure/{id}/` | Delete Procedure | Settings: Items | 300/min |

#### Target areas

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/targetarea/` | List Targetarea | Settings: Integration settings | 100/min |
| `GET` | `/targetarea/{id}/` | Get Targetarea | Settings: Integration settings | 300/min |

### Laboratory & Diagnostics


#### Antibiotics

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/antibiotic/` | List Antibiotic | Settings: Items | 100/min |
| `GET` | `/antibioticpanel/` | List Antibioticpanel | Settings: Items | 100/min |
| `GET` | `/antibiotic/{id}/` | Get Antibiotic | Settings: Items | 300/min |
| `GET` | `/antibioticpanel/{id}/` | Get Antibioticpanel | Settings: Items | 300/min |

#### Diagnostic imaging

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/diagnosticimaging_referral/` | List Diagnosticimaging Referral | Diagnostic imaging: Diagnostic imaging referrals | 100/min |
| `POST` | `/diagnosticimaging_referral/` | Create Diagnosticimaging Referral | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `GET` | `/diagnosticimaging_worklist/` | List Diagnosticimaging Worklist | Diagnostic imaging: Diagnostic imaging referrals | 250/min |
| `POST` | `/diagnosticimaging_worklist/` | Create Diagnosticimaging Worklist | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `GET` | `/diagnosticimaging_referral/{id}/` | Get Diagnosticimaging Referral | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `PUT` | `/diagnosticimaging_referral/{id}/` | Update Diagnosticimaging Referral | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `PATCH` | `/diagnosticimaging_referral/{id}/` | Patch Diagnosticimaging Referral | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `DELETE` | `/diagnosticimaging_referral/{id}/` | Delete Diagnosticimaging Referral | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `GET` | `/diagnosticimaging_worklist/{id}/` | Get Diagnosticimaging Worklist | Diagnostic imaging: Diagnostic imaging referrals | 1000/min |
| `PUT` | `/diagnosticimaging_worklist/{id}/` | Update Diagnosticimaging Worklist | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `PATCH` | `/diagnosticimaging_worklist/{id}/` | Patch Diagnosticimaging Worklist | Diagnostic imaging: Diagnostic imaging referrals | 300/min |
| `DELETE` | `/diagnosticimaging_worklist/{id}/` | Delete Diagnosticimaging Worklist | Diagnostic imaging: Diagnostic imaging referrals | 300/min |

#### Imaging categories

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/imagingcategory/` | List Imagingcategory | Settings: Integration settings | 100/min |
| `GET` | `/imagingsubcategory/` | List Imagingsubcategory | Settings: Integration settings | 100/min |
| `GET` | `/imagingcategory/{id}/` | Get Imagingcategory | Settings: Integration settings | 300/min |
| `GET` | `/imagingsubcategory/{id}/` | Get Imagingsubcategory | Settings: Integration settings | 300/min |

#### Laboratory analyses

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/laboratoryanalysis/` | List Laboratoryanalysis | Settings: Items | 150/min |
| `POST` | `/laboratoryanalysis/` | Create Laboratoryanalysis | Settings: Items | 300/min |
| `GET` | `/laboratoryanalysisgroup/` | List Laboratoryanalysisgroup | Settings: Items | 100/min |
| `POST` | `/laboratoryanalysisgroup/` | Create Laboratoryanalysisgroup | Settings: Items | 300/min |
| `GET` | `/laboratoryanalysispanel/` | List Laboratoryanalysispanel | Settings: Items | 100/min |
| `POST` | `/laboratoryanalysispanel/` | Create Laboratoryanalysispanel | Settings: Items | 300/min |
| `GET` | `/laboratoryanalysis/{id}/` | Get Laboratoryanalysis | Settings: Items | 600/min |
| `PUT` | `/laboratoryanalysis/{id}/` | Update Laboratoryanalysis | Settings: Items | 300/min |
| `PATCH` | `/laboratoryanalysis/{id}/` | Patch Laboratoryanalysis | Settings: Items | 300/min |
| `DELETE` | `/laboratoryanalysis/{id}/` | Delete Laboratoryanalysis | Settings: Items | 300/min |
| `GET` | `/laboratoryanalysisgroup/{id}/` | Get Laboratoryanalysisgroup | Settings: Items | 300/min |
| `PUT` | `/laboratoryanalysisgroup/{id}/` | Update Laboratoryanalysisgroup | Settings: Items | 300/min |
| `PATCH` | `/laboratoryanalysisgroup/{id}/` | Patch Laboratoryanalysisgroup | Settings: Items | 300/min |
| `DELETE` | `/laboratoryanalysisgroup/{id}/` | Delete Laboratoryanalysisgroup | Settings: Items | 300/min |
| `GET` | `/laboratoryanalysispanel/{id}/` | Get Laboratoryanalysispanel | Settings: Items | 300/min |
| `PUT` | `/laboratoryanalysispanel/{id}/` | Update Laboratoryanalysispanel | Settings: Items | 300/min |
| `PATCH` | `/laboratoryanalysispanel/{id}/` | Patch Laboratoryanalysispanel | Settings: Items | 300/min |
| `DELETE` | `/laboratoryanalysispanel/{id}/` | Delete Laboratoryanalysispanel | Settings: Items | 300/min |

#### Modality

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/modality/` | List Modality | Settings: Integration settings | 100/min |
| `GET` | `/modality/{id}/` | Get Modality | Settings: Integration settings | 300/min |

#### Organisms

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/organism/` | List Organism | Settings: Items | 100/min |
| `GET` | `/organism/{id}/` | Get Organism | Settings: Items | 300/min |

### Treatment & Care Plans


#### Treatment plans

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/treatmentplan/` | List Treatmentplan | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/treatmentplan/` | Create Treatmentplan | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatmentplanfood/` | List Treatmentplanfood | General: Patients and clients; General: Consultations and its items | 100/min |
| `GET` | `/treatmentplanmedicine/` | List Treatmentplanmedicine | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/treatmentplanmedicine/` | Create Treatmentplanmedicine | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatmentplanprocedure/` | List Treatmentplanprocedure | General: Patients and clients; General: Consultations and its items | 100/min |
| `GET` | `/treatmentplansupply/` | List Treatmentplansupply | General: Patients and clients; General: Consultations and its items | 100/min |
| `GET` | `/treatment_plan/department/` | List Treatment Plan Department | — | 300/min |
| `GET` | `/treatmentplan/{id}/` | Get Treatmentplan | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatmentplanfood/{id}/` | Get Treatmentplanfood | General: Patients and clients; General: Consultations and its items | 300/min |
| `PUT` | `/treatmentplanfood/{id}/` | Update Treatmentplanfood | General: Patients and clients; General: Consultations and its items | 300/min |
| `PATCH` | `/treatmentplanfood/{id}/` | Patch Treatmentplanfood | General: Patients and clients; General: Consultations and its items | 300/min |
| `DELETE` | `/treatmentplanfood/{id}/` | Delete Treatmentplanfood | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatmentplanmedicine/{id}/` | Get Treatmentplanmedicine | General: Patients and clients; General: Consultations and its items | 300/min |
| `PUT` | `/treatmentplanmedicine/{id}/` | Update Treatmentplanmedicine | General: Patients and clients; General: Consultations and its items | 300/min |
| `PATCH` | `/treatmentplanmedicine/{id}/` | Patch Treatmentplanmedicine | General: Patients and clients; General: Consultations and its items | 300/min |
| `DELETE` | `/treatmentplanmedicine/{id}/` | Delete Treatmentplanmedicine | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatmentplanprocedure/{id}/` | Get Treatmentplanprocedure | General: Patients and clients; General: Consultations and its items | 300/min |
| `PUT` | `/treatmentplanprocedure/{id}/` | Update Treatmentplanprocedure | General: Patients and clients; General: Consultations and its items | 300/min |
| `PATCH` | `/treatmentplanprocedure/{id}/` | Patch Treatmentplanprocedure | General: Patients and clients; General: Consultations and its items | 300/min |
| `DELETE` | `/treatmentplanprocedure/{id}/` | Delete Treatmentplanprocedure | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatmentplansupply/{id}/` | Get Treatmentplansupply | General: Patients and clients; General: Consultations and its items | 300/min |
| `PUT` | `/treatmentplansupply/{id}/` | Update Treatmentplansupply | General: Patients and clients; General: Consultations and its items | 300/min |
| `PATCH` | `/treatmentplansupply/{id}/` | Patch Treatmentplansupply | General: Patients and clients; General: Consultations and its items | 300/min |
| `DELETE` | `/treatmentplansupply/{id}/` | Delete Treatmentplansupply | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/treatment_plan/department/{id}/` | Get Treatment Plan Department | — | 1200/min |
| `POST` | `/treatmentplanfood/{id}/mark_done/` | Create Treatmentplanfood Mark Done | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/treatmentplanmedicine/{id}/mark_done/` | Create Treatmentplanmedicine Mark Done | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/treatmentplanprocedure/{id}/mark_done/` | Create Treatmentplanprocedure Mark Done | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/treatmentplansupply/{id}/mark_done/` | Create Treatmentplansupply Mark Done | General: Patients and clients; General: Consultations and its items | 100/min |

#### Triages

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/triage/` | List Triage | General: Consultations and its items | 100/min |
| `GET` | `/triage_category/` | List Triage Category | Settings: Department settings | 100/min |
| `GET` | `/triage_entry/` | List Triage Entry | General: Consultations and its items | 100/min |
| `GET` | `/triage/{id}/` | Get Triage | General: Consultations and its items | 300/min |
| `GET` | `/triage_category/{id}/` | Get Triage Category | Settings: Department settings | 300/min |
| `GET` | `/triage_entry/{id}/` | Get Triage Entry | General: Consultations and its items | 300/min |

### Prescriptions & Medicine


#### Electronic prescriptions

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/eprescription/prescription/` | List Eprescription Prescription | General: Patients and clients | 100/min |
| `POST` | `/eprescription/prescription/` | Create Eprescription Prescription | General: Patients and clients | 300/min |
| `GET` | `/eprescription/prescription_item/` | List Eprescription Prescription Item | Settings: Items | 100/min |
| `GET` | `/eprescription/prescription/{id}/` | Get Eprescription Prescription | General: Patients and clients | 300/min |
| `PUT` | `/eprescription/prescription/{id}/` | Update Eprescription Prescription | General: Patients and clients | 300/min |
| `PATCH` | `/eprescription/prescription/{id}/` | Patch Eprescription Prescription | General: Patients and clients | 300/min |
| `GET` | `/eprescription/prescription_item/{id}/` | Get Eprescription Prescription Item | Settings: Items | 300/min |

#### Foods

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/food/` | List Food | Settings: Items | 100/min |
| `POST` | `/food/` | Create Food | Settings: Items | 300/min |
| `GET` | `/food/{id}/` | Get Food | Settings: Items | 300/min |
| `PUT` | `/food/{id}/` | Update Food | Settings: Items | 300/min |
| `PATCH` | `/food/{id}/` | Patch Food | Settings: Items | 300/min |
| `DELETE` | `/food/{id}/` | Delete Food | Settings: Items | 300/min |

#### Medicine

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/medicine/` | List Medicine | Settings: Items | 100/min |
| `POST` | `/medicine/` | Create Medicine | Settings: Items | 300/min |
| `GET` | `/medicine/{id}/` | Get Medicine | Settings: Items | 300/min |
| `PUT` | `/medicine/{id}/` | Update Medicine | Settings: Items | 300/min |
| `PATCH` | `/medicine/{id}/` | Patch Medicine | Settings: Items | 300/min |
| `DELETE` | `/medicine/{id}/` | Delete Medicine | Settings: Items | 300/min |

#### Prescription invoice rows

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/prescriptioninvoicerow/billing/` | List Prescriptioninvoicerow Billing | — | 100/min |
| `POST` | `/prescriptioninvoicerow/billing/` | Create Prescriptioninvoicerow Billing | — | 300/min |
| `GET` | `/prescriptioninvoicerow/billing/errors/` | List Prescriptioninvoicerow Billing Errors | — | 100/min |
| `POST` | `/prescriptioninvoicerow/billing/errors/` | Create Prescriptioninvoicerow Billing Errors | — | 300/min |

#### Supplies

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/supply/` | List Supply | Settings: Items | 100/min |
| `POST` | `/supply/` | Create Supply | Settings: Items | 300/min |
| `GET` | `/supply/{id}/` | Get Supply | Settings: Items | 300/min |
| `PUT` | `/supply/{id}/` | Update Supply | Settings: Items | 300/min |
| `PATCH` | `/supply/{id}/` | Patch Supply | Settings: Items | 300/min |
| `DELETE` | `/supply/{id}/` | Delete Supply | Settings: Items | 300/min |

#### Written prescriptions

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/general_prescription/` | List General Prescription | — | 100/min |
| `GET` | `/general_prescription/medicine_metadata/` | List General Prescription Medicine Metadata | Settings: Items | 100/min |
| `GET` | `/general_prescription/prescription_item/` | List General Prescription Prescription Item | Settings: Items | 100/min |
| `POST` | `/general_prescription/prescription_item/` | Create General Prescription Prescription Item | Settings: Items | 300/min |
| `GET` | `/general_prescription/written_prescription/` | List General Prescription Written Prescription | General: Patients and clients | 100/min |
| `POST` | `/general_prescription/written_prescription/` | Create General Prescription Written Prescription | General: Patients and clients | 300/min |
| `GET` | `/general_prescription/written_prescription_extras/` | List General Prescription Written Prescription Extras | General: Patients and clients | 100/min |
| `POST` | `/general_prescription/written_prescription_extras/` | Create General Prescription Written Prescription Extras | General: Patients and clients | 300/min |
| `GET` | `/general_prescription/medicine_metadata/{id}/` | Get Metadata for General Prescription Medicine | Settings: Items | 300/min |
| `GET` | `/general_prescription/prescription_item/{id}/` | Get General Prescription Prescription Item | Settings: Items | 300/min |
| `DELETE` | `/general_prescription/prescription_item/{id}/` | Delete General Prescription Prescription Item | Settings: Items | 300/min |
| `GET` | `/general_prescription/written_prescription/{id}/` | Get General Prescription Written Prescription | General: Patients and clients | 300/min |
| `PUT` | `/general_prescription/written_prescription/{id}/` | Update General Prescription Written Prescription | General: Patients and clients | 300/min |
| `PATCH` | `/general_prescription/written_prescription/{id}/` | Patch General Prescription Written Prescription | General: Patients and clients | 300/min |
| `DELETE` | `/general_prescription/written_prescription/{id}/` | Delete General Prescription Written Prescription | General: Patients and clients | 300/min |
| `GET` | `/general_prescription/written_prescription_extras/{id}/` | Get General Prescription Written Prescription Extras | General: Patients and clients | 300/min |
| `PUT` | `/general_prescription/written_prescription_extras/{id}/` | Update General Prescription Written Prescription Extras | General: Patients and clients | 300/min |
| `PATCH` | `/general_prescription/written_prescription_extras/{id}/` | Patch General Prescription Written Prescription Extras | General: Patients and clients | 300/min |
| `DELETE` | `/general_prescription/written_prescription_extras/{id}/` | Delete General Prescription Written Prescription Extras | General: Patients and clients | 300/min |

### Invoicing & Payments


#### Counter sales

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/countersale/` | List Countersale | Financial: Invoices | 100/min |
| `POST` | `/countersale/` | Create Countersale | Financial: Invoices | 300/min |
| `GET` | `/countersale/{id}/` | Get Countersale | Financial: Invoices | 300/min |
| `PUT` | `/countersale/{id}/` | Update Countersale | Financial: Invoices | 300/min |
| `PATCH` | `/countersale/{id}/` | Patch Countersale | Financial: Invoices | 300/min |
| `DELETE` | `/countersale/{id}/` | Delete Countersale | Financial: Invoices | 300/min |
| `GET` | `/countersale/{id}/add_item/` | Get Countersale Add Item | Financial: Invoices | 100/min |
| `POST` | `/countersale/{id}/add_item/` | Create Countersale Add Item | Financial: Invoices | 100/min |
| `PUT` | `/countersale/{id}/add_item/` | Update Countersale Add Item | Financial: Invoices | 100/min |
| `POST` | `/countersale/{id}/finalize/` | Create Countersale Finalize | Financial: Invoices | 100/min |
| `PUT` | `/countersale/{id}/finalize/` | Update Countersale Finalize | Financial: Invoices | 100/min |
| `POST` | `/countersale/{id}/invoice_date/` | Create Countersale Invoice Date | Financial: Invoices | 100/min |

#### Estimates

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/estimate/` | List Estimate | Financial: Estimates | 100/min |
| `GET` | `/estimateitem/` | List Estimateitem | Financial: Estimates | 100/min |
| `GET` | `/estimate/{id}/` | Get Estimate | Financial: Estimates | 300/min |
| `GET` | `/estimateitem/{id}/` | Get Estimateitem | Financial: Estimates | 300/min |

#### Invoice payments

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/invoicepayment/` | List Invoicepayment | Financial: Invoices | 100/min |
| `POST` | `/invoicepayment/` | Create Invoicepayment | Financial: Invoices | 300/min |
| `GET` | `/invoicepayment/{id}/` | Get Invoicepayment | Financial: Invoices | 300/min |
| `PUT` | `/invoicepayment/{id}/` | Update Invoicepayment | Financial: Invoices | 300/min |
| `PATCH` | `/invoicepayment/{id}/` | Patch Invoicepayment | Financial: Invoices | 300/min |
| `POST` | `/invoicepayment/{id}/cancel_payment/` | Create Invoicepayment Cancel Payment | Financial: Invoices | 100/min |
| `POST` | `/invoicepayment/{id}/generate_qr_code/` | Create Invoicepayment Generate Qr Code | Financial: Invoices | 100/min |
| `GET` | `/invoicepayment/{parent_lookup_invoice_payment}/extras/` | List Invoicepayment Extras | Financial: Invoices | 100/min |
| `POST` | `/invoicepayment/{parent_lookup_invoice_payment}/extras/` | Create Invoicepayment Extras | Financial: Invoices | 300/min |
| `GET` | `/invoicepayment/{parent_lookup_invoice_payment}/extras/{id}/` | Get Invoicepayment Extras | Financial: Invoices | 300/min |
| `PUT` | `/invoicepayment/{parent_lookup_invoice_payment}/extras/{id}/` | Update Invoicepayment Extras | Financial: Invoices | 300/min |
| `PATCH` | `/invoicepayment/{parent_lookup_invoice_payment}/extras/{id}/` | Patch Invoicepayment Extras | Financial: Invoices | 300/min |
| `DELETE` | `/invoicepayment/{parent_lookup_invoice_payment}/extras/{id}/` | Delete Invoicepayment Extras | Financial: Invoices | 300/min |

#### Invoices

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/invoice/` | List Invoice | Financial: Invoices | 60/min |
| `GET` | `/invoicegroup/` | List Invoicegroup | Settings: Items | 100/min |
| `POST` | `/invoicegroup/` | Create Invoicegroup | Settings: Items | 300/min |
| `GET` | `/invoicerow/` | List Invoicerow | Financial: Invoices | 100/min |
| `GET` | `/invoicerow_vatgroup/` | List Invoicerow Vatgroup | Financial: Invoices | 100/min |
| `GET` | `/invoice/{id}/` | Get Invoice | Financial: Invoices | 250/min |
| `PUT` | `/invoice/{id}/` | Update Invoice | Financial: Invoices | 150/min |
| `PATCH` | `/invoice/{id}/` | Patch Invoice | Financial: Invoices | 150/min |
| `GET` | `/invoicegroup/{id}/` | Get Invoicegroup | Settings: Items | 300/min |
| `PUT` | `/invoicegroup/{id}/` | Update Invoicegroup | Settings: Items | 300/min |
| `PATCH` | `/invoicegroup/{id}/` | Patch Invoicegroup | Settings: Items | 300/min |
| `DELETE` | `/invoicegroup/{id}/` | Delete Invoicegroup | Settings: Items | 300/min |
| `GET` | `/invoicerow/{id}/` | Get Invoicerow | Financial: Invoices | 300/min |
| `GET` | `/invoicerow_vatgroup/{id}/` | Get Invoicerow Vatgroup | Financial: Invoices | 300/min |
| `GET` | `/invoice/{id}/add_item/` | Get Invoice Add Item | Financial: Invoices | 100/min |
| `POST` | `/invoice/{id}/add_item/` | Create Invoice Add Item | Financial: Invoices | 100/min |
| `PUT` | `/invoice/{id}/add_item/` | Update Invoice Add Item | Financial: Invoices | 100/min |
| `POST` | `/invoice/{id}/cloudprnt/` | Create Invoice Cloudprnt | Financial: Invoices | 100/min |
| `GET` | `/invoice/{id}/full_refund/` | Get Invoice Full Refund | Financial: Invoices | 100/min |
| `POST` | `/invoice/{id}/full_refund/` | Create Invoice Full Refund | Financial: Invoices | 100/min |
| `POST` | `/invoice/{id}/generate_qr_code/` | Create Invoice Generate Qr Code | Financial: Invoices | 100/min |
| `POST` | `/invoice/{id}/invoice_date/` | Create Invoice Invoice Date | Financial: Invoices | 100/min |
| `GET` | `/invoice/{id}/partial_refund/` | Get Invoice Partial Refund | Financial: Invoices | 100/min |
| `POST` | `/invoice/{id}/partial_refund/` | Create Invoice Partial Refund | Financial: Invoices | 100/min |
| `GET` | `/invoice/{parent_lookup_invoice}/extras/` | List Invoice Extras | Financial: Invoices | 100/min |
| `POST` | `/invoice/{parent_lookup_invoice}/extras/` | Create Invoice Extras | Financial: Invoices | 300/min |
| `GET` | `/invoice/{parent_lookup_invoice}/pdf/` | Get Invoice Pdf | Financial: Invoices | 100/min |
| `GET` | `/invoicerow/{parent_lookup_invoicerow}/extras/` | List Invoicerow Extras | Financial: Invoices | 100/min |
| `POST` | `/invoicerow/{parent_lookup_invoicerow}/extras/` | Create Invoicerow Extras | Financial: Invoices | 300/min |
| `GET` | `/invoice/{parent_lookup_invoice}/extras/{id}/` | Get Invoice Extras | Financial: Invoices | 300/min |
| `PUT` | `/invoice/{parent_lookup_invoice}/extras/{id}/` | Update Invoice Extras | Financial: Invoices | 300/min |
| `PATCH` | `/invoice/{parent_lookup_invoice}/extras/{id}/` | Patch Invoice Extras | Financial: Invoices | 300/min |
| `DELETE` | `/invoice/{parent_lookup_invoice}/extras/{id}/` | Delete Invoice Extras | Financial: Invoices | 300/min |
| `GET` | `/invoicerow/{parent_lookup_invoicerow}/extras/{id}/` | Get Invoicerow Extras | Financial: Invoices | 300/min |
| `PUT` | `/invoicerow/{parent_lookup_invoicerow}/extras/{id}/` | Update Invoicerow Extras | Financial: Invoices | 300/min |
| `PATCH` | `/invoicerow/{parent_lookup_invoicerow}/extras/{id}/` | Patch Invoicerow Extras | Financial: Invoices | 300/min |
| `DELETE` | `/invoicerow/{parent_lookup_invoicerow}/extras/{id}/` | Delete Invoicerow Extras | Financial: Invoices | 300/min |

#### POS transaction results

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/postransactionresult/` | List Postransactionresult | Financial: Invoices | 100/min |
| `POST` | `/postransactionresult/` | Create Postransactionresult | Financial: Invoices | 300/min |
| `GET` | `/postransactionresult/{id}/` | Get Postransactionresult | Financial: Invoices | 300/min |

#### Payment cards

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/paymentcard/` | Create Paymentcard | Financial: Invoices | 300/min |

#### Payment methods

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/paymentmethod/` | List Paymentmethod | Settings: Settings page | 100/min |
| `GET` | `/paymentmethod/{id}/` | Get Paymentmethod | Settings: Settings page | 300/min |

#### Pos transactions

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/postransaction/` | Get Postransaction | Financial: Invoices | 100/min |
| `POST` | `/postransaction/` | Create Postransaction | Financial: Invoices | 300/min |
| `GET` | `/postransaction/{id}/` | Get Postransaction | Financial: Invoices | 300/min |
| `DELETE` | `/postransaction/{id}/` | Delete Postransaction | Financial: Invoices | 300/min |

#### Unallocated payments

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/unallocatedpayment/` | List Unallocatedpayment | Financial: Invoices | 200/min |
| `POST` | `/unallocatedpayment/` | Create Unallocatedpayment | Financial: Invoices | 300/min |
| `GET` | `/unallocatedpayment/{id}/` | Get Unallocatedpayment | Financial: Invoices | 800/min |
| `POST` | `/unallocatedpayment/{id}/cancel/` | Create Unallocatedpayment Cancel | Financial: Invoices | 100/min |
| `GET` | `/unallocatedpayment/{parent_lookup_prepayment}/external_info/` | List Unallocatedpayment External Info | Financial: Invoices | 100/min |
| `POST` | `/unallocatedpayment/{parent_lookup_prepayment}/external_info/` | Create Unallocatedpayment External Info | Financial: Invoices | 300/min |
| `GET` | `/unallocatedpayment/{parent_lookup_prepayment}/external_info/{id}/` | Get Unallocatedpayment External Info | Financial: Invoices | 300/min |
| `PUT` | `/unallocatedpayment/{parent_lookup_prepayment}/external_info/{id}/` | Update Unallocatedpayment External Info | Financial: Invoices | 300/min |
| `PATCH` | `/unallocatedpayment/{parent_lookup_prepayment}/external_info/{id}/` | Patch Unallocatedpayment External Info | Financial: Invoices | 300/min |
| `DELETE` | `/unallocatedpayment/{parent_lookup_prepayment}/external_info/{id}/` | Delete Unallocatedpayment External Info | Financial: Invoices | 300/min |

### Accounting & Finance


#### Account numbers

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/accountnumber/` | List Accountnumber | Financial: Invoices | 100/min |
| `GET` | `/accountnumber/{id}/` | Get Accountnumber | Financial: Invoices | 300/min |

#### Accounting reports

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/accountingreport/` | List Accountingreport | Financial: End of day and accounting reports | 100/min |
| `GET` | `/accountingreport/{id}/` | Get Accountingreport | Financial: End of day and accounting reports | 300/min |

#### End of day reports

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/endofdayreport/` | List Endofdayreport | Financial: End of day and accounting reports | 100/min |
| `GET` | `/endofdayreport/{id}/` | Get Endofdayreport | Financial: End of day and accounting reports | 300/min |

#### Journal entries

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/journal_entry/` | List Journal Entry | Financial: Invoices | 100/min |
| `GET` | `/journal_entry/{id}/` | Get Journal Entry | Financial: Invoices | 300/min |
| `POST` | `/journal_entry/{id}/tag_entry/` | Create Journal Entry Tag Entry | Financial: Invoices | 100/min |

#### Journal entry problems

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/journal_entry_problem/` | List Journal Entry Problem | Financial: Invoices | 100/min |
| `GET` | `/journal_entry_problem/{id}/` | Get Journal Entry Problem | Financial: Invoices | 300/min |
| `POST` | `/journal_entry_problem/{id}/tag_entry/` | Create Journal Entry Problem Tag Entry | Financial: Invoices | 100/min |

#### Journal entry report logs

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/journal_report_log/` | List Journal Report Log | Financial: Invoices | 100/min |
| `GET` | `/journal_report_log/{id}/` | Get Journal Report Log | Financial: Invoices | 300/min |
| `DELETE` | `/journal_report_log/{id}/` | Delete Journal Report Log | Financial: Invoices | 300/min |

#### Journal transaction problems

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/journal_transaction_problem/` | List Journal Transaction Problem | Financial: Invoices | 100/min |
| `GET` | `/journal_transaction_problem/{id}/` | Get Journal Transaction Problem | Financial: Invoices | 300/min |
| `POST` | `/journal_transaction_problem/{id}/tag_transaction/` | Create Journal Transaction Problem Tag Transaction | Financial: Invoices | 100/min |

#### Journal transactions

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/journal_transaction/` | List Journal Transaction | Financial: Invoices | 100/min |
| `GET` | `/journal_transaction/{id}/` | Get Journal Transaction | Financial: Invoices | 300/min |
| `POST` | `/journal_transaction/{id}/tag_transaction/` | Create Journal Transaction Tag Transaction | Financial: Invoices | 100/min |

#### Payment type accounting numbers

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/paymenttypeaccountingnumbers/` | Get Paymenttypeaccountingnumbers | Financial: End of day and accounting reports | 100/min |

#### Tag journal entries

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/tag_journal_entries/` | Create Tag Journal Entries | Financial: Invoices | 300/min |

#### Tag journal entry problems

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/tag_journal_entry_problems/` | Create Tag Journal Entry Problems | Financial: Invoices | 300/min |

#### VAT groups

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/vatgroup/` | List Vatgroup | — | 100/min |
| `GET` | `/vatgroup/{id}/` | Get Vatgroup | — | 300/min |

### Insurance & Health Plans


#### Health plans

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/healthplan/` | List Healthplan | Settings: Health plan settings | 100/min |
| `POST` | `/healthplan/` | Create Healthplan | Settings: Health plan settings | 300/min |
| `GET` | `/healthplanitem/` | List Healthplanitem | Settings: Health plan settings | 100/min |
| `POST` | `/healthplanitem/` | Create Healthplanitem | Settings: Health plan settings | 300/min |
| `GET` | `/healthplanitemgroup/` | List Healthplanitemgroup | Settings: Health plan settings | 100/min |
| `POST` | `/healthplanitemgroup/` | Create Healthplanitemgroup | Settings: Health plan settings | 300/min |
| `GET` | `/healthplan/{id}/` | Get Healthplan | Settings: Health plan settings | 300/min |
| `PUT` | `/healthplan/{id}/` | Update Healthplan | Settings: Health plan settings | 300/min |
| `PATCH` | `/healthplan/{id}/` | Patch Healthplan | Settings: Health plan settings | 300/min |
| `GET` | `/healthplanitem/{id}/` | Get Healthplanitem | Settings: Health plan settings | 300/min |
| `PUT` | `/healthplanitem/{id}/` | Update Healthplanitem | Settings: Health plan settings | 300/min |
| `PATCH` | `/healthplanitem/{id}/` | Patch Healthplanitem | Settings: Health plan settings | 300/min |
| `GET` | `/healthplanitemgroup/{id}/` | Get Healthplanitemgroup | Settings: Health plan settings | 300/min |
| `PUT` | `/healthplanitemgroup/{id}/` | Update Healthplanitemgroup | Settings: Health plan settings | 300/min |
| `PATCH` | `/healthplanitemgroup/{id}/` | Patch Healthplanitemgroup | Settings: Health plan settings | 300/min |

#### Insurance claims

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/insuranceclaim/` | List Insuranceclaim | Financial: Insurance claims | 100/min |
| `GET` | `/insuranceclaimclient/` | List Insuranceclaimclient | Financial: Insurance claims | 100/min |
| `GET` | `/insuranceclaimpatient/` | List Insuranceclaimpatient | Financial: Insurance claims | 100/min |
| `GET` | `/insuranceclaim/{id}/` | Get Insuranceclaim | Financial: Insurance claims | 300/min |
| `PUT` | `/insuranceclaim/{id}/` | Update Insuranceclaim | Financial: Insurance claims | 300/min |
| `PATCH` | `/insuranceclaim/{id}/` | Patch Insuranceclaim | Financial: Insurance claims | 300/min |
| `GET` | `/insuranceclaimclient/{id}/` | Get Insuranceclaimclient | Financial: Insurance claims | 300/min |
| `GET` | `/insuranceclaimpatient/{id}/` | Get Insuranceclaimpatient | Financial: Insurance claims | 300/min |

#### Patient health plans

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/patienthealthplan/` | List Patienthealthplan | General: Patients and clients | 100/min |
| `POST` | `/patienthealthplan/` | Create Patienthealthplan | General: Patients and clients | 300/min |
| `GET` | `/patienthealthplanitem/` | List Patienthealthplanitem | General: Patients and clients | 100/min |
| `GET` | `/patienthealthplanitemgroup/` | List Patienthealthplanitemgroup | General: Patients and clients | 100/min |
| `GET` | `/patienthealthplan/{id}/` | Get Patienthealthplan | General: Patients and clients | 300/min |
| `PUT` | `/patienthealthplan/{id}/` | Update Patienthealthplan | General: Patients and clients | 300/min |
| `PATCH` | `/patienthealthplan/{id}/` | Patch Patienthealthplan | General: Patients and clients | 300/min |
| `GET` | `/patienthealthplanitem/{id}/` | Get Patienthealthplanitem | General: Patients and clients | 300/min |
| `GET` | `/patienthealthplanitemgroup/{id}/` | Get Patienthealthplanitemgroup | General: Patients and clients | 300/min |
| `POST` | `/patienthealthplan/{id}/create_upcoming/` | Create Patienthealthplan Create Upcoming | General: Patients and clients | 100/min |
| `POST` | `/patienthealthplan/{id}/process_payment/` | Create Patienthealthplan Process Payment | General: Patients and clients | 400/min |
| `POST` | `/patienthealthplan/{id}/update_status/` | Create Patienthealthplan Update Status | General: Patients and clients | 100/min |
| `POST` | `/patienthealthplanitem/{id}/mark_used/` | Create Patienthealthplanitem Mark Used | General: Patients and clients | 100/min |
| `PUT` | `/patienthealthplanitem/{id}/mark_used/` | Update Patienthealthplanitem Mark Used | General: Patients and clients | 100/min |
| `POST` | `/patienthealthplanitemgroup/{id}/set_used_item_quantity/` | Create Patienthealthplanitemgroup Set Used Item Quantity | General: Patients and clients | 100/min |
| `PUT` | `/patienthealthplanitemgroup/{id}/set_used_item_quantity/` | Update Patienthealthplanitemgroup Set Used Item Quantity | General: Patients and clients | 100/min |

### Inventory & Products


#### Bundle in bundle

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/itemtemplate_in_template/` | List Itemtemplate In Template | Settings: Templates | 100/min |
| `POST` | `/itemtemplate_in_template/` | Create Itemtemplate In Template | Settings: Templates | 300/min |
| `GET` | `/itemtemplate_in_template/{id}/` | Get Itemtemplate In Template | Settings: Templates | 300/min |
| `DELETE` | `/itemtemplate_in_template/{id}/` | Delete Itemtemplate In Template | Settings: Templates | 300/min |

#### Bundles (Item templates)

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/itemtemplate/` | List Itemtemplate | Settings: Templates | 100/min |
| `POST` | `/itemtemplate/` | Create Itemtemplate | Settings: Templates | 300/min |
| `GET` | `/itemtemplateitem/` | List Itemtemplateitem | Settings: Templates | 100/min |
| `POST` | `/itemtemplateitem/` | Create Itemtemplateitem | Settings: Templates | 300/min |
| `GET` | `/itemtemplate/{id}/` | Get Itemtemplate | Settings: Templates | 300/min |
| `PUT` | `/itemtemplate/{id}/` | Update Itemtemplate | Settings: Templates | 300/min |
| `PATCH` | `/itemtemplate/{id}/` | Patch Itemtemplate | Settings: Templates | 300/min |
| `DELETE` | `/itemtemplate/{id}/` | Delete Itemtemplate | Settings: Templates | 300/min |
| `GET` | `/itemtemplateitem/{id}/` | Get Itemtemplateitem | Settings: Templates | 300/min |
| `PUT` | `/itemtemplateitem/{id}/` | Update Itemtemplateitem | Settings: Templates | 300/min |
| `PATCH` | `/itemtemplateitem/{id}/` | Patch Itemtemplateitem | Settings: Templates | 300/min |
| `DELETE` | `/itemtemplateitem/{id}/` | Delete Itemtemplateitem | Settings: Templates | 300/min |

#### Item lists

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/itemlist/` | List Itemlist | Settings: Items | 100/min |
| `POST` | `/itemlist/` | Create Itemlist | Settings: Items | 300/min |
| `GET` | `/itemlist/{id}/` | Get Itemlist | Settings: Items | 300/min |
| `PUT` | `/itemlist/{id}/` | Update Itemlist | Settings: Items | 300/min |
| `PATCH` | `/itemlist/{id}/` | Patch Itemlist | Settings: Items | 300/min |

#### Item size descriptions

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/item_size_descriptions/` | Get Item Size Descriptions | Settings: Items | 100/min |

#### Item subgroups

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/itemsubgroup/` | List Itemsubgroup | Settings: Items | 100/min |
| `POST` | `/itemsubgroup/` | Create Itemsubgroup | Settings: Items | 300/min |
| `GET` | `/itemsubgroup/{id}/` | Get Itemsubgroup | Settings: Items | 300/min |
| `PUT` | `/itemsubgroup/{id}/` | Update Itemsubgroup | Settings: Items | 300/min |
| `PATCH` | `/itemsubgroup/{id}/` | Patch Itemsubgroup | Settings: Items | 300/min |
| `DELETE` | `/itemsubgroup/{id}/` | Delete Itemsubgroup | Settings: Items | 300/min |

#### Items

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/item/` | List Item | Settings: Items | 100/min |
| `GET` | `/item/{id}/` | Get Item | Settings: Items | 300/min |
| `PUT` | `/item/{id}/` | Update Item | Settings: Items | 300/min |
| `PATCH` | `/item/{id}/` | Patch Item | Settings: Items | 300/min |
| `POST` | `/item/bulk/upsert/` | Create Item Bulk Upsert | Settings: Items | 300/min |
| `POST` | `/item/{id}/add_batch_to_stock/` | Create Item Add Batch To Stock | Settings: Items | 100/min |
| `POST` | `/item/{id}/create_new_finalized_invoice_and_prepayments/` | Create Item Create New Finalized Invoice And Prepayments | Settings: Items | 100/min |
| `POST` | `/item/{id}/update_stock_level/` | Create Item Update Stock Level | Settings: Items | 100/min |

#### Orphan items

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/orphan_item/` | List Orphan Item | Settings: Items | 100/min |
| `POST` | `/orphan_item/` | Create Orphan Item | Settings: Items | 300/min |
| `GET` | `/orphan_item/{id}/` | Get Orphan Item | Settings: Items | 300/min |

#### Product orders

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/order/` | List Order | Settings: Stock | 100/min |
| `POST` | `/order/` | Create Order | Settings: Stock | 300/min |
| `GET` | `/orderitem/` | List Orderitem | Settings: Stock | 100/min |
| `POST` | `/orderitem/` | Create Orderitem | Settings: Stock | 300/min |
| `GET` | `/order/{id}/` | Get Order | Settings: Stock | 300/min |
| `PUT` | `/order/{id}/` | Update Order | Settings: Stock | 300/min |
| `PATCH` | `/order/{id}/` | Patch Order | Settings: Stock | 300/min |
| `GET` | `/orderitem/{id}/` | Get Orderitem | Settings: Stock | 300/min |
| `PUT` | `/orderitem/{id}/` | Update Orderitem | Settings: Stock | 300/min |
| `PATCH` | `/orderitem/{id}/` | Patch Orderitem | Settings: Stock | 300/min |
| `DELETE` | `/orderitem/{id}/` | Delete Orderitem | Settings: Stock | 300/min |
| `POST` | `/order/{id}/mark_delivered/` | Create Order Mark Delivered | Settings: Stock | 100/min |
| `POST` | `/order/{id}/set_wholesaler_reference_number/` | Create Order Set Wholesaler Reference Number | Settings: Stock | 100/min |
| `POST` | `/orderitem/{id}/add_to_stock/` | Create Orderitem Add To Stock | Settings: Stock; Settings: Product orders / purchase invoices | 100/min |

#### Stock

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/stock/batch/` | List Stock Batch | Settings: Stock | 100/min |
| `POST` | `/stock/batch/` | Create Stock Batch | Settings: Stock | 300/min |
| `GET` | `/stock/entry/` | List Stock Entry | Settings: Stock | 100/min |
| `POST` | `/stock/entry/` | Create Stock Entry | Settings: Stock | 300/min |
| `GET` | `/stock/item/` | List Stock Item | Settings: Stock | 100/min |
| `POST` | `/stock/item/` | Create Stock Item | Settings: Stock | 300/min |
| `GET` | `/stock/location/` | List Stock Location | Settings: Stock | 100/min |
| `GET` | `/stock/locationalertlevel/` | List Stock Locationalertlevel | Settings: Items | 100/min |
| `POST` | `/stock/locationalertlevel/` | Create Stock Locationalertlevel | Settings: Items | 300/min |
| `GET` | `/stock/batch/{id}/` | Get Stock Batch | Settings: Stock | 300/min |
| `PUT` | `/stock/batch/{id}/` | Update Stock Batch | Settings: Stock | 300/min |
| `PATCH` | `/stock/batch/{id}/` | Patch Stock Batch | Settings: Stock | 300/min |
| `DELETE` | `/stock/batch/{id}/` | Delete Stock Batch | Settings: Stock | 300/min |
| `GET` | `/stock/entry/{id}/` | Get Stock Entry | Settings: Stock | 300/min |
| `GET` | `/stock/item/{id}/` | Get Stock Item | Settings: Stock | 300/min |
| `GET` | `/stock/location/{id}/` | Get Stock Location | Settings: Stock | 300/min |
| `GET` | `/stock/locationalertlevel/{id}/` | Get Stock Locationalertlevel | Settings: Items | 300/min |
| `PUT` | `/stock/locationalertlevel/{id}/` | Update Stock Locationalertlevel | Settings: Items | 300/min |
| `PATCH` | `/stock/locationalertlevel/{id}/` | Patch Stock Locationalertlevel | Settings: Items | 300/min |
| `DELETE` | `/stock/locationalertlevel/{id}/` | Delete Stock Locationalertlevel | Settings: Items | 300/min |
| `GET` | `/stock/item/{id}/inventory/` | Get Stock Item Inventory | Settings: Stock | 100/min |
| `POST` | `/stock/item/{id}/inventory/` | Create Stock Item Inventory | Settings: Stock | 100/min |

#### Stock levels

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/stocklevel/` | List Stocklevel | Settings: Stock | 100/min |
| `POST` | `/stocklevel/` | Create Stocklevel | Settings: Stock | 300/min |
| `GET` | `/stocklevel/{id}/` | Get Stocklevel | Settings: Stock | 300/min |
| `GET` | `/stocklevel/{id}/inventory/` | Get Stocklevel Inventory | Settings: Stock | 100/min |
| `POST` | `/stocklevel/{id}/inventory/` | Create Stocklevel Inventory | Settings: Stock | 100/min |

### Pricing & Discounts


#### Alternative pricings

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/alternativepricing/` | List Alternativepricing | Settings: Items | 100/min |
| `POST` | `/alternativepricing/` | Create Alternativepricing | Settings: Items | 300/min |
| `GET` | `/alternativepricing/{id}/` | Get Alternativepricing | Settings: Items | 300/min |
| `PUT` | `/alternativepricing/{id}/` | Update Alternativepricing | Settings: Items | 300/min |
| `PATCH` | `/alternativepricing/{id}/` | Patch Alternativepricing | Settings: Items | 300/min |
| `DELETE` | `/alternativepricing/{id}/` | Delete Alternativepricing | Settings: Items | 300/min |

#### Discount schemes

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/discountscheme/` | List Discountscheme | Settings: Discount settings | 100/min |
| `POST` | `/discountscheme/` | Create Discountscheme | Settings: Discount settings | 300/min |
| `GET` | `/discountscheme_bulk_discounts/` | List Discountscheme Bulk Discounts | Settings: Discount settings | 100/min |
| `GET` | `/discountscheme_item/` | List Discountscheme Item | Settings: Discount settings | 100/min |
| `GET` | `/discountscheme_target/` | List Discountscheme Target | Settings: Discount settings | 100/min |
| `GET` | `/discountscheme_time/` | List Discountscheme Time | Settings: Discount settings | 100/min |
| `GET` | `/discountscheme/{id}/` | Get Discountscheme | Settings: Discount settings | 300/min |
| `PUT` | `/discountscheme/{id}/` | Update Discountscheme | Settings: Discount settings | 300/min |
| `PATCH` | `/discountscheme/{id}/` | Patch Discountscheme | Settings: Discount settings | 300/min |
| `DELETE` | `/discountscheme/{id}/` | Delete Discountscheme | Settings: Discount settings | 300/min |
| `GET` | `/discountscheme_bulk_discounts/{id}/` | Get Discountscheme Bulk Discounts | Settings: Discount settings | 300/min |
| `GET` | `/discountscheme_item/{id}/` | Get Discountscheme Item | Settings: Discount settings | 300/min |
| `GET` | `/discountscheme_target/{id}/` | Get Discountscheme Target | Settings: Discount settings | 300/min |
| `GET` | `/discountscheme_time/{id}/` | Get Discountscheme Time | Settings: Discount settings | 300/min |

### Patient Referrals


#### Patient referrals

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/patient_referral/` | List Patient Referral | Patient referrals: Patient referrals | 100/min |
| `POST` | `/patient_referral/` | Create Patient Referral | Patient referrals: Patient referrals | 300/min |
| `GET` | `/patient_referral_feedback/` | List Patient Referral Feedback | Patient referrals: Patient referrals | 100/min |
| `GET` | `/patient_referral/{id}/` | Get Patient Referral | Patient referrals: Patient referrals | 300/min |
| `PUT` | `/patient_referral/{id}/` | Update Patient Referral | Patient referrals: Patient referrals | 300/min |
| `PATCH` | `/patient_referral/{id}/` | Patch Patient Referral | Patient referrals: Patient referrals | 300/min |
| `DELETE` | `/patient_referral/{id}/` | Delete Patient Referral | Patient referrals: Patient referrals | 300/min |
| `GET` | `/patient_referral_feedback/{id}/` | Get Patient Referral Feedback | Patient referrals: Patient referrals | 300/min |
| `GET` | `/patient_referral_feedback/{parent_lookup_referral_feedback}/attachment/` | List Patient Referral Feedback Attachment | Patient referrals: Patient referrals | 100/min |
| `GET` | `/patient_referral_feedback/{parent_lookup_referral_feedback}/attachment/{id}/` | Get Patient Referral Feedback Attachment | Patient referrals: Patient referrals | 300/min |

#### Referral internal status

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/referralinternalstatus/` | List Referralinternalstatus | Settings: Department settings | 100/min |
| `GET` | `/referralinternalstatus/{id}/` | Get Referralinternalstatus | Settings: Department settings | 300/min |

#### Referrers

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/referrer/` | List Referrer | Patient referrals: Patient referrals | 100/min |
| `POST` | `/referrer/` | Create Referrer | Patient referrals: Patient referrals | 300/min |
| `GET` | `/referrer/{id}/` | Get Referrer | Patient referrals: Patient referrals | 300/min |
| `PUT` | `/referrer/{id}/` | Update Referrer | Patient referrals: Patient referrals | 300/min |
| `PATCH` | `/referrer/{id}/` | Patch Referrer | Patient referrals: Patient referrals | 300/min |
| `DELETE` | `/referrer/{id}/` | Delete Referrer | Patient referrals: Patient referrals | 300/min |

### Organization & Settings


#### Content types

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/contenttype/` | List Contenttype | — | 100/min |
| `GET` | `/contenttype/{id}/` | Get Contenttype | — | 300/min |

#### Departments

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/department/` | List Department | — | 300/min |
| `GET` | `/departmentgroup/` | List Departmentgroup | — | 100/min |
| `GET` | `/department/{id}/` | Get Department | — | 1200/min |
| `GET` | `/departmentgroup/{id}/` | Get Departmentgroup | — | 300/min |
| `GET` | `/department/{parent_lookup_department}/mobileapp_settings/` | List Department Mobileapp Settings | Profile: Login credentials to Provet mobile app | 100/min |
| `GET` | `/department/{parent_lookup_department}/patient_location/` | List Department Patient Location | Settings: Department settings | 100/min |
| `POST` | `/department/{parent_lookup_department}/patient_location/` | Create Department Patient Location | Settings: Department settings | 300/min |
| `GET` | `/department/{parent_lookup_department}/settings/` | List Department Settings | Settings: Department settings | 100/min |
| `GET` | `/department/{parent_lookup_department}/team/` | List Department Team | Settings: Department settings | 100/min |
| `POST` | `/department/{parent_lookup_department}/team/` | Create Department Team | Settings: Department settings | 300/min |
| `GET` | `/department/{parent_lookup_department}/ward/` | List Department Ward | Settings: Department settings | 100/min |
| `POST` | `/department/{parent_lookup_department}/ward/` | Create Department Ward | Settings: Department settings | 300/min |
| `PUT` | `/department/{parent_lookup_department}/mobileapp_settings/logo/` | Update Department Mobileapp Settings Logo | Profile: Login credentials to Provet mobile app | 100/min |
| `DELETE` | `/department/{parent_lookup_department}/mobileapp_settings/logo/` | Delete Department Mobileapp Settings Logo | Profile: Login credentials to Provet mobile app | 100/min |
| `GET` | `/department/{parent_lookup_department}/patient_location/{id}/` | Get Department Patient Location | Settings: Department settings | 300/min |
| `PUT` | `/department/{parent_lookup_department}/patient_location/{id}/` | Update Department Patient Location | Settings: Department settings | 300/min |
| `PATCH` | `/department/{parent_lookup_department}/patient_location/{id}/` | Patch Department Patient Location | Settings: Department settings | 300/min |
| `DELETE` | `/department/{parent_lookup_department}/patient_location/{id}/` | Delete Department Patient Location | Settings: Department settings | 300/min |
| `PUT` | `/department/{parent_lookup_department}/settings/logo/` | Update Department Settings Logo | Settings: Department settings | 100/min |
| `DELETE` | `/department/{parent_lookup_department}/settings/logo/` | Delete Department Settings Logo | Settings: Department settings | 100/min |
| `GET` | `/department/{parent_lookup_department}/team/{id}/` | Get Department Team | Settings: Department settings | 300/min |
| `PUT` | `/department/{parent_lookup_department}/team/{id}/` | Update Department Team | Settings: Department settings | 300/min |
| `PATCH` | `/department/{parent_lookup_department}/team/{id}/` | Patch Department Team | Settings: Department settings | 300/min |
| `DELETE` | `/department/{parent_lookup_department}/team/{id}/` | Delete Department Team | Settings: Department settings | 300/min |
| `GET` | `/department/{parent_lookup_department}/ward/{id}/` | Get Department Ward | Settings: Department settings | 300/min |
| `PUT` | `/department/{parent_lookup_department}/ward/{id}/` | Update Department Ward | Settings: Department settings | 300/min |
| `PATCH` | `/department/{parent_lookup_department}/ward/{id}/` | Patch Department Ward | Settings: Department settings | 300/min |
| `DELETE` | `/department/{parent_lookup_department}/ward/{id}/` | Delete Department Ward | Settings: Department settings | 300/min |

#### Holding place numbers

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/holdingplacenumbers/` | List Holdingplacenumbers | General: Consultations and its items | 100/min |
| `POST` | `/holdingplacenumbers/` | Create Holdingplacenumbers | General: Consultations and its items | 300/min |
| `GET` | `/holdingplacenumbers/{id}/` | Get Holdingplacenumbers | General: Consultations and its items | 300/min |
| `PUT` | `/holdingplacenumbers/{id}/` | Update Holdingplacenumbers | General: Consultations and its items | 300/min |
| `PATCH` | `/holdingplacenumbers/{id}/` | Patch Holdingplacenumbers | General: Consultations and its items | 300/min |
| `DELETE` | `/holdingplacenumbers/{id}/` | Delete Holdingplacenumbers | General: Consultations and its items | 300/min |

#### Personnel groups

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/personnel_group/` | List Personnel Group | — | 100/min |
| `POST` | `/personnel_group/` | Create Personnel Group | — | 300/min |
| `GET` | `/personnel_group/{id}/` | Get Personnel Group | — | 300/min |
| `PUT` | `/personnel_group/{id}/` | Update Personnel Group | — | 300/min |
| `PATCH` | `/personnel_group/{id}/` | Patch Personnel Group | — | 300/min |

#### Wholesalers

Clinic-side management of the wholesalers an organization buys from: creating them, maintaining their credentials and per-location overrides, and archiving them. Uses the general `restapi` scope.

If you are building a wholesaler integration rather than managing a clinic's wholesaler list, see [Wholesaler API](#tag/wholesaler-api) and the [Wholesaler Integrations guide](https://developers.provetcloud.com/restapi/howto_wholesalers.html).

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/wholesaler/` | List Wholesaler | Settings: Stock | 100/min |
| `POST` | `/wholesaler/` | Create Wholesaler | Settings: Stock | 300/min |
| `GET` | `/wholesaler/available_for_connect/` | Get Wholesaler Available For Connect | Settings: Stock | 100/min |
| `GET` | `/wholesaler/{id}/` | Get Wholesaler | Settings: Stock | 300/min |
| `PUT` | `/wholesaler/{id}/` | Update Wholesaler | Settings: Stock | 300/min |
| `PATCH` | `/wholesaler/{id}/` | Patch Wholesaler | Settings: Stock | 300/min |
| `DELETE` | `/wholesaler/{id}/` | Delete Wholesaler | Settings: Stock | 300/min |

### Users & Permissions


#### Users

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/user/` | List User | Profile: User profile page | 100/min |
| `POST` | `/user/` | Create User | Profile: User profile page | 300/min |
| `GET` | `/userdetails/` | List Userdetails | Profile: User profile page | 100/min |
| `POST` | `/userdetails/` | Create Userdetails | Profile: User profile page | 300/min |
| `GET` | `/usergroup/` | List Usergroup | Profile: User profile page | 100/min |
| `GET` | `/user/{id}/` | Get User | Profile: User profile page | 300/min |
| `PUT` | `/user/{id}/` | Update User | Profile: User profile page | 300/min |
| `PATCH` | `/user/{id}/` | Patch User | Profile: User profile page | 300/min |
| `GET` | `/userdetails/{id}/` | Get Userdetails | Profile: User profile page | 300/min |
| `PUT` | `/userdetails/{id}/` | Update Userdetails | Profile: User profile page | 300/min |
| `PATCH` | `/userdetails/{id}/` | Patch Userdetails | Profile: User profile page | 300/min |
| `DELETE` | `/userdetails/{id}/` | Delete Userdetails | Profile: User profile page | 300/min |
| `GET` | `/usergroup/{id}/` | Get Usergroup | Profile: User profile page | 300/min |
| `GET` | `/user/current/active_permissions/` | Get User Current Active Permissions | Profile: User profile page | 100/min |
| `GET` | `/user/{parent_lookup_user}/department_permissions/` | List User Department Permissions | Profile: Create / edit users through API | 100/min |
| `POST` | `/user/{parent_lookup_user}/department_permissions/` | Create User Department Permissions | Profile: Create / edit users through API | 300/min |
| `GET` | `/user/{parent_lookup_user}/department_permissions/{id}/` | Get User Department Permissions | Profile: Create / edit users through API | 300/min |
| `PUT` | `/user/{parent_lookup_user}/department_permissions/{id}/` | Update User Department Permissions | Profile: Create / edit users through API | 300/min |
| `PATCH` | `/user/{parent_lookup_user}/department_permissions/{id}/` | Patch User Department Permissions | Profile: Create / edit users through API | 300/min |
| `DELETE` | `/user/{parent_lookup_user}/department_permissions/{id}/` | Delete User Department Permissions | Profile: Create / edit users through API | 300/min |

### Tags & Organization


#### Tags

Create and manage tags for organizing clients, patients, invoices, and other resources.

When using these endpoints, remember the difference between a Tag Assignment (`/tag/tag/` endpoints) and a Tag Text (`/tag/tagtext/` endpoints):

* Tag Text is the general representation of a tag. It contains the label information, the list of entity types it can be associated to, and so on.

* Tag Assignment is the association of a Tag Text (the general representation) to an entity.

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/tag/` | Get Tag | — | 100/min |
| `GET` | `/tag/tagtext/` | List Tag Tagtext | Settings: Tags | 100/min |
| `POST` | `/tag/tagtext/` | Create Tag Tagtext | Settings: Tags | 300/min |
| `GET` | `/tag/tagtext/{id}/` | Get Tag Tagtext | Settings: Tags | 300/min |
| `PUT` | `/tag/tagtext/{id}/` | Update Tag Tagtext | Settings: Tags | 300/min |
| `PATCH` | `/tag/tagtext/{id}/` | Patch Tag Tagtext | Settings: Tags | 300/min |
| `DELETE` | `/tag/tagtext/{id}/` | Delete Tag Tagtext | Settings: Tags | 300/min |

### Communications & Reminders


#### Communication preference rows

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/communication_preference_row/` | List Communication Preference Row | Settings: Organization settings | 100/min |
| `POST` | `/communication_preference_row/` | Create Communication Preference Row | Settings: Organization settings | 300/min |
| `GET` | `/communication_preference_row/{id}/` | Get Communication Preference Row | Settings: Organization settings | 300/min |
| `PUT` | `/communication_preference_row/{id}/` | Update Communication Preference Row | Settings: Organization settings | 300/min |
| `PATCH` | `/communication_preference_row/{id}/` | Patch Communication Preference Row | Settings: Organization settings | 300/min |
| `DELETE` | `/communication_preference_row/{id}/` | Delete Communication Preference Row | Settings: Organization settings | 300/min |

#### Reminders

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/reminder/` | List Reminder | General: Reminders | 100/min |
| `POST` | `/reminder/` | Create Reminder | General: Reminders | 300/min |
| `GET` | `/remindertemplate/` | List Remindertemplate | Settings: Reminder settings | 100/min |
| `POST` | `/remindertemplate/` | Create Remindertemplate | Settings: Reminder settings | 300/min |
| `GET` | `/reminder/{id}/` | Get Reminder | General: Reminders | 300/min |
| `PUT` | `/reminder/{id}/` | Update Reminder | General: Reminders | 300/min |
| `PATCH` | `/reminder/{id}/` | Patch Reminder | General: Reminders | 300/min |
| `DELETE` | `/reminder/{id}/` | Delete Reminder | General: Reminders | 300/min |
| `GET` | `/remindertemplate/{id}/` | Get Remindertemplate | Settings: Reminder settings | 300/min |
| `PUT` | `/remindertemplate/{id}/` | Update Remindertemplate | Settings: Reminder settings | 300/min |
| `PATCH` | `/remindertemplate/{id}/` | Patch Remindertemplate | Settings: Reminder settings | 300/min |
| `DELETE` | `/remindertemplate/{id}/` | Delete Remindertemplate | Settings: Reminder settings | 300/min |
| `PUT` | `/reminder/{id}/mark_sent/` | Update Reminder Mark Sent | General: Reminders | 100/min |

#### SMS messages

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/sms/send/` | Create Sms Send | — | 100/min |
| `GET` | `/sms/task_status/` | Get Sms Task Status | — | 100/min |

### Tasks & Notes


#### Note admin

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/noteadmin/` | List Noteadmin | General: Add notes and communication; General: Edit locked notes through API | 50/min |
| `POST` | `/noteadmin/` | Create Noteadmin | General: Add notes and communication; General: Edit locked notes through API | 300/min |
| `GET` | `/noteadmin/{id}/` | Get Noteadmin | General: Add notes and communication; General: Edit locked notes through API | 200/min |
| `PUT` | `/noteadmin/{id}/` | Update Noteadmin | General: Add notes and communication; General: Edit locked notes through API | 600/min |
| `PATCH` | `/noteadmin/{id}/` | Patch Noteadmin | General: Add notes and communication; General: Edit locked notes through API | 600/min |
| `DELETE` | `/noteadmin/{id}/` | Delete Noteadmin | General: Add notes and communication; General: Edit locked notes through API | 300/min |
| `GET` | `/noteadmin/{parent_lookup_note}/upload/` | List Noteadmin Upload | General: Add notes and communication | 100/min |
| `POST` | `/noteadmin/{parent_lookup_note}/upload/` | Create Noteadmin Upload | General: Add notes and communication | 200/min |
| `GET` | `/noteadmin/{parent_lookup_note}/upload/{id}/` | Get Noteadmin Upload | General: Add notes and communication | 300/min |

#### Notes

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/note/` | List Note | General: Add notes and communication | 50/min |
| `POST` | `/note/` | Create Note | General: Add notes and communication | 300/min |
| `GET` | `/note/{id}/` | Get Note | General: Add notes and communication | 200/min |
| `PUT` | `/note/{id}/` | Update Note | General: Add notes and communication | 600/min |
| `PATCH` | `/note/{id}/` | Patch Note | General: Add notes and communication | 600/min |
| `DELETE` | `/note/{id}/` | Delete Note | General: Add notes and communication | 300/min |
| `GET` | `/note/{parent_lookup_note}/upload/` | List Note Upload | General: Add notes and communication | 100/min |
| `POST` | `/note/{parent_lookup_note}/upload/` | Create Note Upload | General: Add notes and communication | 200/min |
| `GET` | `/note/{parent_lookup_note}/upload/{id}/` | Get Note Upload | General: Add notes and communication | 300/min |

#### Tasks

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/task/` | List Task | General: Tasks | 100/min |
| `POST` | `/task/` | Create Task | General: Tasks | 300/min |
| `GET` | `/task/{id}/` | Get Task | General: Tasks | 300/min |
| `PUT` | `/task/{id}/` | Update Task | General: Tasks | 300/min |
| `PATCH` | `/task/{id}/` | Patch Task | General: Tasks | 300/min |
| `DELETE` | `/task/{id}/` | Delete Task | General: Tasks | 300/min |

### Knowledge Base & Templates


#### Knowledge base

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/knowledgebasefile/` | List Knowledgebasefile | — | 100/min |
| `POST` | `/knowledgebasefile/` | Create Knowledgebasefile | — | 300/min |
| `GET` | `/knowledgebasefolder/` | List Knowledgebasefolder | — | 100/min |
| `POST` | `/knowledgebasefolder/` | Create Knowledgebasefolder | — | 300/min |
| `GET` | `/knowledgebaseobject/` | List Knowledgebaseobject | — | 100/min |
| `GET` | `/knowledgebasefile/{id}/` | Get Knowledgebasefile | — | 300/min |
| `PUT` | `/knowledgebasefile/{id}/` | Update Knowledgebasefile | — | 300/min |
| `PATCH` | `/knowledgebasefile/{id}/` | Patch Knowledgebasefile | — | 300/min |
| `DELETE` | `/knowledgebasefile/{id}/` | Delete Knowledgebasefile | — | 300/min |
| `GET` | `/knowledgebasefolder/{id}/` | Get Knowledgebasefolder | — | 300/min |
| `PUT` | `/knowledgebasefolder/{id}/` | Update Knowledgebasefolder | — | 300/min |
| `PATCH` | `/knowledgebasefolder/{id}/` | Patch Knowledgebasefolder | — | 300/min |
| `DELETE` | `/knowledgebasefolder/{id}/` | Delete Knowledgebasefolder | — | 300/min |
| `GET` | `/knowledgebaseobject/{id}/` | Get Knowledgebaseobject | — | 300/min |

#### Text templates

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/text_template/` | List Text Template | Settings: Settings page | 100/min |
| `POST` | `/text_template/` | Create Text Template | Settings: Settings page | 300/min |
| `GET` | `/text_template/{id}/` | Get Text Template | Settings: Settings page | 300/min |
| `PUT` | `/text_template/{id}/` | Update Text Template | Settings: Settings page | 300/min |
| `PATCH` | `/text_template/{id}/` | Patch Text Template | Settings: Settings page | 300/min |

### Lists & Data


#### Codelists

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/codelist/breeds/` | Get Codelist Breeds | — | 100/min |
| `GET` | `/codelist/diagnoses/` | Get Codelist Diagnoses | — | 100/min |
| `GET` | `/codelist/insurancecompanies/` | Get Codelist Insurancecompanies | — | 100/min |
| `GET` | `/codelist/species/` | Get Codelist Species | — | 100/min |
| `GET` | `/codelist/breeds/{id}/` | Get Codelist Breeds | — | 300/min |
| `PATCH` | `/codelist/breeds/{id}/` | Patch Codelist Breeds | — | 300/min |
| `GET` | `/codelist/diagnoses/{id}/` | Get Codelist Diagnoses | — | 300/min |
| `PATCH` | `/codelist/diagnoses/{id}/` | Patch Codelist Diagnoses | — | 300/min |
| `GET` | `/codelist/insurancecompanies/{id}/` | Get Codelist Insurancecompanies | — | 300/min |
| `PATCH` | `/codelist/insurancecompanies/{id}/` | Patch Codelist Insurancecompanies | — | 300/min |
| `GET` | `/codelist/species/{id}/` | Get Codelist Species | — | 300/min |
| `PATCH` | `/codelist/species/{id}/` | Patch Codelist Species | — | 300/min |

#### Custom fields

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/custom_field_values/` | List Custom Field Values | General: Patients and clients | 100/min |
| `POST` | `/custom_field_values/` | Create Custom Field Values | General: Patients and clients | 300/min |
| `GET` | `/custom_fields/` | List Custom Fields | General: Patients and clients | 100/min |
| `GET` | `/custom_field_values/{id}/` | Get Custom Field Values | General: Patients and clients | 300/min |
| `PUT` | `/custom_field_values/{id}/` | Update Custom Field Values | General: Patients and clients | 300/min |
| `PATCH` | `/custom_field_values/{id}/` | Patch Custom Field Values | General: Patients and clients | 300/min |
| `DELETE` | `/custom_field_values/{id}/` | Delete Custom Field Values | General: Patients and clients | 300/min |
| `GET` | `/custom_fields/{id}/` | Get Custom Fields | General: Patients and clients | 300/min |
| `GET` | `/custom_field_values/{parent_lookup_custom_field}/customfieldoption/` | List Custom Field Values Customfieldoption | General: Patients and clients | 100/min |
| `POST` | `/custom_field_values/{parent_lookup_custom_field}/customfieldoption/` | Create Custom Field Values Customfieldoption | General: Patients and clients | 300/min |
| `GET` | `/custom_field_values/{parent_lookup_custom_field}/customfieldoption/{id}/` | Get Custom Field Values Customfieldoption | General: Patients and clients | 300/min |
| `PUT` | `/custom_field_values/{parent_lookup_custom_field}/customfieldoption/{id}/` | Update Custom Field Values Customfieldoption | General: Patients and clients | 300/min |
| `PATCH` | `/custom_field_values/{parent_lookup_custom_field}/customfieldoption/{id}/` | Patch Custom Field Values Customfieldoption | General: Patients and clients | 300/min |
| `DELETE` | `/custom_field_values/{parent_lookup_custom_field}/customfieldoption/{id}/` | Delete Custom Field Values Customfieldoption | General: Patients and clients | 300/min |

#### Imported histories

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/importedhistory/` | List Importedhistory | General: Patients and clients | 100/min |
| `POST` | `/importedhistory/` | Create Importedhistory | General: Patients and clients | 300/min |
| `GET` | `/importedhistory/{id}/` | Get Importedhistory | General: Patients and clients | 300/min |
| `PUT` | `/importedhistory/{id}/` | Update Importedhistory | General: Patients and clients | 300/min |
| `PATCH` | `/importedhistory/{id}/` | Patch Importedhistory | General: Patients and clients | 300/min |
| `DELETE` | `/importedhistory/{id}/` | Delete Importedhistory | General: Patients and clients | 300/min |

#### Lists

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/list/` | List List | Settings: List and list items | 100/min |
| `POST` | `/list/` | Create List | Settings: List and list items | 300/min |
| `GET` | `/listitem/` | List Listitem | Settings: List and list items | 100/min |
| `POST` | `/listitem/` | Create Listitem | Settings: List and list items | 300/min |
| `GET` | `/list/{id}/` | Get List | Settings: List and list items | 300/min |
| `PUT` | `/list/{id}/` | Update List | Settings: List and list items | 300/min |
| `PATCH` | `/list/{id}/` | Patch List | Settings: List and list items | 300/min |
| `DELETE` | `/list/{id}/` | Delete List | Settings: List and list items | 300/min |
| `GET` | `/listitem/{id}/` | Get Listitem | Settings: List and list items | 300/min |
| `PUT` | `/listitem/{id}/` | Update Listitem | Settings: List and list items | 300/min |
| `PATCH` | `/listitem/{id}/` | Patch Listitem | Settings: List and list items | 300/min |

#### Reasons

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/reason/` | List Reason | Settings: Reasons | 100/min |
| `POST` | `/reason/` | Create Reason | Settings: Reasons | 300/min |
| `GET` | `/reason_group/` | List Reason Group | Settings: Reasons | 100/min |
| `POST` | `/reason_group/` | Create Reason Group | Settings: Reasons | 300/min |
| `GET` | `/reason/{id}/` | Get Reason | Settings: Reasons | 300/min |
| `PUT` | `/reason/{id}/` | Update Reason | Settings: Reasons | 300/min |
| `PATCH` | `/reason/{id}/` | Patch Reason | Settings: Reasons | 300/min |
| `DELETE` | `/reason/{id}/` | Delete Reason | Settings: Reasons | 300/min |
| `GET` | `/reason_group/{id}/` | Get Reason Group | Settings: Reasons | 300/min |
| `PUT` | `/reason_group/{id}/` | Update Reason Group | Settings: Reasons | 300/min |
| `PATCH` | `/reason_group/{id}/` | Patch Reason Group | Settings: Reasons | 300/min |
| `DELETE` | `/reason_group/{id}/` | Delete Reason Group | Settings: Reasons | 300/min |

### Utilities & System


#### Custom integrations

Custom integrations (also known as custom buttons) are a feature in Provet that allows sending requests to external resources from inside Provet.

Using these API endpoints, you can automatically create and manage custom integrations in Provet settings without requiring user intervention.

**Important**: this API only returns custom integrations created by the user connected to the API token being used. This means that you will not be able to see all custom integrations available in Provet, but only the custom integrations you have created.

When creating a custom integration, you must specify a `type` value that determines where the button appears, an `action` value that determines the button behavior, and optionally a `method` value for HTTP requests.

For the complete list of type, action, and method values, see the [Custom Integration Types Reference](https://developers.provetcloud.com/restapi/custom_integration_types.html).

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/custom_integration/` | List Custom Integration | Settings: Integration settings | 100/min |
| `POST` | `/custom_integration/` | Create Custom Integration | Settings: Integration settings | 300/min |
| `GET` | `/custom_integration/{id}/` | Get Custom Integration | Settings: Integration settings | 300/min |
| `PUT` | `/custom_integration/{id}/` | Update Custom Integration | Settings: Integration settings | 300/min |
| `PATCH` | `/custom_integration/{id}/` | Patch Custom Integration | Settings: Integration settings | 300/min |
| `DELETE` | `/custom_integration/{id}/` | Delete Custom Integration | Settings: Integration settings | 300/min |

#### Logs

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/logs/email/` | List Logs Email | Settings: Integration settings | 100/min |
| `GET` | `/logs/integration_events/` | Get Logs Integration Events | Settings: Integration settings | 100/min |
| `POST` | `/logs/integration_events/` | Create Logs Integration Events | Settings: Integration settings | 300/min |
| `GET` | `/logs/sms/` | List Logs Sms | Settings: Integration settings | 100/min |
| `GET` | `/logs/email/{id}/` | Get Logs Email | Settings: Integration settings | 300/min |
| `GET` | `/logs/integration_events/{id}/` | Get Logs Integration Events | Settings: Integration settings | 300/min |
| `GET` | `/logs/sms/{id}/` | Get Logs Sms | Settings: Integration settings | 300/min |

#### Net promoter scores

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/nps/` | List Nps | General: Consultations and its items | 100/min |
| `POST` | `/nps/` | Create Nps | General: Consultations and its items | 300/min |
| `GET` | `/nps/{id}/` | Get Nps | General: Consultations and its items | 300/min |

#### Petmedchain

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/petmedchain/document/` | List Petmedchain Document | General: Patients and clients; General: Consultations and its items | 100/min |
| `POST` | `/petmedchain/document/` | Create Petmedchain Document | General: Patients and clients; General: Consultations and its items | 300/min |
| `POST` | `/petmedchain/pet-shared/` | Create Petmedchain Pet Shared | — | 300/min |
| `GET` | `/petmedchain/pet/` | List Petmedchain Pet | General: Patients and clients | 100/min |
| `POST` | `/petmedchain/pet/` | Create Petmedchain Pet | General: Patients and clients | 300/min |
| `GET` | `/petmedchain/settings/` | Get Petmedchain Settings | Settings: Organization settings | 100/min |
| `POST` | `/petmedchain/settings/` | Create Petmedchain Settings | Settings: Organization settings | 300/min |
| `GET` | `/petmedchain/document/{id}/` | Get Petmedchain Document | General: Patients and clients; General: Consultations and its items | 300/min |
| `PUT` | `/petmedchain/document/{id}/` | Update Petmedchain Document | General: Patients and clients; General: Consultations and its items | 300/min |
| `PATCH` | `/petmedchain/document/{id}/` | Patch Petmedchain Document | General: Patients and clients; General: Consultations and its items | 300/min |
| `DELETE` | `/petmedchain/document/{id}/` | Delete Petmedchain Document | General: Patients and clients; General: Consultations and its items | 300/min |
| `GET` | `/petmedchain/pet/{id}/` | Get Petmedchain Pet | General: Patients and clients | 300/min |
| `PUT` | `/petmedchain/pet/{id}/` | Update Petmedchain Pet | General: Patients and clients | 300/min |
| `PATCH` | `/petmedchain/pet/{id}/` | Patch Petmedchain Pet | General: Patients and clients | 300/min |
| `DELETE` | `/petmedchain/pet/{id}/` | Delete Petmedchain Pet | General: Patients and clients | 300/min |

#### Uploads

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/upload/` | List Upload | — | 100/min |
| `GET` | `/upload/{id}/` | Get Upload | — | 300/min |

#### Webhooks

Webhooks allow you to subscribe to events in Provet and receive HTTP POST notifications when those events occur.

You can configure webhooks to trigger on various events such as client updates, invoice creation, appointments, and more.

When creating a webhook, you must specify a `trigger` value that determines which event activates the webhook, and optionally a `content_type` value to specify the payload format.

For the complete list of trigger values and content types, see the [Webhook Triggers Reference](https://developers.provetcloud.com/restapi/webhook_triggers.html).

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/hook/queue/` | List Hook Queue | Settings: Integration settings | 100/min |
| `GET` | `/hook/webhook/` | List Hook Webhook | Settings: Integration settings | 100/min |
| `POST` | `/hook/webhook/` | Create Hook Webhook | Settings: Integration settings | 300/min |
| `GET` | `/hook/queue/{id}/` | Get Hook Queue | Settings: Integration settings | 300/min |
| `GET` | `/hook/webhook/{id}/` | Get Hook Webhook | Settings: Integration settings | 300/min |
| `PUT` | `/hook/webhook/{id}/` | Update Hook Webhook | Settings: Integration settings | 300/min |
| `PATCH` | `/hook/webhook/{id}/` | Patch Hook Webhook | Settings: Integration settings | 300/min |
| `DELETE` | `/hook/webhook/{id}/` | Delete Hook Webhook | Settings: Integration settings | 300/min |

#### Weight check

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/weightcheck/` | Get Weightcheck | — | 100/min |
| `POST` | `/weightcheck/` | Create Weightcheck | — | 100/min |

### Health plan self-service


#### Health plan self-service

Operations for client-facing platforms that sell and manage health plan subscriptions on behalf of a Provet organization. They require the 'Health plan self service' permission, granted to the API user in the organization's permission settings.

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/healthplan/` | List Healthplan | Settings: Health plan settings | 100/min |
| `GET` | `/patienthealthplan/cancellation_policy/` | Get Patienthealthplan Cancellation Policy | Health plan: Health plan self service | 100/min |

### Wholesaler API


#### Wholesaler API

Everything a wholesaler integration calls, and every callback it receives, in one place: registering an `AvailableWholesaler`, uploading a catalog for a clinic's linked `Wholesaler`, and reading or completing the orders clinics place with it.

These operations accept a dedicated `wholesaler` OAuth 2.0 scope instead of the general `restapi` scope. Order operations are shared with clinic-side integrations and so appear under Product orders as well.

See the [Wholesaler Integrations guide](https://developers.provetcloud.com/restapi/howto_wholesalers.html) for the end-to-end flow and signature verification.

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/available_wholesaler/` | List Available Wholesaler | — | 100/min |
| `POST` | `/available_wholesaler/` | Create Available Wholesaler | — | 300/min |
| `GET` | `/available_wholesaler/{id}/` | Get Available Wholesaler | — | 300/min |
| `PUT` | `/available_wholesaler/{id}/` | Update Available Wholesaler | — | 300/min |
| `PATCH` | `/available_wholesaler/{id}/` | Patch Available Wholesaler | — | 300/min |
| `DELETE` | `/available_wholesaler/{id}/` | Delete Available Wholesaler | — | 300/min |
| `GET` | `/order/{id}/` | Get Order | Settings: Stock | 300/min |
| `POST` | `/order/{id}/mark_delivered/` | Create Order Mark Delivered | Settings: Stock | 100/min |
| `POST` | `/order/{id}/set_wholesaler_reference_number/` | Create Order Set Wholesaler Reference Number | Settings: Stock | 100/min |
| `POST` | `/wholesaler/{id}/catalog_upload_url/` | Create Wholesaler Catalog Upload Url | — | 100/min |

### Otros recursos


#### Catalog Items

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/item/export/start/` | Create Item Export Start | Settings: Items | 100/min |
| `GET` | `/item/export/status/` | Get Item Export Status | Settings: Items | 100/min |

#### Search

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/search/` | Get Search | — | — |

#### archive_import_job

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/archive_import_job/` | List Archive Import Job | Financial: Invoices | 100/min |
| `GET` | `/archive_import_job/{id}/` | Get Archive Import Job | Financial: Invoices | 300/min |

#### archived_invoice

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/archived_invoice/` | List Archived Invoice | Financial: Invoices | 100/min |
| `POST` | `/archived_invoice/` | Create Archived Invoice | Financial: Invoices | 300/min |
| `POST` | `/archived_invoice/bulk-import/` | Create Archived Invoice Bulk Import | Financial: Invoices | 100/min |
| `GET` | `/archived_invoice/{id}/` | Get Archived Invoice | Financial: Invoices | 300/min |
| `PUT` | `/archived_invoice/{id}/` | Update Archived Invoice | Financial: Invoices | 300/min |
| `PATCH` | `/archived_invoice/{id}/` | Patch Archived Invoice | Financial: Invoices | 300/min |
| `POST` | `/archived_invoice/{id}/attachments/` | Create Archived Invoice Attachments | Financial: Invoices | 100/min |

#### archived_invoice_row

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/archived_invoice_row/` | List Archived Invoice Row | Financial: Invoices | 100/min |
| `GET` | `/archived_invoice_row/{id}/` | Get Archived Invoice Row | Financial: Invoices | 300/min |

#### archived_payment

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/archived_payment/` | List Archived Payment | Financial: Invoices | 100/min |
| `GET` | `/archived_payment/{id}/` | Get Archived Payment | Financial: Invoices | 300/min |

#### cashbookentry

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/cashbookentry/` | List Cashbookentry | Financial: End of day and accounting reports | 100/min |
| `GET` | `/cashbookentry/{id}/` | Get Cashbookentry | Financial: End of day and accounting reports | 300/min |

#### client_export

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/client_export/` | Create Client Export | — | 300/min |
| `GET` | `/client_export/{id}/` | Get Client Export | — | 300/min |

#### cloud_printer

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/cloud_printer/` | List Cloud Printer | Settings: Print settings | 100/min |
| `GET` | `/cloud_printer/{id}/` | Get Cloud Printer | Settings: Print settings | 300/min |

#### conditional_price_item_override

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/conditional_price_item_override/` | List Conditional Price Item Override | Settings: Items | 100/min |
| `POST` | `/conditional_price_item_override/` | Create Conditional Price Item Override | Settings: Items | 300/min |
| `GET` | `/conditional_price_item_override/{id}/` | Get Conditional Price Item Override | Settings: Items | 300/min |
| `DELETE` | `/conditional_price_item_override/{id}/` | Delete Conditional Price Item Override | Settings: Items | 300/min |

#### consultationsubcategory

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/consultationsubcategory/` | List Consultationsubcategory | General: Consultations and its items | 100/min |
| `GET` | `/consultationsubcategory/{id}/` | Get Consultationsubcategory | General: Consultations and its items | 300/min |

#### email

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/email/send/` | Create Email Send | General: Customer communication via email (API only) | 30/min |

#### estimateitemtemplateuse

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/estimateitemtemplateuse/` | List Estimateitemtemplateuse | Financial: Estimates | 100/min |
| `GET` | `/estimateitemtemplateuse/{id}/` | Get Estimateitemtemplateuse | Financial: Estimates | 300/min |

#### fiscal_data

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/fiscal_data/` | List Fiscal Data | Financial: Invoices | 100/min |
| `POST` | `/fiscal_data/` | Create Fiscal Data | Financial: Invoices | 300/min |
| `GET` | `/fiscal_data/{id}/` | Get Fiscal Data | Financial: Invoices | 300/min |
| `PUT` | `/fiscal_data/{id}/` | Update Fiscal Data | Financial: Invoices | 300/min |
| `PATCH` | `/fiscal_data/{id}/` | Patch Fiscal Data | Financial: Invoices | 300/min |
| `DELETE` | `/fiscal_data/{id}/` | Delete Fiscal Data | Financial: Invoices | 300/min |

#### form_assignment

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/form_assignment/` | Get Form Assignment | General: Patients and clients | 100/min |
| `GET` | `/form_assignment/{id}/` | Get Form Assignment | General: Patients and clients | 300/min |

#### home_delivery

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/home_delivery/` | List Home Delivery | — | 100/min |
| `GET` | `/home_delivery/client_data/` | List Home Delivery Client Data | Settings: Items | 100/min |
| `GET` | `/home_delivery/department_data/` | List Home Delivery Department Data | Settings: Items | 100/min |
| `GET` | `/home_delivery/item/` | List Home Delivery Item | Settings: Items | 100/min |
| `GET` | `/home_delivery/order/` | List Home Delivery Order | Settings: Items | 100/min |
| `GET` | `/home_delivery/patient_data/` | List Home Delivery Patient Data | Settings: Items | 100/min |
| `GET` | `/home_delivery/client_data/{id}/` | Get Home Delivery Client Data | Settings: Items | 300/min |
| `GET` | `/home_delivery/department_data/{id}/` | Get Home Delivery Department Data | Settings: Items | 300/min |
| `GET` | `/home_delivery/item/{id}/` | Get Home Delivery Item | Settings: Items | 300/min |
| `GET` | `/home_delivery/order/{id}/` | Get Home Delivery Order | Settings: Items | 300/min |
| `GET` | `/home_delivery/patient_data/{id}/` | Get Home Delivery Patient Data | Settings: Items | 300/min |
| `PUT` | `/home_delivery/item/{id}/update_status/` | Update Home Delivery Item Update Status | Settings: Items | 100/min |
| `PATCH` | `/home_delivery/item/{id}/update_status/` | Patch Home Delivery Item Update Status | Settings: Items | 100/min |

#### invoicerow_draft

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/invoicerow_draft/` | List Invoicerow Draft | Financial: Invoices | 100/min |
| `GET` | `/invoicerow_draft/{id}/` | Get Invoicerow Draft | Financial: Invoices | 300/min |
| `POST` | `/invoicerow_draft/{id}/finalize/` | Create Invoicerow Draft Finalize | Financial: Invoices | 100/min |

#### item_diagnosis_group

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/item_diagnosis_group/` | List Item Diagnosis Group | Settings: Items | 100/min |
| `GET` | `/item_diagnosis_group/{id}/` | Get Item Diagnosis Group | Settings: Items | 300/min |

#### masterdataentry

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/masterdataentry/` | List Masterdataentry | Settings: List and list items | 100/min |
| `GET` | `/masterdataentry/{id}/` | Get Masterdataentry | Settings: List and list items | 300/min |

#### medicinetemplate

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/medicinetemplate/` | List Medicinetemplate | Settings: Items | 100/min |
| `GET` | `/medicinetemplate/{id}/` | Get Medicinetemplate | Settings: Items | 300/min |

#### onlinebooking_trigger_topic

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/onlinebooking_trigger_topic/` | List Onlinebooking Trigger Topic | Settings: Organization settings | 100/min |
| `POST` | `/onlinebooking_trigger_topic/` | Create Onlinebooking Trigger Topic | Settings: Organization settings | 300/min |
| `GET` | `/onlinebooking_trigger_topic/{id}/` | Get Onlinebooking Trigger Topic | Settings: Organization settings | 300/min |
| `PUT` | `/onlinebooking_trigger_topic/{id}/` | Update Onlinebooking Trigger Topic | Settings: Organization settings | 300/min |
| `PATCH` | `/onlinebooking_trigger_topic/{id}/` | Patch Onlinebooking Trigger Topic | Settings: Organization settings | 300/min |
| `DELETE` | `/onlinebooking_trigger_topic/{id}/` | Delete Onlinebooking Trigger Topic | Settings: Organization settings | 300/min |

#### onlinebookingdaysavailable

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/onlinebookingdaysavailable` | Get Onlinebookingdaysavailable | Calendar: Shifts | 100/min |

#### patient_health_plan_payment

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/patient_health_plan_payment/` | List Patient Health Plan Payment | Health plan: Add health plan subscriptions to patients | 100/min |
| `POST` | `/patient_health_plan_payment/` | Create Patient Health Plan Payment | Health plan: Add health plan subscriptions to patients | 300/min |
| `GET` | `/patient_health_plan_payment/{id}/` | Get Patient Health Plan Payment | Health plan: Add health plan subscriptions to patients | 300/min |
| `PUT` | `/patient_health_plan_payment/{id}/` | Update Patient Health Plan Payment | Health plan: Add health plan subscriptions to patients | 300/min |
| `PATCH` | `/patient_health_plan_payment/{id}/` | Patch Patient Health Plan Payment | Health plan: Add health plan subscriptions to patients | 300/min |

#### patient_location_attribute

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/patient_location_attribute/` | List Patient Location Attribute | Settings: Department settings | 100/min |
| `POST` | `/patient_location_attribute/` | Create Patient Location Attribute | Settings: Department settings | 300/min |
| `GET` | `/patient_location_attribute/{id}/` | Get Patient Location Attribute | Settings: Department settings | 300/min |
| `PUT` | `/patient_location_attribute/{id}/` | Update Patient Location Attribute | Settings: Department settings | 300/min |
| `PATCH` | `/patient_location_attribute/{id}/` | Patch Patient Location Attribute | Settings: Department settings | 300/min |
| `DELETE` | `/patient_location_attribute/{id}/` | Delete Patient Location Attribute | Settings: Department settings | 300/min |

#### prescription_repeat

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/prescription_repeat/` | List Prescription Repeat | General: Patients and clients; Financial: Invoices | 100/min |
| `GET` | `/prescription_repeat/{id}/` | Get Prescription Repeat | General: Patients and clients; Financial: Invoices | 300/min |
| `POST` | `/prescription_repeat/{id}/cancel/` | Create Prescription Repeat Cancel | General: Patients and clients; Financial: Invoices | 100/min |

#### receivablesfiles

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/receivablesfiles/` | List Receivablesfiles | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 100/min |
| `POST` | `/receivablesfiles/` | Create Receivablesfiles | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `GET` | `/receivablesfiles/{id}/` | Get Receivablesfiles | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `PUT` | `/receivablesfiles/{id}/` | Update Receivablesfiles | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `PATCH` | `/receivablesfiles/{id}/` | Patch Receivablesfiles | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `DELETE` | `/receivablesfiles/{id}/` | Delete Receivablesfiles | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |

#### receivablespayments

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/receivablespayments/` | List Receivablespayments | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 100/min |
| `POST` | `/receivablespayments/` | Create Receivablespayments | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `GET` | `/receivablespayments/{id}/` | Get Receivablespayments | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `PUT` | `/receivablespayments/{id}/` | Update Receivablespayments | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `PATCH` | `/receivablespayments/{id}/` | Patch Receivablespayments | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |
| `DELETE` | `/receivablespayments/{id}/` | Delete Receivablespayments | Reporting: Reports page; Reporting: Financial Bank payment processing reports | 300/min |

#### recently_viewed

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/recently_viewed/` | List Recently Viewed | — | 100/min |
| `GET` | `/recently_viewed/{id}/` | Get Recently Viewed | — | 300/min |

#### refill_item

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/refill_item/` | List Refill Item | General: Patients and clients; Financial: Invoices | 100/min |
| `POST` | `/refill_item/` | Create Refill Item | General: Patients and clients; Financial: Invoices | 300/min |
| `GET` | `/refill_item/{id}/` | Get Refill Item | General: Patients and clients; Financial: Invoices | 300/min |

#### resources_availability

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/resources_availability/` | List Resources Availability | Calendar: Shifts | 100/min |

#### settings

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/settings/department/` | List Settings Department | Settings: Department settings | 100/min |
| `GET` | `/settings/organization/` | List Settings Organization | Settings: Organization settings | 100/min |
| `GET` | `/settings/department/{id}/` | Get Settings Department | Settings: Department settings | 300/min |
| `PUT` | `/settings/department/{id}/` | Update Settings Department | Settings: Department settings | 300/min |
| `PATCH` | `/settings/department/{id}/` | Patch Settings Department | Settings: Department settings | 300/min |
| `GET` | `/settings/organization/{id}/` | Get Settings Organization | Settings: Organization settings | 300/min |
| `PUT` | `/settings/organization/{id}/` | Update Settings Organization | Settings: Organization settings | 300/min |
| `PATCH` | `/settings/organization/{id}/` | Patch Settings Organization | Settings: Organization settings | 300/min |

#### shifttemplate

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/shifttemplate/` | List Shifttemplate | Calendar: Shifts | 100/min |
| `POST` | `/shifttemplate/` | Create Shifttemplate | Calendar: Shifts | 300/min |
| `GET` | `/shifttemplate/{id}/` | Get Shifttemplate | Calendar: Shifts | 300/min |
| `PUT` | `/shifttemplate/{id}/` | Update Shifttemplate | Calendar: Shifts | 300/min |
| `PATCH` | `/shifttemplate/{id}/` | Patch Shifttemplate | Calendar: Shifts | 300/min |
| `DELETE` | `/shifttemplate/{id}/` | Delete Shifttemplate | Calendar: Shifts | 300/min |
| `GET` | `/shifttemplate/{parent_lookup_shifts_template}/block/` | List Shifttemplate Block | Calendar: Shifts | 100/min |
| `POST` | `/shifttemplate/{parent_lookup_shifts_template}/block/` | Create Shifttemplate Block | Calendar: Shifts | 300/min |
| `GET` | `/shifttemplate/{parent_lookup_shifts_template}/block/{id}/` | Get Shifttemplate Block | Calendar: Shifts | 300/min |
| `PUT` | `/shifttemplate/{parent_lookup_shifts_template}/block/{id}/` | Update Shifttemplate Block | Calendar: Shifts | 300/min |
| `PATCH` | `/shifttemplate/{parent_lookup_shifts_template}/block/{id}/` | Patch Shifttemplate Block | Calendar: Shifts | 300/min |
| `DELETE` | `/shifttemplate/{parent_lookup_shifts_template}/block/{id}/` | Delete Shifttemplate Block | Calendar: Shifts | 300/min |
| `GET` | `/shifttemplate/{parent_lookup_shifts_template_block__shifts_template}/block/{parent_lookup_shifts_template_block}/fragment/` | List Shifttemplate Block Fragment | Calendar: Shifts | 100/min |
| `POST` | `/shifttemplate/{parent_lookup_shifts_template_block__shifts_template}/block/{parent_lookup_shifts_template_block}/fragment/` | Create Shifttemplate Block Fragment | Calendar: Shifts | 300/min |
| `GET` | `/shifttemplate/{parent_lookup_shifts_template_block__shifts_template}/block/{parent_lookup_shifts_template_block}/fragment/{id}/` | Get Shifttemplate Block Fragment | Calendar: Shifts | 300/min |
| `PUT` | `/shifttemplate/{parent_lookup_shifts_template_block__shifts_template}/block/{parent_lookup_shifts_template_block}/fragment/{id}/` | Update Shifttemplate Block Fragment | Calendar: Shifts | 300/min |
| `PATCH` | `/shifttemplate/{parent_lookup_shifts_template_block__shifts_template}/block/{parent_lookup_shifts_template_block}/fragment/{id}/` | Patch Shifttemplate Block Fragment | Calendar: Shifts | 300/min |
| `DELETE` | `/shifttemplate/{parent_lookup_shifts_template_block__shifts_template}/block/{parent_lookup_shifts_template_block}/fragment/{id}/` | Delete Shifttemplate Block Fragment | Calendar: Shifts | 300/min |

#### transaction_terminal

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `GET` | `/transaction_terminal/` | List Transaction Terminal | Settings: Integration settings | 100/min |
| `GET` | `/transaction_terminal/{id}/` | Get Transaction Terminal | Settings: Integration settings | 300/min |

#### upload_urls

| Método | Ruta | Qué hace | Permisos | Límite |
|---|---|---|---|---|
| `POST` | `/upload_urls/` | Create Upload Urls | — | 400/min |---

## 25. Los 58 endpoints de acción

Estos no son CRUD: ejecutan una operación de negocio. Son los más fáciles de pasar por alto y a menudo los más útiles.

### Consultas

| Método | Ruta | Para qué sirve |
|---|---|---|
| `POST` | `/consultation/{id}/update_status/` | **Mover la consulta por su ciclo de vida.** Única forma de cambiar `status` |
| `POST` | `/consultation/{id}/update_started_time/` | Corregir la hora de inicio |
| `GET POST PUT PATCH` | `/consultation/{id}/set_integration_status/` | **Marcar el estado de esta consulta frente a una integración externa** |
| `GET POST PUT PATCH` | `/consultation/{id}/mark_sent/` | **Marcar la consulta como enviada a un sistema externo** |
| `POST` | `/consultation/{parent}/medicines/{id}/delete_withdrawal_period/` | Eliminar el periodo de supresión de un medicamento |
| `POST` | `/consultation_items/medicine/{id}/delete_withdrawal_period/` | Ídem, por la ruta plana |

Los mismos cuatro primeros existen también bajo `/create_consultation/{id}/…`.

### Facturas y pagos

| Método | Ruta | Para qué sirve |
|---|---|---|
| `GET POST PUT` | `/invoice/{id}/add_item/` | Añadir una línea a una factura existente |
| `POST` | `/invoice/{id}/invoice_date/` | Cambiar la fecha de la factura |
| `GET POST` | `/invoice/{id}/full_refund/` | **Devolución total** |
| `GET POST` | `/invoice/{id}/partial_refund/` | **Devolución parcial** |
| `POST` | `/invoice/{id}/generate_qr_code/` | Generar código QR de la factura |
| `POST` | `/invoice/{id}/cloudprnt/` | Enviar a impresora en la nube |
| `POST` | `/invoicepayment/{id}/cancel_payment/` | Anular un pago |
| `POST` | `/invoicepayment/{id}/generate_qr_code/` | QR de pago |
| `POST` | `/invoicerow_draft/{id}/finalize/` | Finalizar una línea en borrador |
| `POST` | `/unallocatedpayment/{id}/cancel/` | Anular un pago no asignado |
| `POST` | `/archived_invoice/{id}/attachments/` | Adjuntar archivos a una factura archivada |

### Ventas de mostrador

| Método | Ruta | Para qué sirve |
|---|---|---|
| `GET POST PUT` | `/countersale/{id}/add_item/` | Añadir producto a la venta |
| `POST PUT` | `/countersale/{id}/finalize/` | **Cerrar la venta** |
| `POST` | `/countersale/{id}/invoice_date/` | Cambiar fecha de facturación |

### Citas

| Método | Ruta | Para qué sirve |
|---|---|---|
| `POST` | `/appointment/{id}/admit/` | **Admitir al paciente** (convierte la cita en consulta) |
| `POST` | `/appointment/{id}/cancel_appointment/` | Cancelar la cita |
| `POST` | `/appointment/{id}/create_advance_payment/` | Cobrar un anticipo |
| `POST` | `/appointment/{id}/create_telemedicine_room/` | Crear sala de telemedicina |
| `POST` | `/appointment/{id}/send_appointment_confirmation/` | Enviar confirmación |
| `POST` | `/appointment_reminder/{id}/mark_external_sending/` | Marcar envío externo |
| `PUT` | `/appointment_reminder/{id}/mark_sent/` | Marcar recordatorio como enviado |

### Inventario y stock

| Método | Ruta | Para qué sirve |
|---|---|---|
| `POST` | `/item/{id}/add_batch_to_stock/` | Añadir lote al inventario |
| `POST` | `/item/{id}/update_stock_level/` | Ajustar nivel de existencias |
| `POST` | `/item/{id}/create_new_finalized_invoice_and_prepayments/` | Crear factura finalizada y prepagos en un paso |
| `GET POST` | `/stock/item/{id}/inventory/` | Inventario del ítem |
| `GET POST` | `/stocklevel/{id}/inventory/` | Inventario por nivel |
| `POST` | `/order/{id}/mark_delivered/` | Marcar pedido como entregado |
| `POST` | `/order/{id}/set_wholesaler_reference_number/` | Fijar referencia del mayorista |
| `POST` | `/orderitem/{id}/add_to_stock/` | Ingresar línea de pedido al stock |
| `POST` | `/wholesaler/{id}/catalog_upload_url/` | Obtener URL para subir catálogo |

### Pacientes y planes de salud

| Método | Ruta | Para qué sirve |
|---|---|---|
| `POST` | `/patient/{id}/merge/` | **Fusionar pacientes duplicados** |
| `POST` | `/patient/{id}/unmerge/` | Deshacer la fusión |
| `POST` | `/patienthealthplan/{id}/create_upcoming/` | Crear el siguiente periodo del plan |
| `POST` | `/patienthealthplan/{id}/process_payment/` | Procesar el cobro del plan |
| `POST` | `/patienthealthplan/{id}/update_status/` | Cambiar estado del plan |
| `POST PUT` | `/patienthealthplanitem/{id}/mark_used/` | Marcar prestación consumida |
| `POST PUT` | `/patienthealthplanitemgroup/{id}/set_used_item_quantity/` | Fijar cantidad consumida |

### Planes de tratamiento

| Método | Ruta | Para qué sirve |
|---|---|---|
| `POST` | `/treatmentplanmedicine/{id}/mark_done/` | Marcar medicación administrada |
| `POST` | `/treatmentplanprocedure/{id}/mark_done/` | Marcar procedimiento realizado |
| `POST` | `/treatmentplansupply/{id}/mark_done/` | Marcar insumo aplicado |
| `POST` | `/treatmentplanfood/{id}/mark_done/` | Marcar alimentación dada |

### Contabilidad, recetas y otros

| Método | Ruta | Para qué sirve |
|---|---|---|
| `POST` | `/journal_entry/{id}/tag_entry/` | Etiquetar asiento contable |
| `POST` | `/journal_entry_problem/{id}/tag_entry/` | Etiquetar incidencia de asiento |
| `POST` | `/journal_transaction/{id}/tag_transaction/` | Etiquetar transacción |
| `POST` | `/journal_transaction_problem/{id}/tag_transaction/` | Etiquetar incidencia de transacción |
| `POST` | `/prescription_repeat/{id}/cancel/` | Cancelar receta repetible |
| `PUT` | `/reminder/{id}/mark_sent/` | Marcar recordatorio enviado |
| `PUT PATCH` | `/home_delivery/item/{id}/update_status/` | Actualizar estado de entrega a domicilio |

---

## 26. Relevancia para `fact_elect_vet`

### 26.1 Lo que el proyecto usa hoy

De 1.122 operaciones disponibles, la integración usa **8**, todas de lectura:

| Endpoint | Uso | Límite real | ¿Ventana `modified__gte`? |
|---|---|---|---|
| `GET /consultation/` | Cola de consultas | 100/min | **Sí** — correcto, es el recurso padre |
| `GET /client/` | Datos del dueño | 125/min | No — se trae entera |
| `GET /patient/` | Datos del animal | 300/min | No — se trae entera |
| `GET /invoice/` | Totales de la factura | **60/min** | No — se trae entera |
| `GET /invoicerow/` | **Líneas facturables** | 100/min | No — se trae entera |
| `GET /consultationitem/` | Ítems de consulta | 100/min | No — se trae entera |
| `GET /phonenumber/` | Teléfono del dueño | 900/min | No — se trae entera |
| `GET /item/` | Catálogo maestro | 100/min | **Devuelve 403** con el ámbito actual |

**Cero escrituras.** La integración es hoy estrictamente de lectura sobre Provet.

### 26.2 El problema de paginación, ahora con el número oficial

Traer seis colecciones enteras con `page_size=1000` era una sospecha en la auditoría. Con el esquema en la mano deja de serlo:

- `GET /invoice/` está limitado a **60 peticiones por minuto**. Es el límite más bajo de todos los endpoints que el proyecto usa, y menos de la mitad de los 125 de `/client/`.
- Si el tamaño de página por defecto de ese endpoint es 50, cada llamada con `page_size=1000` **pesa 20**.
- **Tres páginas de facturas consumen el minuto entero.**
- La documentación recomienda literalmente lo contrario de lo que hace el código: páginas pequeñas, y `id__gt=<último_id>` en vez de desplazamientos grandes.

**Recomendación concreta:** bajar a `page_size=200` (peso 4, 15 llamadas por minuto disponibles) y paginar con `id__gt=` en lugar de `page=`.

### 26.3 Endpoints no usados que cambiarían el diseño

Ordenados por lo que aportarían.

| Endpoint | Por qué importa |
|---|---|
| **`POST /consultation/{id}/set_integration_status/`** | **El más relevante de todos.** Permite marcar en Provet el estado de una consulta frente a una integración externa. Hoy el proyecto mantiene ese estado exclusivamente en su tabla `invoice_claims` de Postgres. Con este endpoint, el estado "ya facturada a la DIAN" viviría también donde la clínica lo ve: en Provet. Elimina la clase entera de fallos en que la base de datos del integrador y Provet dicen cosas distintas |
| **`POST /consultation/{id}/mark_sent/`** | Complementario del anterior: marca la consulta como enviada al sistema externo |
| **Webhook trigger 45 — Consultation finalized** | Sustituiría el sondeo cada 20 segundos por notificación push. Es el evento exacto que dispara la facturación. Elimina de golpe el problema de los límites de la sección 26.2, porque ya no haría falta refrescar en bucle |
| **Webhook trigger 9 — Invoice** | Notifica creación o modificación de la factura de Provet |
| **Webhook trigger 23 — Invoice row delete** | **Hoy invisible para el proyecto.** Si la recepción borra una línea en Provet después de que la cola se cargó, la factura electrónica sale con una línea que ya no existe |
| **Webhook trigger 60 — Invoice extra fee after finalization** | Cargo añadido después de finalizar. Mismo problema que el anterior, en sentido contrario |
| **`expose_consultation_item` en `/invoicerow/`** | Traería el ítem de consulta incrustado en la propia fila de factura. **Evitaría por completo tener que descargar `/consultationitem/` entera**, que es una de las seis colecciones sin ventana. Una llamada menos y una colección completa menos |
| **`GET /invoice/{id}/` en vez de `GET /invoice/`** | Para una consulta concreta, pedir la factura por id cuesta 1 petición de un presupuesto de 250/min, frente al listado completo a 60/min |
| **`POST /invoice/{id}/full_refund/` y `/partial_refund/`** | Provet tiene su propio mecanismo de devolución. Hoy la anulación se hace solo en Siigo con nota crédito; la factura de Provet queda sin reflejarlo |
| `GET /vatgroup/` | Grupos de IVA de la organización. Útil para validar que los porcentajes que se envían a Siigo coinciden con los de Provet |
| `GET /paymentmethod/` | Formas de pago de Provet. Hoy el mapeo a Siigo se configura a mano sin contrastar contra este catálogo |
| `GET /department/` | La clínica puede tener varios departamentos con tarifas distintas |

### 26.4 Sobre el 403 de `GET /item/`

El esquema lo aclara: `GET /item/` exige el permiso **`Settings: Items`**, que es una familia distinta de `General: Consultations and its items` (consultas) y `Financial: Invoices` (facturas). No es un fallo de la API ni un límite: es que la integración **no tiene ese permiso concedido**.

**Acción concreta:** pedir a la clínica que añada `Settings: Items` al grupo de permisos de la integración en Provet, o solicitar a soporte de Provet una plantilla de permisos que lo incluya. Es un cambio de configuración, no de código.

---

## 27. Fuentes

### Fuente primaria

- **`https://developers.provetcloud.com/restapi/0.1/openapi-schema-01.json`** — esquema OpenAPI 3.0.3 oficial, 4,5 MB, descargado el 2026-09-09. Origen de todas las tablas de endpoints, permisos y límites.

### Páginas de documentación recuperadas íntegras

- `/restapi/` — índice y guías
- `/restapi/authentication_oauth2.html` — OAuth 2.0, los cuatro endpoints y los dos flujos
- `/restapi/authentication_token.html` — tokens estáticos (deprecados)
- `/restapi/endpoints.html`
- `/restapi/filtering.html` — los 15 operadores de filtrado y el formato de fecha
- `/restapi/pagination.html` — estructura de la respuesta paginada
- `/restapi/expose.html` — expansión de relaciones, con ejemplo completo de `invoicerow`
- `/restapi/ratelimit.html` — fórmula del peso por `page_size`
- `/restapi/api_permissions.html` — plantillas de permisos
- `/restapi/webhook_triggers.html` — los 68 disparadores y los 2 tipos de contenido
- `/restapi/changelog.html` y `/restapi/upcoming-changes.html`
- `/restapi/howto_billing.html` — Facturación
- `/restapi/howto_clients_patients.html` — Clientes y pacientes
- `/restapi/howto_consultations.html` — Consultas
- `/restapi/howto_erp_accounting.html` — Integración ERP y contabilidad

### Fuente de las observaciones

- `EVIDENCIA_APIS.md` del proyecto `fact_elect_vet` — comportamientos medidos contra el tenant real.

---

## 28. Lo que no pude verificar

1. **El `page_size` por defecto de cada endpoint.** La fórmula del peso depende de él, y la documentación solo lo ilustra con un ejemplo genérico de 50. El valor real por endpoint **no está en el esquema ni en la documentación**. Sin él, el peso exacto de una llamada con `page_size=1000` es una estimación. **Verificación en vivo:** llamar a cualquier listado sin `page_size` y contar los elementos de `results`.
2. **Las guías de uso restantes:** Provet Pay, reservas en línea, prescripción en línea, RIS/imagen diagnóstica y mayoristas. Los endpoints están en las tablas; las guías narrativas no las leí.
3. **Los esquemas de cuerpo de petición y respuesta campo a campo.** El JSON los contiene (`components/schemas`), pero son varios miles de definiciones. Este documento cubre **rutas, métodos, permisos y límites** de las 1.122 operaciones, y el detalle de campos solo de los cinco recursos centrales del dominio (sección 2).
4. **Qué filtros respeta realmente cada endpoint.** El esquema declara los parámetros aceptados, pero ya hay al menos un caso medido (`consultationitem?consultation=`) en que **el parámetro se acepta y se ignora**. Declarado no es lo mismo que funcional.
5. **Los dominios regionales.** El esquema dice que `domain` es "específico de la región" y pone `provetcloud.com` por defecto, pero **no publica la lista de dominios regionales**.
