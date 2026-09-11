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

# Auditoría de proyecto — `fact_elect_vet`

**Alcance:** proceso, gobernanza, fidelidad documental y distancia real a producción.
No es una auditoría de código línea por línea.

**Base medida:** commit `81b10033ef370bb517d0d9636b9c0c4e713525d6` en `main`
(`Merge pull request #13 from JeanC221/chat6b/csp`, 2026-09-08 22:15 -0500).
Clon fresco, `npm ci` (npm 10.9.7, Node 22.22.2, `lockfileVersion: 3`), tres gates
corridos por el auditor el 2026-09-09.

**Lo que NO se ha verificado:** nada que requiera el panel de Vercel, el de Supabase
o la cuenta Siigo del cliente. Todo eso está en §6, marcado como pendiente.
La documentación oficial de Siigo (`developers.siigolatam.com`) **no fue accesible**;
se usó el espejo Apiary, que coincide literalmente con el dump local. La de Provet
(`developers.provetcloud.com`) **sí fue accesible por completo**.

---

## 1. Resumen ejecutivo

### 1.1 Hallazgo #1 — cero desviaciones

§6.1 pedía reportar como primer hallazgo cualquier desviación entre las cifras
declaradas y las medidas. **No hay ninguna.** Las nueve métricas coinciden exactamente.

Esto merece decirse sin adornos: `PROJECT_STATE.md` mintió dos veces en el pasado, y
por eso la sección 4 se escribió midiendo en vez de citando. **El método funcionó.**
La conclusión operativa no es "el documento es fiable" sino "**el documento es fiable
cuando se mide, y solo entonces**". Ver §4.1.

### 1.2 ¿A qué distancia está de emitir facturas reales?

**Dos bloqueantes duros, ambos con la misma causa raíz: nadie ha visto nunca un
`stamp` con CUFE.** Todo lo demás está construido.

La respuesta corta: **de 2 a 4 sesiones de trabajo tuyo**, más una dependencia de
terceros que no controlas y que puede tardar días o semanas. El margen de error real
está dominado por esa dependencia, no por el código.

El desglose completo está en §5. La versión de una línea:

> El sistema está funcionalmente terminado y verificado contra sandbox. Lo que falta
> no es código: es **una emisión real que demuestre que la capa de lectura del
> `stamp` no devuelve `Draft` para una factura aceptada**, y la migración de un
> framework sin soporte de seguridad.

### 1.3 Los tres hallazgos nuevos de esta auditoría

| | Hallazgo | Bloque |
|---|---|---|
| **H-1** | `EVIDENCIA_APIS.md` nunca ha existido en el repo. Ni en el árbol ni en la historia de git | §2.1 |
| **H-2** | El cap de 150 líneas tiene **tres definiciones** en el repo. Da 25, 17 u 11 según cuál apliques | §2.2 |
| **H-3** | La CSP report-only **no tiene endpoint de recolección**. La condición de salida de la fase 2 es inobservable tal como está configurada | §4.3 |

---

## 2. Bloque 5.1 — ¿La documentación dice la verdad?

### 2.1 Tabla de desviaciones documentales

| # | Afirmación | Dónde | Medido | Veredicto |
|---|---|---|---|---|
| 1 | `tsc --noEmit` limpio | Sección 4 | exit 0 | ✅ |
| 2 | 637 tests / 45 archivos | Sección 4 | 637 passed (637), 45 files | ✅ |
| 3 | `next build` 9/9, 20 rutas | Sección 4 | exit 0, 9/9, 20 rutas | ✅ |
| 4 | 4 páginas estáticas `○` | Sección 4 | 4, mismas rutas | ✅ |
| 5 | Middleware 40.1 kB | Sección 4 | 40.1 kB | ✅ |
| 6 | 85 fuente / ~10.273 líneas | Sección 4 | 85 / 10.273 | ✅ |
| 7 | 45 tests / ~6.823 líneas | Sección 4 | 45 / 6.823 | ✅ |
| 8 | `npm audit` 2 por paquete | Sección 4 | 2 (1 critical `next`, 1 high `postcss`) | ✅ |
| 9 | `npm audit` 27 advisories (2/10/13/2) | Sección 4 | 27 (2 crit, 10 high, 13 mod, 2 low) | ✅ |
| 10 | Ruido de lockfile no bloqueante | Sección 4 | Reproducido, build completa | ✅ |
| 11 | **5 archivos violan el cap de 150** | `PROJECT_STATE.md:987-988` | **25, 17 u 11** según definición | ❌ **Incompleto** |
| 12 | `.clinerules` referencia `2_AGENT_WORKFLOW_RULES.md` | `.clinerules:10` | Correcto en el repo | ✅ |
| 13 | `EVIDENCIA_APIS.md` gobierna el proyecto | `prompt_auditoria §5.4` | **No existe en el repo** | ❌ **Falso** |
| 14 | El tercer gate es `npm run lint` | `.clinerules:26` | `"lint": "tsc --noEmit"` — es el gate 1 | ⚠️ **Redundante** |

### H-1 — El documento que gobierna las APIs no está en el repo

**Qué observé.** `find` + `git log --all --diff-filter=A -- '*EVIDENCIA*' '*AUDITORIA*'`
devuelven **cero resultados**. `EVIDENCIA_APIS.md`, `AUDITORIA_PROVET_API.md` y
`AUDITORIA_FACT_ELECT_VET_2026-09-02.md` nunca han sido commiteados. `.gitignore` no
los excluye — simplemente nunca se añadieron. El repo contiene exactamente cinco
documentos: `.clinerules`, `PROJECT_STATE.md`, los tres numerados y `README.md`.

**Riesgo real, y cuándo se manifiesta.** Tu propio workflow exige clonar en fresco al
inicio de cada sesión y leer la gobernanza *desde el repo*. Un agente que haga eso
**no verá jamás** el documento que declara tener prioridad sobre la documentación
oficial. Se manifiesta el día que una sesión razone desde la doc de Siigo y
recalcule `sum_total`, o asuma que `stamp` llega como `null`, o reutilice una
`Idempotency-Key` tras un 500. Las tres son regresiones que ya pagaste una vez.

