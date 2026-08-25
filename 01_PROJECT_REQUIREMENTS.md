# Especificación de Requerimientos y Directivas del Proyecto
**Integrador Provet Cloud ↔ Siigo Nube (Facturación Electrónica DIAN)**

Este documento constituye la referencia técnica y funcional completa del proyecto para garantizar la coherencia arquitectónica en todos los entornos de desarrollo y chats asociados.

---

## 1. Visión General y Definición del Proyecto

### 1.1 Naturaleza del Sistema
* **Tipo:** Aplicación Web Interna (Middleware API + Dashboard de Operación).
* **Propósito:** Automatizar la emisión de Facturación Electrónica en Colombia avalada por la DIAN, eliminando la digitación manual entre el PMS clínico (**Provet Cloud**) y el ERP contable (**Siigo Nube**).
* **Entorno de Despliegue & Dominio:** Vercel / Render / AWS bajo una instancia o subdominio privado corporativo de la clínica (ej. `https://facturacion.tuveterinaria.com`).
* **Acceso y Seguridad de Usuario:** Dashboard protegido por autenticación basada en JWT, restringido exclusivamente a personal de recepción y administración autorizado.

### 1.2 Requerimientos Funcionales Esenciales (Core)
1. **Ingesta Automatizada de Atenciones:** Captura de datos de servicios, productos, propietarios y pacientes desde Provet Cloud vía REST API (`/consultations`, `/clients`, `/patients`) y Webhooks en tiempo real (`List of Webhook Triggers` - evento `45: Consultation finalized`).
2. **Pre-visualización e Interacción (1-Click Invoicing):** Interfaz ágil que permite a la recepcionista validar o ajustar datos críticos (Cédula/NIT, dirección, correo electrónico, método de pago) antes de confirmar la facturación.
3. **Mapeo Dinámico de Catálogos:** Módulo administrativo para relacionar dinámicamente ítems/servicios de Provet con códigos de productos/impuestos en Siigo (`/products`) y asociar formas de pago de Provet con formas de pago activas en Siigo (`/payment-types`).
4. **Transformación Contable y Fiscal DIAN:** Construcción del payload JSON estricto para `POST /v1/invoices` cumpliendo la Resolución 948 y parámetros de salud DIAN si aplicaren.
5. **Transmisión y Emisión Integrada:** Firma electrónica directa (`stamp.send: true`), recuperación del **CUFE** y despacho automático de correo electrónico al cliente final (`mail.send: true`).
6. **Auditoría, Historial y Reintentos:** Registro de transacciones (Borradores, Aceptadas, Rechazadas) con detalle técnico visible y botón de reintento directo.
7. **Módulo de Configuración de Credenciales:** Módulo protegido donde los administradores ingresan credenciales (`Partner-Id`, `Username`, `Access Key`, `Client ID`, `Client Secret`) y conmutan dinámicamente entre **Modo Pruebas (Mock/Sandbox)** y **Producción Real**.

### 1.3 Requerimientos No Esenciales (Wishlist / Fases Futuras)
* Exportación de reportes masivos en formatos Excel/CSV.
* Indicadores gráficos de ventas diarias y mensuales.
* Envíos de la factura en PDF mediante WhatsApp API.

---

## 2. Directivas de Seguridad e Información Sensible

Dado el procesamiento de datos personales (RUT/Cédula, emails, direcciones) y responsabilidad ante la DIAN:

1. **Gestión de Secretos:** 
   * Prohibición absoluta de hardcodear llaves API en el código.
   * Las credenciales se leen exclusivamente desde Variables de Entorno (`.env`) o desde la base de datos cifrada (AES-256).
2. **Seguridad en Frontend & Sesión:**
   * HTTPS obligatorio.
   * Tokens de sesión JWT en cookies con atributos `HttpOnly`, `SameSite=Strict` y `Secure`.
   * Protección contra vulnerabilidades XSS, CSRF y Clickjacking.
3. **Estándares Técnicos API (Siigo & Provet):**
   * Encabezado obligatorio `Partner-Id` en peticiones a Siigo (entre 3 y 100 caracteres alfanuméricos válidos).
   * Encabezado `Idempotency-Key` (alfanumérico, máx. 30 caracteres) en peticiones `POST /v1/invoices` para evitar duplicidad de facturas.
   * Renovación automática de Tokens JWT (`POST /auth`) antes de su vencimiento (24h).

---

## 3. Fallbacks, Tolerancia a Fallos y Manejo de Errores

El sistema debe interceptar los códigos de error crudos y presentarlos en lenguaje claro con acciones correctivas inmediatas:

| Código Error | Descripción / Causa | Mensaje en Pantalla | Fallback / Acción Sugerida |
| :--- | :--- | :--- | :--- |
| `invalid_identification` | Cédula/NIT con formato inválido. | "La cédula o NIT ingresado no es válido para la DIAN." | Habilitar edición rápida de la cédula en el modal antes de reintentar. |
| `invalid_total_payments` | Descuadre entre total de ítems y total pagado. | "El valor pagado no coincide con el total de la atención médica." | Recalcular automáticamente los decimales y ajustar diferencias de redondeo. |
| `parameter_required` | Falta información requerida (ej. correo, dirección). | "Falta el correo electrónico del cliente para enviar la factura." | Abrir campo editable del correo y reintentar la emisión. |
| `requests_limit` (429) | Superado el límite de 100 req/min (o 10 req/min en Sandbox). | "Servidor de facturación ocupado. Reintentando..." | Aplicar reintento automático con algoritmo de Exponential Backoff. |
| `service_unavailable` (503)| Servicio de Siigo o la DIAN temporalmente fuera de línea. | "El servicio de la DIAN no responde. Factura guardada en Borrador." | Guardar en estado `Draft` / Borrador con encolamiento de reintento diferido. |

---

## 4. Estándares de Rendimiento, Optimización y Métricas Web

Para asegurar una experiencia fluida e insuperable según métricas de la industria:

* **Core Web Vitals Exigidas:**
  * **LCP (Largest Contentful Paint):** `< 2.5s`
  * **INP (Interaction to Next Paint):** `< 200ms`
  * **CLS (Cumulative Layout Shift):** `< 0.1`
* **Herramientas Estándar de Evaluación de Rendimiento:**
  1. **Google Lighthouse / PageSpeed Insights:** Evaluación de velocidad, accesibilidad, buenas prácticas y SEO.
  2. **WebPageTest / GTmetrix:** Análisis profundo del waterfall de red, TTFB (Time to First Byte) y renderizado inicial.
* **Estrategias de Optimización:**
  * Renderizado híbrido (SSR en vistas base, Client Components para partes interactivas).
  * Lazy loading de tablas masivas de historial.
  * Estrategia de caching y *Revalidation* para catálogos de Siigo (`/products`, `/payment-types`) evitando golpear innecesariamente la API.

---

## 5. Reglas de Limpieza de Código y Arquitectura

* **Cero Código Muerto:** Eliminar funciones sin uso, variables declaradas no utilizadas, imports obsoletos o bloques comentados.
* **Separación Estricta de Capas:**
  * `/services`: Comunicación directa con las API (Provet, Siigo).
  * `/mappers`: Transformaciones puras de JSON sin efectos secundarios.
  * `/components`: UI modular, responsiva e interactiva.
* **Formularios & Validaciones:** Uso de React Hook Form + Zod (o equivalentes ligeros) para validación en cliente/servidor sin sobrecargar la aplicación.