Es tu modo de fallo conocido de "archivos de estado paralelos", **invertido**: en vez
de un sidecar dentro del repo que compite con `PROJECT_STATE.md`, es evidencia
crítica que vive *fuera* y que ningún gate puede alcanzar.

**Recomendación.** Commitear `EVIDENCIA_APIS.md` en la raíz y añadirlo como punto 5
del protocolo de lectura obligatoria de `.clinerules §1`. Es la corrección más barata
del informe y cierra un agujero que ha estado abierto desde el Chat 11.

### H-2 — El cap de 150 líneas: una regla, tres definiciones

**Qué observé.** El repo contiene tres definiciones incompatibles del mismo límite:

| Definición | Fuente | Alcance | Violaciones |
|---|---|---|---|
| A | `2_AGENT_WORKFLOW_RULES.md §2` | Todo `/src` | **25** |
| B | `.clinerules` (CODE EFFICIENCY) | Solo `/services`, `/mappers`, `/components` | **17** |
| C | `PROJECT_STATE.md:1140` | LOC sin blancos ni comentarios | **11** |

`PROJECT_STATE.md:987-988` lista cinco: `creditNote.ts` (154), `siigoApi.ts` (205),
`invoices/route.ts` (174), `QuickEditDrawer.tsx` (172), `app/page.tsx` (370).
**Los cinco números son correctos.** El documento no miente sobre ellos: está
incompleto, que es un fallo distinto y menos grave.

Peor que la ambigüedad es su uso. `PROJECT_STATE.md:1201` invoca explícitamente la
definición B para excusar un archivo: *"`page.tsx` remains 178 LOC (existing
`/src/app` file, not under the `/services`/`/mappers`/`/components` 150-line cap)"*.
Y `:1140` introduce la definición C justificándola con que el documento ya citaba
`page.tsx` a 132/147 cuando el archivo crudo tenía 157. Mientras tanto, la lista de
remediación de `:987` **sí incluye `app/page.tsx`**, contradiciendo a `:1201`.

**Riesgo real.** No es el tamaño de los archivos. Es que **existe un precedente
escrito de reinterpretar una regla de gobernanza para que el trabajo pase el gate**.
Se manifiesta cuando la regla que se reinterpreta no es el cap de líneas sino el
desacople de capas o `stamp.send`.

**Respuesta directa a tu pregunta ("¿regla mala o proceso que no la hace cumplir?").**
Ninguna de las dos. **La regla es ambigua y la ambigüedad se está usando como válvula
de escape.** Tres acciones, en este orden:

1. **Elegir una definición y borrar las otras dos.** Recomiendo la B con conteo crudo:
   los archivos de `/src/app` son páginas de composición y el límite ahí es
   contraproducente. Bajo B el número real es 17.
2. **Convertirla en gate ejecutable.** Un test que lea el árbol y falle si algún
   archivo del alcance supera el límite — el mismo patrón que ya usas para
   `vercel.json`. Una regla que ningún gate comprueba no es una regla.
3. **No refactorizar los 17 ahora.** Es deuda cosmética con riesgo de regresión, y
   estás a semanas de producción.

### 2.2 Otras contradicciones documentales

| Contradicción | Quién gana | Por qué |
|---|---|---|
| `.clinerules §3` dice `stamp.send: false` en sandbox; el flujo de nota crédito exige `true` siempre | **La nota crédito** | Resolución DIAN 000042. `.clinerules` no menciona la excepción y debería |
| `.clinerules §2` manda `npm run lint` como tercer gate; el proceso real usa `next build` | **`next build`** | `lint` es un alias de `tsc --noEmit`. Ver §4.2 |
| `PROJECT_STATE.md:987` incluye `app/page.tsx` en la remediación del cap; `:1201` lo declara exento | **Sin resolver** | Es H-2 |
| Las copias del project knowledge divergen del repo (`.clinerules`: 4.205 bytes en repo vs 4.063 en la copia) | **El repo** | Ver abajo |

**Deriva del project knowledge.** La copia de `.clinerules` que hay en el conocimiento
del proyecto es una versión anterior al Chat 3 y todavía contiene la referencia rota a
`02_AGENT_WORKFLOW_RULES.md`. No hay mecanismo de sincronización. Es la misma clase de
fallo que H-1: **estado autoritativo viviendo en dos sitios sin reconciliación**.
Recomendación: vaciar el project knowledge de documentos de gobernanza y dejar el
repo como única fuente, ya que el workflow obliga a clonar de todos modos.

---

## 3. Bloque 5.2 — Evaluación del proceso

### 3.1 ¿Es sano que cada sesión descubra un fallo grave de la anterior?

**Con la evidencia del historial: sí lo fue hasta el Chat 7, y ha dejado de serlo.**

Separa las 16 sesiones en dos regímenes:

| Régimen | Sesiones | Cómo aparecían los fallos |
|---|---|---|
| Reactivo | 1–6 | Bugs encontrados al usar el sistema. 40+ fixes puntuales |
| Sistemático | 7–16 | Fallos encontrados por auditorías dirigidas que los buscaban |

Los hallazgos más graves del proyecto — el emisor sobrescrito (9), `emission-mode`
bloqueado para `employee` (14), ausencia de guards (13), CSP ausente (8) — **fueron
todos encontrados por auditorías, no por sesiones de trabajo**. Eso no es un proceso
con un agujero: es un proceso de auditoría funcionando exactamente como debe.

El dato que cierra el argumento es el hallazgo #1 de este informe. **Nueve métricas,
cero desviaciones.** La última vez que se auditó la fidelidad de `PROJECT_STATE.md`
(sesión 8) el resultado fue una mentira sobre la CSP. Hoy no hay ninguna. La curva va
en la dirección correcta.

**El agujero real no es de detección, es de propagación.** H-1 lo demuestra: el
conocimiento se genera (Chat 11 produjo `EVIDENCIA_APIS.md`) pero no se ancla donde el
proceso lo va a leer. La pregunta correcta no es "¿por qué aparecen fallos nuevos?"
sino "**¿por qué el conocimiento generado no llega a la siguiente sesión?**".

### 3.2 ¿Qué clase de fallo escapa sistemáticamente a los gates?

Los cuatro fallos que citas comparten una firma exacta:

| Fallo | Compila | Tests pasan | Build pasa | Por qué escapó |
|---|---|---|---|---|
| Emisor sobrescrito | ✅ | ✅ | ✅ | Un handler HTTP válido, solo que el equivocado |
| `emission-mode` 403 para `employee` | ✅ | ✅ | ✅ | Cruce de dos configuraciones correctas por separado |
| Sin guards en handlers | ✅ | ✅ | ✅ | Ausencia de código, no presencia de código malo |
| CSP ausente en `vercel.json` | ✅ | ✅ | ✅ | Fuera del alcance de los tres gates |

**La clase es: fallos de comportamiento extremo a extremo bajo una identidad concreta.**
Ninguno es un error de tipos, de unidad ni de compilación. Los tres gates verifican
*forma*; ninguno verifica *que el sistema hace lo que debe cuando lo usa una persona
real con un rol real*.

**El control que falta es uno solo: un smoke test de emisión autenticado.** Un test
que, con credenciales de rol `employee`, arranque la app, haga login, recorra
`GET /api/consultations` → `GET /api/emission-mode` → `POST /api/invoices` contra un
Siigo simulado, y **asegure que el payload saliente lleva `stamp.send: true`**.

Ese único test habría atrapado tres de los cuatro. El cuarto (CSP) ya está cubierto
por `vercelSecurityHeaders.test.ts`, que es exactamente el patrón correcto y debería
generalizarse. Cuesta menos que una sesión y es el mayor retorno disponible.

### 3.3 ¿La atomicidad por sesión ayuda o fragmenta?

**Ayuda, y el Chat 6b lo demuestra a favor, no en contra.**

Aislar una línea de cabecera en su propia sesión parece desproporcionado hasta que se
recuerda el criterio con el que se aisló: es el único cambio que puede romper
producción sin fallar ningún gate. Eso no es una regla de tamaño, es **una regla de
observabilidad**, y está bien formulada. El resultado fue el test de forma sobre
`vercel.json`, que es la mejor pieza de infraestructura de verificación que tiene el
proyecto.

**El riesgo de la atomicidad no es la fragmentación, es el coste fijo por sesión.**
Cada sesión paga clonado, tres gates, lectura de gobernanza y actualización de
`PROJECT_STATE.md`. Con 16 sesiones eso ya es una fracción grande del esfuerzo total.
Mitigación: mantener la atomicidad para cambios que tocan emisión, autorización o
cabeceras; agrupar libremente el resto.

### 3.4 ¿ZIP + `rsync` + PR sigue siendo adecuado con 85 archivos?

**Sí, y no es donde está el problema.** El flujo entrega archivos completos, que es la
decisión correcta — el incidente del emisor sobrescrito vino de un diff parcial, no de
un ZIP. Con 85 archivos y sesiones que tocan entre 3 y 8, el volumen no es la
limitación.

**Lo que sí falta es CI.** Sin GitHub Actions, los tres gates dependen de que tú los
corras y de que el agente reporte la verdad. Un workflow que corra `tsc` + `vitest` +
`next build` en cada PR cuesta unos 15 minutos de configuración y convierte los gates
de promesa en hecho verificable. **A estas alturas, correr los gates a mano no es
aceptable**: es el único punto del proceso donde un fallo silencioso depende de la
disciplina humana en vez de la máquina.

---

## 4. Bloque 5.3 — Seguridad, a nivel de postura

### 4.1 Next.js 14.2.35 — la prioridad es correcta, y por una razón que no habías escrito

**Confirmado externamente:**

- Next.js 14 dejó de tener soporte de seguridad el **26 de octubre de 2025**. Su
  última versión es 14.2.35 (11 de diciembre de 2025).
- **Next.js 15 pierde el soporte el 21 de octubre de 2026** — dentro de seis semanas.
- Next.js 16 es la LTS activa; la última es 16.3.4 (31 de agosto de 2026).
- Los mantenedores han declarado que **no hay parches planeados para 13.x ni 14.x**.

**El argumento que te faltaba: migrar a 15.x es tirar el trabajo.** Caduca antes de
que la clínica esté facturando de forma estable. **16.3.4 es el único destino
racional**, y eso convierte la migración en un salto de dos mayores, no de uno.

Confirmado además que `npm audit fix --force` **sigue armado**: el audit actual
propone literalmente instalar `next@16.3.4` como cambio incompatible. La prohibición
absoluta de `PROJECT_STATE.md` sigue siendo necesaria hoy, no es histórica.

**Veredicto sobre la prioridad: correcta.** Es lo único del backlog que empeora solo
con el paso del tiempo.

### 4.2 CVE-2026-44581 — la justificación escrita necesita reescribirse

**Rango afectado confirmado:** `>= 13.4.0 < 15.5.16` y `>= 16.0.0 < 16.2.5`.
14.2.35 está dentro. Severidad 4.7, vector `CVSS:3.1/AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N`.

Reproducido por ti sobre el commit actual: el reenvío del nonce de la cabecera de
petición es **incondicional**; `GET /login` con una cabecera CSP manipulada produce
5 breakouts `<script>` por respuesta. La exposición es real y no depende de que la
aplicación opte por usar nonces.

**Lo que sostiene la aceptación es únicamente la ausencia de caché compartida**, y
`PROJECT_STATE.md` debe **mostrar la cabecera medida** en vez de afirmarla:

```
/login → Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
```

**Mitigación provisional disponible que no está desplegada.** El propio advisory
recomienda filtrar la cabecera `Content-Security-Policy` entrante del tráfico no
confiable. `vercel.json` no puede hacerlo (solo emite cabeceras de respuesta);
tendría que ir en `middleware.ts`. **No lo recomiendo:** la migración a 16 lo cierra
igual, ya es la siguiente sesión, y añadir lógica al middleware justo antes de
migrarlo es trabajo que se tira.

### 4.3 H-3 — La CSP report-only no tiene dónde reportar

**Qué observé.** El valor de `Content-Security-Policy-Report-Only` en `vercel.json`
**no contiene `report-uri` ni `report-to`** (verificado: 0 coincidencias).

**Riesgo real.** La fase 2 está explícitamente bloqueada hasta confirmar "una ventana
limpia en report-only". Tal como está configurada, **esa ventana no se puede
observar**: las violaciones solo aparecen en la consola de devtools de cada navegador,
por usuario y por sesión. Nadie va a ver la violación que ocurre en el portátil de una
recepcionista un martes a las 19:00.

Se manifiesta el día que decidas activar el header enforcing basándote en una ausencia
de evidencia que en realidad era ausencia de instrumentación, y rompas la interfaz de
facturación en producción — que es exactamente el escenario que la sesión 6b existió
para prevenir.

**Recomendación.** Antes de la fase 2, una de estas dos:

1. Añadir `report-to` con un endpoint de recolección (una route handler propia que
   escriba en Postgres es suficiente y encaja con la arquitectura actual).
2. O declarar explícitamente que la validación será manual: recorrer las 20 rutas con
   devtools abierto, documentar el recorrido en `PROJECT_STATE.md` y aceptar la
   cobertura parcial.

Lo que no es aceptable es dejar la condición de salida escrita como si fuera medible
cuando no lo es. **Esta es la misma clase de fallo que la CSP ausente de la sesión 8:
un documento afirmando un control que no existe.**

### 4.4 Credenciales compartidas por rol — riesgo residual

Decisión cerrada; no la re-litigo. El riesgo residual, dicho con precisión:

**No se puede atribuir una emisión a una persona.** Para un sistema que produce
documentos con validez fiscal ante la DIAN, esto significa que ante una factura
emitida por error, un cobro duplicado o una anulación indebida, **la respuesta a
"¿quién lo hizo?" es "el rol `employee`", que son 2 o 3 personas**.

Cuándo importa: no en la operación diaria. Importa el día de una disputa con un
cliente, una revisión de la DIAN o un despido. Con la retención de logs actual
(§4.5) ni siquiera queda el rastro técnico.

**Mitigación barata sin cambiar el modelo de sesión:** la tabla `invoices` ya tiene
`form_snapshot` (jsonb). Añadir un campo de identificación operativa — que la
recepcionista seleccione su nombre en el drawer, sin autenticación — da atribución
suficiente para una disputa interna a coste casi nulo. No es control de acceso; es
trazabilidad, que es lo que realmente falta.

### 4.5 D1 (hashing) — el diagnóstico es peor de lo que dice el backlog

Verificado en `src/services/auth.ts:44-72`: **SHA-256 sin sal, sin coste**
(`sha256(value)` → base64url, comparación en tiempo constante).

El backlog lo trata como deuda de formato. No lo es: SHA-256 sin sal ni factor de
trabajo es **vulnerable a tablas precomputadas y a fuerza bruta trivial** si el hash
se filtra. Y los hashes están en variables de entorno de Vercel, que es donde la
auditoría de la sesión 8 ya encontró contraseñas en claro.

Dicho esto, **la mitigación del riesgo depende de la longitud de la contraseña, no del
algoritmo**: una contraseña de 20+ caracteres aleatorios es inatacable incluso con
SHA-256 sin sal. **Recomendación:** en vez de la ventana de despliegue que el backlog
contempla, regenerar hoy las dos contraseñas como cadenas largas aleatorias, y bajar
D1 de "pendiente con ventana" a "deuda real pero no urgente". Cuesta diez minutos y
elimina el riesgo práctico sin invalidar credenciales.

### 4.6 RLS y guards — estado confirmado

- **RLS no protege nada.** Confirmado por diseño: conexiones `pg` directas con un rol
  que la salta. Correctamente documentado.
- **D0 está cerrado.** Verificado: **13 de 13** `route.ts` bajo `src/app/api`
  referencian el guard de sesión. Cobertura completa.
- **13 archivos declaran `force-dynamic`.** Coherente con las 4 páginas estáticas y
  con la decisión DP2.

---

## 5. Bloque 5.4 — Las dos integraciones

### 5.1 Siigo — cuatro cosas del dump que no están en `EVIDENCIA_APIS`

**S-1. La documentación de Siigo se contradice a sí misma, dos veces.**

| Campo | Sección "Idempotencia" | Error `invalid_idempotency-key` |
|---|---|---|
| Longitud máxima | **30** caracteres | **32** caracteres |

Y sobre fechas: la tabla de campos dice que una factura electrónica no puede ser
anterior a la fecha actual; `invalid_date` habla de un margen de **10 días arriba o
abajo** y a renglón seguido repite que no se admite fecha anterior a hoy.

**Acción:** ninguna al código. Registrar en `EVIDENCIA_APIS.md` que se elige
deliberadamente el límite más restrictivo (30 caracteres, fecha de hoy en
`America/Bogota`) **porque la fuente es ambigua**, no porque sea el único valor
posible. Ahora mismo esas dos decisiones parecen arbitrarias para quien las lea.

**S-2. Colisión no resuelta entre `sum_total` y el cálculo de Siigo.**
`invalid_total_payments` documenta el algoritmo exacto que Siigo aplica:

```
ValorBase = Redondear(Cantidad × ValorUnitario − Descuento, 2)
IVA       = Redondear(ValorBase × %IVA / 100, 2)
TotalItem = Redondear(ValorBase + IVA, 2)
```

Tu regla —correcta y verificada contra 33 consultas— es leer `invoicerow.sum_total`
**literal**. Siigo **recalcula desde `quantity` y `price`**. Ambas reglas son correctas
por separado y **pueden discrepar por redondeo**. Nada en el código reconcilia las dos
antes del POST.

**Cuándo se manifiesta:** en la primera emisión real donde una línea tenga descuento o
un IVA que no redondee limpio. El síntoma será `invalid_total_payments`, que la capa
de traducción presenta como un problema de datos del cliente — enviando a la
recepcionista a corregir un NIT que está bien.

**S-3. §1.9 (el saneado de comillas) es parcialmente respondible sin experimento.**

- `invalid_code`: expresión regular `^[^'\s]+$` → el **código** no admite comilla
  simple ni espacios.
- `invalid_description` / `invalid_name`: el conjunto permitido **excluye `'`** pero
  **incluye `"`**.

Conclusión: la comilla simple sí se rechaza; la doble parece admitida. `sanitizeText()`
es **sobre-restrictivo pero seguro**, y la justificación escrita en el código ("Siigo
rechaza comillas") es *imprecisa, no falsa*. La inconsistencia real sigue siendo un
bug: las líneas de factura sanean, las de nota crédito (`src/mappers/creditNote.ts:44`)
no.

**S-4. Correcciones a mi propio análisis previo.** El bloqueo de usuario al 80% de
errores durante 7 días **sí está documentado** (`PROJECT_STATE.md:1023`), igual que
`invalid_dian_resolution` (`:1021`). Me equivoqué al reportarlos como ausentes.

**Sigue sin estar documentado:** `customer_settings` — el tercero debe tener contactos
creados en Siigo o la creación del documento falla. Es una precondición de datos que
la recepción no puede diagnosticar desde el drawer.

**Sobre notas crédito:** `invalid_document` documenta que si el comprobante tiene
marcación electrónica, **debe haberse enviado a la DIAN para poder aplicarle nota
crédito**. Eso confirma tu §1.8 y le da la causa: no es falta de datos, es una
precondición legal del flujo. Cierra la pregunta de por qué las notas crédito no se
han podido probar nunca.

### 5.2 Provet — la documentación sí es accesible, y contiene cosas que cambian el diseño

**Corrección a la premisa de §5.4 del prompt:** `developers.provetcloud.com` es
Sphinx plano, indexado y recuperable por completo. Incluye changelog con RSS y una
página de cambios incompatibles anunciados. **No hay cambios incompatibles planeados
actualmente.** Suscribirse a ese RSS es la captura de evidencia que tu §4 pide y que
hoy no está automatizada.

#### P-1 — El disparador entrante de anulación no existe (hallazgo nuevo)

**Qué observé.** El camino **saliente** está construido: `page.tsx:212/219/281` →
`POST /api/credit-notes`. Lo que no existe es el disparador **entrante**.

El patrón que Provet recomienda para integraciones contables es consultar facturas
finalizadas modificadas desde la última marca de tiempo, y después traer sus líneas.
Tú polleas `/consultation/`. Confirmado por grep: **cero apariciones** de
`status__is`, `credit_note` (como campo de Provet), `credited_invoicerow`.

El ciclo de vida de la factura en Provet incluye el estado 99 (anulada), y las notas de
crédito son **registros de factura nuevos marcados con `credit_note=true`**. Existen
además los triggers 23 (línea de factura borrada) y 60 (cargo extra tras la
finalización). Nada de eso llega a la integración.

**Las dos ramas, con su coste:**

| Rama | Condición | Severidad | Coste |
|---|---|---|---|
| **A** | La clínica anula alguna vez **en Provet** | **Bloqueante duro** | 1 sesión: poll de `/invoice/?credit_note__is=true&modified__gte=` + cola de anulaciones pendientes en la UI |
| **B** | Recepción anula **siempre en la app** | **Deuda con control de procedimiento** | ~0 código. Procedimiento escrito + firmado por el dueño, y `PROJECT_STATE.md` registrando que la corrección depende de una convención humana |

**Por qué A es bloqueante duro y no deuda:** una factura timbrada ante la DIAN cuya
anulación ocurrió solo en Provet deja un documento con validez fiscal vigente por una
operación que la clínica considera revertida. Es exactamente el fallo silencioso con
consecuencia legal que define el proyecto. La rama B no elimina el riesgo: lo traslada
a una convención humana en un equipo de 3 personas con credenciales compartidas.

**Mi recomendación aunque la respuesta del dueño sea B:** implementar A de todas
formas, pero solo como **detector**, no como emisor automático. Un poll que marque
"esta factura fue anulada en Provet y su nota crédito DIAN está pendiente" cuesta
mucho menos que el flujo completo y convierte un fallo silencioso en uno ruidoso.
Encaja exactamente con "fail loudly, never silently".

#### P-2 — Dos fuentes de verdad para el total, sin comparación (reescrito)

**Qué observé.** `provetApi.ts:79-80` **sí lee** `total_vat` y `total_with_vat`.
El problema es de uso:

- `provetToQueue.ts:145` toma el total **mostrado** de `invoice.total_with_vat`.
- `provetToQueue.ts:116` toma las **líneas** de `r.sum_total`.
- **Cero comparaciones entre ambos en todo el código.**
- `provetToQueue.ts:117`: `if (!Number.isFinite(lineTotal) || lineTotal <= 0) continue;`

**Riesgo real.** Ese `continue` **descarta en silencio descuentos y líneas abonadas**
que el total mostrado sigue contando. No es un assert ausente: es un **generador
activo de divergencia** entre lo que la recepcionista ve en la cola y lo que se envía
a Siigo. Y como Siigo recalcula sus propios totales (S-2), el error se manifiesta
como un rechazo cuya causa no apunta al origen.

**Cuándo:** la primera consulta con un descuento aplicado. Dado que la clínica hace
descuentos como cualquier negocio, esto es cuestión de días tras el arranque.

**Recomendación (la de mayor retorno de todo el informe).** Una comprobación previa a
la emisión: la suma de las líneas construidas debe cuadrar con `invoice.total_with_vat`
dentro de la tolerancia de redondeo. Si no cuadra, **bloquear con mensaje explícito**
en vez de emitir. Esto cierra P-2 y S-2 con el mismo control, y es un test unitario
puro sobre `provetToQueue`. **Media sesión.**

#### P-3 — Campos de `invoicerow` que el código no lee

Confirmado por grep: **cero** apariciones de `credited_invoicerow` e
`invoicable_quantity`. La respuesta documentada de `invoicerow` incluye además
`first_credit_invoicerows`, `percentage_change`, `additional_tax_percentage`,
`royalty_fee`, `calculated_price_with_vat` e `is_dispense_fee_item`.

**El crítico es `credited_invoicerow`:** una línea ya abonada en Provet que se facture
igual **es sobrefacturación**, y `invoicable_quantity` no es necesariamente igual a
`quantity`. Ambos entran en el mismo control de P-2.

#### P-4 — Provet también tiene bloqueo de periodo contable

Confirmado por grep: **cero** apariciones de `financial_period_lock`.

`GET /api/0.1/settings/department/<id>/` expone `financial_period_lock_date` —la fecha
más temprana permitida para cualquier factura, pago o nota de crédito nueva— más un
indicador de avance automático mensual. Es el gemelo del `blocked_transactions` de
Siigo, que sí está contemplado.

**Cuándo se manifiesta:** en la frontera de mes, si el bloqueo automático está
activado. Una nota crédito sobre una factura del mes anterior será rechazada por
Provet con un error de validación que la capa de traducción no conoce. **Deuda, no
bloqueante** — pero conviene añadir el mensaje a la tabla de traducción antes del
primer cierre de mes.

#### P-5 — El 403 de `/item/` puede tener salida

El release de Provet del 2026-09-03 añadió `price_with_vat` a `/item/`, `/medicine/`,
`/procedure/`, `/supply/`, `/food/`, `/laboratoryanalysis/` y
`/laboratoryanalysispanel/`. **Los catálogos por tipo son endpoints distintos de
`/item/`** y pueden no estar bajo el mismo permiso.

Los endpoints de exportación que mencionas —`POST /item/export/start/` y
`GET /item/export/status/`, añadidos el 2026-08-20— cuelgan del mismo recurso `/item/`
y **probablemente comparten el 403**. Pruébalos, no los asumas.

**Coste de la prueba: cinco minutos con el token actual.** Si `/medicine/` responde
200, el bloqueante "catálogo maestro atado a `PROVET_SYNC_WINDOW_DAYS`" desaparece sin
esperar a que Provet habilite nada.

#### P-6 — La paginación puede estar costando de más

Los límites de Provet son **por endpoint**, en ventana deslizante de 60 segundos, con
cabecera `Retry-After`. `GET /invoice/` (listado) admite 60 peticiones por minuto.

**El detalle no obvio:** un `page_size` grande consume peticiones en proporción al
tamaño por defecto. El peso es `ceil(page_size solicitado / page_size por defecto)`;
pedir 500 cuando el defecto es 50 cuenta como **10 peticiones**. Y por encima de
10.000 registros de desplazamiento conviene filtrar por `id__gt` en vez de paginar.

Si la sincronización usa un `page_size` grande para ahorrar viajes, **no está
ahorrando presupuesto de rate limit**. Verificable en una lectura de
`src/services/provetApi.ts`.

#### P-7 — Provet tiene mecanismo nativo de write-back

Confirmado por grep: **cero** apariciones de `external_info`.

El objeto `external_info` (con `external_id` y `metadata`) permite escribir el
identificador del documento en el sistema externo, para saltarse en corridas
posteriores los registros ya procesados. Está documentado sobre pagos no asignados.

**Si también existe en `invoice`, es un ancla de idempotencia más robusta que la tabla
`invoice_claims`**: vive en el sistema origen, sobrevive a una pérdida de la base de
datos y es visible para cualquier otra integración. No propongo migrar ahora —
`invoice_claims` funciona y está probado — pero merece registrarse como alternativa
antes de que la deuda se consolide.

#### Confirmaciones (no cambiar nada)

- El trigger **45 es "Consultation finalized"**. `01_PROJECT_REQUIREMENTS §1.2.1` es
  correcto.
- 429 con `Retry-After`, ventana deslizante de 60 s, límites por endpoint. `EVIDENCIA
  §2.4` es correcto.
- El enum autoritativo para el mapeo de pagos es `invoicepayment.payment_type`:
  0 tarjeta, 1 efectivo, 2 transferencia, 3 redondeo, 4 cheque, 5 vale, 6 factura
  consolidada, 7 pago móvil, 9 tarjeta regalo, 10 financiera, 11 otro, 12 factura de
  crédito, 15 reclamación de seguro. El 8 (prepago) no se acepta en ese endpoint.

---

## 6. Bloque 5.5 — Infraestructura

### 6.1 Vercel Hobby — no es "probablemente"

El texto de las guías de uso razonable de Vercel es inequívoco: los equipos Hobby
están restringidos a uso personal no comercial, y el uso comercial se define como
cualquier deployment usado para el beneficio económico de **cualquiera** implicado en
**cualquier parte** de la producción del proyecto, incluido explícitamente
*"a paid employee or consultant writing the code"*. Entre los ejemplos listados figura
recibir pago por crear, actualizar u hospedar el sitio.

**Se cumplen dos condiciones independientes:** te pagan por construirlo, y el sitio
procesa facturación de un negocio. Baja esto de "evaluar la urgencia" a **bloqueante
de terceros**, porque solo el dueño de la clínica puede contratar el plan.

**Coste de no hacerlo:** no es una multa, es **una pausa**. Hobby no tiene facturación
por exceso; cuando se supera un límite la funcionalidad se pausa hasta que la ventana
de 30 días se reinicia. Una pausa del servicio de facturación electrónica de una
clínica no es un incidente técnico, es días sin poder facturar legalmente.

### 6.2 Logs — Pro no resuelve el problema

| Plan | Retención de runtime logs |
|---|---|
| Hobby | **1 hora** |
| Pro | **1 día** |
| Enterprise | 3 días |

**Corrección al backlog:** "subir a Pro" está identificado como el destino correcto, y
lo es por el ToS. Pero **no resuelve la trazabilidad fiscal**. Un fallo de emisión el
viernes por la tarde sigue siendo indiagnosticable el lunes por la mañana con 1 día de
retención.

**La respuesta correcta son dos cosas, no una:**

1. **Pro** — por cumplimiento del ToS. Bloqueante de terceros.
2. **Un log drain a un destino externo, o Observability Plus** (que ofrece retención
   de 30 días) — por trazabilidad fiscal. Deuda real.

Nota: la tabla `invoices` ya conserva `form_snapshot` y `observations`, así que el
rastro *de negocio* de cada emisión sí persiste. Lo que se pierde es el rastro
*técnico* del fallo. Eso baja la urgencia de (2) pero no la elimina.

### 6.3 `maxDuration` — corrección a `EVIDENCIA_APIS §3.1`

**`EVIDENCIA_APIS §3.1` está obsoleto.** Afirma que las funciones cortan entre 10 y 60
segundos. Con Fluid compute los límites actuales son: Hobby 300 s por defecto y como
máximo; Pro y Enterprise 300 s por defecto, 800 s de máximo.

El razonamiento derivado —sin estado compartido entre invocaciones, luego polling en
vez de SSE— **sigue siendo válido**. La cifra no.

Confirmado: **`vercel.json` no contiene ningún bloque `functions` ni `maxDuration`**.
Siigo recomienda esperas de 120 segundos para la creación de comprobantes, porque en
picos algunas transacciones tardan más de lo normal. Con 300 s por defecto eso cabe —
**siempre que Fluid compute esté activo en el proyecto**, lo cual no puedo verificar
desde el repo. Ver §7.

### 6.4 CI — el punto más débil del proceso

Sin GitHub Actions, los tres gates dependen de disciplina humana. Es el único lugar
del proceso donde un fallo silencioso no tiene defensa mecánica. Ver §3.4.

---

## 7. Backlog reordenado

### 7.1 Bloqueantes duros — sin esto no se puede emitir legalmente

| # | Qué | Por qué bloquea | Coste |
|---|---|---|---|
| **B1** | **Verificar la forma real del `stamp` con CUFE** | El `.transform()` devuelve `cufe: ""` y `status: "Draft"` sin lanzar si los campos se llaman distinto. Una factura aceptada por la DIAN se mostraría como borrador, **sin aviso**. Es el fallo silencioso de mayor consecuencia del proyecto | Depende de B2 o de resolver §1.2 |
| **B2** | **Primera emisión real con `stamp.send: true`** y captura del JSON crudo | Cierra B1, la forma del payload de nota crédito y la restricción de año fiscal de golpe | 1 sesión tras tener credenciales |
| **B3** | **Reconciliación de totales previa a la emisión** (P-2 + P-3 + S-2) | El `continue` de `provetToQueue.ts:117` descarta descuentos y líneas abonadas que el total mostrado sí cuenta. Sobrefacturación o rechazo opaco desde el primer descuento | **Media sesión** |
| **B4** | **P-1 rama A**, si el dueño confirma que se anula en Provet | Factura timbrada ante la DIAN sin su nota crédito | 1 sesión (o ~0,3 si solo detector) |

### 7.2 Bloqueantes de terceros — no dependen de ti

| # | Qué | De quién depende |
|---|---|---|
| **T1** | Credenciales de producción de Siigo y Provet | Dueño de la clínica |
| **T2** | Resolución DIAN activa y `documentTypeId` de la cuenta (60345 / FV-3) | Dueño de la clínica |
| **T3** | **Plan Vercel Pro** — el ToS se incumple hoy por dos vías | Dueño de la clínica |
| **T4** | Plan de Supabase con backups | Dueño de la clínica |
| **T5** | Permiso de Provet para `/item/` — **puede que innecesario, ver P-5** | Provet, o nadie si P-5 funciona |
| **T6** | Respuesta sobre dónde se anula (rama A o B de P-1) | Dueño de la clínica |

### 7.3 Deuda real que puede esperar

| # | Qué | Nota |
|---|---|---|
| **D-a** | **Migración a Next.js 16.3.4** | Empeora sola con el tiempo. **Primera después de los bloqueantes**, y saltando 15.x por completo |
| **D-b** | CSP fase 2 — **precedida por H-3** (endpoint de recolección o validación manual documentada) | No activar el header enforcing sin resolver H-3 |
| **D-c** | **CI en GitHub Actions** | ~15 minutos. El mayor retorno por esfuerzo del backlog |
| **D-d** | **Smoke test de emisión autenticado** (§3.2) | Habría atrapado 3 de los 4 fallos que escaparon a los gates |
| **D-e** | Commitear `EVIDENCIA_APIS.md` y añadirlo a `.clinerules §1` (H-1) | Diez minutos |
| **D-f** | Unificar la definición del cap de 150 líneas y hacerla gate (H-2) | La regla, no los 17 archivos |
| **D-g** | D1 — contraseñas largas aleatorias hoy; cambio de algoritmo después | Reclasificado, ver §4.5 |
| **D-h** | Log drain u Observability Plus | Trazabilidad fiscal. Distinto de T3 |
| **D-i** | `financial_period_lock_date` de Provet (P-4) en la traducción de errores | Antes del primer cierre de mes |
| **D-j** | Sanear texto también en `creditNote.ts:44` (S-3) | Inconsistencia real |
| **D-k** | `customer_settings` en la tabla de traducción (S-4) | La recepción no puede diagnosticarlo hoy |
| **D-l** | Limpieza de las 2 filas `invoices` sin `claim` | Script ya preparado. Día del corte |
| **D-m** | `maxDuration` explícito en `vercel.json` | Tras confirmar Fluid compute (§7) |
| **D-n** | Suscribirse al RSS del changelog de Provet | Cinco minutos |

### 7.4 Cosas que ya no merece la pena arreglar

| Qué | Por qué borrarlo |
|---|---|
| **Refactorizar los 17–25 archivos que exceden 150 líneas** | Deuda cosmética con riesgo de regresión real, a semanas de producción. Arregla la **regla** (D-f), no los archivos. `errorTranslator.ts` a 282 líneas es un mapa de errores: partirlo lo empeora |
| **Mitigar CVE-2026-44581 en `middleware.ts`** | La migración a 16 lo cierra igual y es lo siguiente. Añadir lógica a un middleware que estás a punto de migrar es trabajo que se tira |
| **Migrar `invoice_claims` a `external_info` de Provet (P-7)** | `invoice_claims` funciona y está probado. Regístralo como alternativa; no lo ejecutes |
| **Perseguir el ruido de lockfile de `@next/swc-*`** | No bloquea, el build completa. Desaparece con la migración a 16 |
| **Migrar a Next.js 15.x como paso intermedio** | Pierde el soporte de seguridad el 21 de octubre de 2026 |
| **`POST /item/export/start/` como plan A para el catálogo** | Mismo recurso que el `/item/` que da 403. Prueba antes los catálogos por tipo (P-5) |

### 7.5 Estimación

**De 2 a 4 sesiones de trabajo tuyo**, con este margen de error explícito:

| Escenario | Sesiones | Condición |
|---|---|---|
| Optimista | **2** | B3 + P-1 rama B; B1/B2 se resuelven con las credenciales sin sorpresas; migración a 16 sin fricción |
| Central | **3** | B3, P-1 rama A como detector, y una sesión de migración a 16 con arreglos |
| Pesimista | **5+** | El `stamp` real no coincide con el esquema (B1 se materializa), o la migración de dos mayores rompe el App Router y el middleware |

**El margen está dominado por dos incógnitas, no por el volumen de trabajo:**

1. **B1.** Si la forma real del `stamp` coincide con lo modelado, son cero sesiones.
   Si no, es una sesión más un reproceso de todo lo emitido hasta detectarlo.
2. **T1–T3.** Nada de la ruta crítica avanza sin credenciales de producción. **Ese es
   el verdadero camino crítico, y no es código.**

**La conclusión honesta:** no estás lejos. Estás **bloqueado por terceros y por una
única incógnita técnica**, y llevas varias sesiones pagando el coste de un proceso
diseñado para encontrar problemas mientras el problema real es que nadie ha pedido las
credenciales. La conversación con el dueño de la clínica vale más que las próximas dos
sesiones de código.

---

## 8. Lista de verificación para Jean

Solo tú puedes comprobar esto. Comando o ruta exacta.

### Paneles

| # | Qué | Dónde exactamente |
|---|---|---|
| 1 | ¿Fluid compute activo? Determina si `maxDuration` puede pasar de 60 s | Vercel → Project → Settings → Functions |
| 2 | ¿Plan de Supabase, y tiene backups automáticos? En Free son cero | Supabase → Project → Settings → Database → Backups |
| 3 | ¿Hay contraseñas en claro todavía en variables de entorno? | Vercel → Project → Settings → Environment Variables |
| 4 | Confirmar el plan actual de Vercel y si hay aviso de uso | Vercel → Team → Settings → Billing |

### Siigo

| # | Qué | Cómo |
|---|---|---|
| 5 | **Cuál de los 74 tipos electrónicos pertenece a esta cuenta** | Entrar por web a Siigo Nube con las credenciales de sandbox y mirar el catálogo propio, sin el ruido de otros tenants. **No cambiar `documentTypeId` a uno de la lista global**: gastaría el consecutivo de otra empresa |
| 6 | Verificar el sospechoso de §1.2 | ¿Es `id=30640, code=312, "prueba fac elec"` el `documentTypeId` mapeado en `catalog_mapping`? Si lo es, el error `document_settings` se explica solo |
| 7 | ¿Existe resolución DIAN activa con rango vigente? | Siigo Nube → Configuración → Transacciones → Facturas |

### Provet — cinco minutos, con el token actual

| # | Qué | Comando |
|---|---|---|
| 8 | **P-5: ¿los catálogos por tipo esquivan el 403?** | `GET /api/0.1/medicine/`, `/procedure/`, `/supply/`, `/food/`. Si alguno da 200, T5 desaparece |
| 9 | P-5b: los endpoints de export | `POST /api/0.1/item/export/start/` |
| 10 | **P-4: el bloqueo de periodo** | `GET /api/0.1/settings/department/<id>/` → mirar `financial_period_lock_date` y `automatic_financial_period_lock_enabled` |
| 11 | **P-7: ¿`external_info` existe en `invoice`?** | `GET /api/0.1/invoice/` → mirar la cabecera de campos expuestos de la página del endpoint |
| 12 | P-1: ¿hay ya notas de crédito en la cuenta? | `GET /api/0.1/invoice/?credit_note__is=true` — si devuelve filas, **la rama A es la real** y no hace falta preguntar |

### Al dueño de la clínica

| # | Pregunta | Qué desbloquea |
|---|---|---|
| 13 | **¿Anulan alguna vez desde Provet, o siempre desde la app?** | La rama de P-1. La verificación 12 puede responderla sin preguntar |
| 14 | Pedir credenciales de producción de Siigo y Provet | T1, T2, y con ellas B1 y B2 |
| 15 | Explicar por qué Vercel Pro no es opcional (§6.1) | T3 |
| 16 | Plan de Supabase con backups | T4 |

### Código — verificable por ti en una lectura

| # | Qué | Dónde |
|---|---|---|
| 17 | **P-6: ¿qué `page_size` usa la sincronización?** | `src/services/provetApi.ts`. Si es grande, no está ahorrando rate limit |
| 18 | Confirmar que los hashes de contraseña son largos y aleatorios | Variables de entorno; ver §4.5 |

---

## 9. Nota final sobre el método

Pediste que dijera sin suavizarlo si algo de lo que llevas 16 sesiones haciendo es una
pérdida de tiempo.

**No lo es, con una excepción y una advertencia.**

La excepción es el cap de 150 líneas, que ha consumido esfuerzo en varias sesiones,
tiene tres definiciones incompatibles y ningún gate que lo verifique. Arregla la regla
o bórrala; lo que no puede seguir es citándose como cumplida.

La advertencia es más importante. El proceso está optimizado para **encontrar
problemas**, y es bueno en eso: nueve métricas verificadas, cero desviaciones, y los
cuatro fallos graves del proyecto los encontró él mismo. Pero el camino crítico hacia
producción no está hecho de problemas por encontrar. Está hecho de **una llamada al
dueño de la clínica**.

Un proceso de auditoría sin un final definido puede producir hallazgos
indefinidamente. Los de este informe son reales, pero solo cuatro son bloqueantes, y
dos de esos cuatro se resuelven con la misma emisión real. **Define el criterio de
terminación ahora**: primera factura timbrada con CUFE capturado, reconciliación de
totales activa, y Next.js 16. Todo lo demás es mantenimiento de un sistema en
producción, no trabajo previo a ella.
