# Sesión 2 — Ruta crítica de la factura (C-1 … C-7)

**Generado por:** sesión 1, el 2026-09-10.
**Commit base:** el merge de la sesión 1 (`sesion1/next16-react19`) sobre `main`.
**Este archivo es lo único que hace falta para abrir el chat.**

---

## 0. Antes de escribir una línea

Clona fresco y lee los **siete** documentos de `.clinerules §1`. Todos están en la
raíz del repo. Ninguno vive en el conocimiento del Project — si encuentras una
copia allí, ignórala.

**Confirma el HEAD antes de nada.** Debe ser el merge de la sesión 1. Si no
coincide, **no pares automáticamente: mide el delta primero**. Eso es lo que pasó
al abrir la sesión 1 — el HEAD real estaba 2 commits por delante del que asumía el
prompt, y el delta eran 1675 líneas de documentación con **cero** archivos bajo
`src/`, `package.json` o el lockfile. El baseline se re-midió y coincidió al
dígito. **La regla correcta es: compara `git diff --name-only <base>..HEAD` y
decide con eso, no con el hash.**

---

## 1. Alcance congelado

### Entra — los ocho hallazgos de la ruta crítica

| # | Origen | Qué |
|---|---|---|
| **C-1** | nuevo 2026-09-10 | **Omisión de abonos de Provet.** `provetToQueue.ts:105-115` arma `consultationByInvoiceId` desde `inv.consultation`, que es `null` en toda nota de crédito → el documento entero desaparece. Medido: factura 5 = 1699.04 con abono de 125.00 sobre `invoicerow/3` → la cola factura **1699.04 en vez de 1574.04**. Sobrefacturación con validez fiscal. El join correcto es `credited_invoicerow` → fila → factura → consulta. Evidencia: `EVIDENCIA §2.8` |
| **C-2** | N5 | `provetToQueue.ts:117` — `if (lineTotal <= 0) continue` descarta filas en silencio. **CUANTIFICADO el 2026-09-11: 7 de 52 facturas del tenant no cuadran, y en las 7 la causa es esta.** El caso que importa es la **factura 12**: `total_with_vat` 158.28 contra los **187.50** que emitiría el código → **+29.22 de sobrefacturación** en un documento positivo que **no** es nota de crédito. Las facturas **10** y **32** traen total negativo **sin** ser NC. Las otras cuatro (16, 17, 19, 31) son NC que el código deja en 0.00. **Fix distinto al de C-1.** Justificación exacta: "descarta filas negativas reales"; **no** "descarta descuentos", que sigue sin verificar |
| **C-3** | N16 **ampliado** | Tres fallos en la misma costura. (a) `QuickEditDrawer.tsx:56` — `balanced` compara `detail.total` contra lo tecleado, nunca contra `sumLineTotals`. (b) `values.paidAmount` no llega al payload. (c) **`formatCOP` redondea al mostrar**: `consultationQueue.ts:38` usa `maximumFractionDigits: 0`, así que **33.5 se pinta `$34`** y 32.5 → `$33`. La cola imprime el número crudo y el drawer lo pasa por `formatCOP`: **el mismo importe sale como 33.5 en una pantalla y $34 en la otra** (consulta 39 del tenant). Muerde en `QuickEditDrawer.tsx:134`, el monto que el staff teclea para cuadrar. **El payload a Siigo NO está afectado** |
| **C-4** | N17 | `invoiceReconciliation.ts:92-94` — `created_end` sin hora se interpreta `T00:00:00` y excluye la factura del día → devuelve `null` → la ruta lo lee como "no existe" y **emite una segunda factura timbrada**. Idéntico en `GET /v1/credit-notes` |
| **C-5** | N7 | `duplicated_document` llega como 400 y `provablyCreatedNothing` lo trata como "no se creó nada". Es el único 4xx que significa lo contrario |
| **C-6** | N6 | La `X-Idempotency-Key` se valida **después** de tomar el claim: una clave malformada deja la consulta en `unknown` sin haber tocado Siigo |
| **C-7** | N18 | Reconciliación truncada a 500 documentos: "no lo encontré" se convierte en "no existe" |
| **C-11** | nuevo 2026-09-11 | **Assert `sum(invoicerow.sum_total) == invoice.total_with_vat` por consulta, fail-loud.** Hoy el total mostrado sale de `total_with_vat` y las líneas de `sum_total`, **sin una sola comparación entre ambos en todo el código** — `EVIDENCIA §2.6` lo llama el control de mayor retorno del backlog. Es el guard que detectó las 7 facturas de C-2. **Se construye ANTES de tocar C-1 y C-2**: arreglar esos dos cambia la suma, y este assert es lo que demuestra que quedó bien |

**Uno a la vez, con los tres gates completos entre hallazgo y hallazgo.** Orden
**obligatorio al principio**: **C-11 primero** — es el guard que demuestra que
los dos siguientes quedaron bien. Luego C-1 → C-2 (mismo archivo, fixes
distintos, **no los fusiones**). Después, orden sugerido: C-4 → C-7 (misma
familia: reconciliación que miente) → C-5 → C-6 → C-3.

### Decisión de formato ya tomada por Jean — no se relitiga

**La UI nunca redondea.** `formatCOP` pasa a mostrar **siempre dos decimales**,
también en importes enteros. Formato es-CO, verificado ejecutándolo:

| Valor | Se pinta |
|---|---|
| 33.5 | `$33,50` |
| 1500 | `$1.500,00` |
| 1699.04 | `$1.699,04` |
| −29.22 | `$-29,22` |

Tres avisos al implementarlo:

1. **No basta con cambiar `maximumFractionDigits`.** Hay **tres** llamadas a
   `formatCOP`: dos en `QuickEditDrawer.tsx` (líneas 134 y 148) y una en
   `InvoiceSnapshotDrawer.tsx:70`. El snapshot es el delicado: muestra lo **ya
   emitido**, así que el número en pantalla debe coincidir exactamente con el del
   documento timbrado.
2. **Caen tests.** `consultationQueue.test.ts` fija el formato actual. Revisar
   uno por uno si el test estaba bien o blindaba el bug — no adaptarlos en bloque.
3. **El signo queda como `$-29,22`, no `-$29,22`.** Con C-2 arreglado las filas
   negativas pasan a ser visibles, así que hay que decidir dónde va el signo.
   Decisión de UI pendiente: no la tomes sin preguntar a Jean.

### NO entra — explícito

| Qué | Por qué |
|---|---|
| `middleware.ts` → `proxy.ts` | Decisión de plataforma nº 6. Sesión 4 (A-4) |
| C-8, C-9, C-10 (nota crédito) | Sesión 3. C-9 (borrar los 23 tests del contrato inventado) va **antes** de tocar el mapper, y eso es trabajo de la sesión 3, no de esta |
| A-1 … A-4, H-*, P-* | Sesiones 4 en adelante |
| Cualquier bump de dependencia | La sesión 1 acaba de mover `next` y `react`. **No se tocan `package.json` ni el lockfile en esta sesión** |
| `vitest.config.ts` | Sigue congelado. Ver §3 |
| `vercel.json` | Sesión 6 |

---

## 2. Estado verificado — medido en la sesión 1, re-mídelo igualmente

| Gate / métrica | Valor esperado |
|---|---|
| `npx tsc --noEmit` | sin salida, exit 0 |
| `npx vitest run` | `Test Files 45 passed (45)` · `Tests 637 passed (637)` |
| `env -u NODE_ENV npx next build` | exit 0, cabecera `▲ Next.js 16.3.4 (Turbopack)` |
| Contador de páginas | **`✓ Generating static pages using 1 worker (8/8)`** — 8/8, no 9/9 |
| Rutas | **20**, de ellas **4 estáticas `○`**: `/`, `/_not-found`, `/settings/credentials`, `/settings/mapping` |
| Línea del middleware | **`ƒ Proxy (Middleware)`**, **sin kB**. Turbopack eliminó las columnas `size` y `First Load JS` |
| `.next/server/middleware-manifest.json` | `"version": 3`, **1 matcher** |
| Aviso esperado, exit 0 igual | `⚠ The "middleware" file convention is deprecated` |
| `npm audit` | **0 paquetes / 0 advisories** |
| Archivos fuente no-test | 85 |
| Archivos `.tsx` / tests `.tsx` | **30 / 0** |

`package.json` a 2026-09-10, tras la sesión 1: `next 16.3.4` (**pineado exacto**),
`react 19.3.0`, `react-dom 19.3.0`, `@types/react ^19.3.0`,
`@types/react-dom ^19.3.0`, `zod ^3.23.8`, `react-hook-form ^7.52.1`,
`@hookform/resolvers ^3.9.0`, `typescript ^5.5.4`, `"lint": "tsc --noEmit"`.
`lockfileVersion: 3`. Entorno de Jean: Node 22.22.2, **npm 11.12.1** (medido
2026-09-10; el repo decía 10.9.7 y estaba obsoleto). La regla de usar `npx npm@12`
para cualquier cambio de dependencia **no cambia**: el bug de arborist solo se
reprodujo en 10.x y no se volvió a probar en 11.x. `npm ci` en 11.12.1 instala
limpio: **197 paquetes** en macOS, 196 en Linux — la diferencia es `fsevents`,
opcional de macOS, que también hace que el aviso de install scripts bloqueados
liste **dos** paquetes en vez de uno.

Ruido local esperado en el gate 3, solo en la máquina de Jean:
`⚠ Next.js ignored package-lock.json in /Users/jean ...`. Es un
`package-lock.json` suelto en su carpeta personal; Turbopack sube buscando
lockfiles para inferir la raíz. Dice `ignored`, el build es válido, y en Vercel no
aparece. Se arregla borrando ese archivo, **nunca** añadiendo `turbopack.root` a
`next.config.js`.

---

## 2 bis. Herramienta de diagnóstico disponible

`diagnose_provet_totales.mjs`, en `~/Downloads` de Jean, **fuera del repo a
propósito**. Solo GET, sin dependencias, sin importar nada del proyecto. Es lo
que produjo las mediciones del 2026-09-11:

    node --env-file=.env.local ~/Downloads/diagnose_provet_totales.mjs --scan --days 2500
    node --env-file=.env.local ~/Downloads/diagnose_provet_totales.mjs --invoice 12

`--scan` lista solo las facturas donde `total_with_vat` no cuadra con la suma de
filas, marcando la causa (C-1, C-2, pago de redondeo). `--invoice` vuelca
cabecera, filas con todos sus campos de importe, y pagos. **La ventana por
defecto son 30 días y el tenant tiene datos de 2021: sin `--days 2500` devuelve
cero facturas.** Dos erratas ya corregidas en él, por si se reusa el patrón:
`invoicerow` **no tiene `unit_price`** (son `price`, `price_with_vat`, `sum`,
`sum_vat`, `sum_total`), y un escaneo de cero facturas no es un escaneo limpio.

### Evidencia medida el 2026-09-11 — no repetir como hallazgo nuevo

- **El tenant de sandbox NO es colombiano.** Una línea de la factura 5 trae
  **`vat_percentage` 12.4 %**, que en Colombia no existe (19 %, 5 % o 0 %); los
  importes llevan céntimos y los datos son de 2021. Es el tenant de demostración
  genérico de Provet. **Cualquier política de decimales o redondeo escrita contra
  estos datos habrá que reescribirla** cuando llegue el tenant real (T-1). La
  decisión de formato de arriba es de presentación y no depende de la moneda, así
  que esa sí se puede aplicar ya.
- **Una línea puede llevar un cargo fijo que no sale de `price × quantity`.**
  Factura 5, fila 1 (`Amoxicillin 250mg`): `price 48.93`, `price_with_vat 55.00`,
  `quantity 0.028` → 1.54, y sin embargo `sum_total = 11.54`. **Faltan 10.00
  exactos.** La aritmética interna cuadra (`sum 10.27` + `sum_vat 1.27`, 12.4 %
  sobre 10.27). No es un error: es un cargo fijo dentro de la línea. **Es la
  demostración numérica de por qué `sum_total` se lee literal y nunca se
  recalcula.**
- **`/invoicepayment/` no sirve hoy como fuente de verdad del medio de pago.** La
  factura 5 tiene un único pago de **0.00** con `type=0 tarjeta`. Si C-11 o
  cualquier otro ítem decide leer ese endpoint, hay que revalidarlo contra
  producción, no contra este tenant.
- **Descartado con medición: no hay pago de redondeo.** La hipótesis de que
  Provet cuadrara a peso entero con un `payment_type=3` se comprobó y es falsa en
  este tenant. No volver a proponerla sin datos nuevos.

## 3. El riesgo real de esta sesión

**No es el framework, es que C-1 y C-2 tocan dinero facturado.** Un error aquí no
rompe un build: emite un documento fiscal con un importe equivocado y timbrado por
la DIAN. C-1 ya tiene una sobrefacturación **medida** de 125.00 sobre datos reales
del tenant.

Consecuencias para el método, no negociables:

1. **TDD estricto en C-1 … C-7.** Primero un test que reproduzca el importe malo
   con los números reales de `EVIDENCIA §2.8` (factura 5, `invoicerow/3`, abono de
   125.00, total correcto 1574.04). Fase roja confirmada explícitamente **antes**
   del fix.
2. **Mutation testing en cada test nuevo.** Si mutar el fix no mata el test, el
   test es decorativo. En la sesión 0 tres hipótesis razonables resultaron falsas
   al medirlas y ningún gate las habría detectado.
3. **`sum_total` se lee literal, nunca se recalcula** — pero leerlo literal **no
   autoriza a filtrar** las filas negativas. C-1 y C-2 son la misma trampa vista
   desde dos lados.
4. **Cobertura de UI: sigue siendo cero.** 30 `.tsx`, 0 tests `.tsx`,
   `vitest.config.ts` con `environment: "node"` e `include: ["src/**/*.test.ts"]`.
   C-3 toca `QuickEditDrawer.tsx`: **ningún gate lo cubre.** Su verificación es
   manual, en preview, y es parte del entregable.

### Guion manual para C-3 — obligatorio antes del merge

Abrir el drawer · `Esc` · `Ctrl+Enter` · el lápiz de importe · que el botón se
bloquee cuando no cuadra · y, lo específico de C-3, **que `paidAmount` llegue al
payload y que `balanced` se calcule contra `sumLineTotals`**. Con las dos cuentas,
admin y empleado.

**Caso concreto de regresión, ya reproducido:** la **consulta 39** del tenant
(cliente Sara Bobby, paciente Teddy, total **33.5**). Hoy la cola muestra `33.5`
y el drawer `$34`. Después del fix los dos deben mostrar **`$33,50`**, y el
importe que viaja a Siigo debe seguir siendo **33.5**, no 34.

**Aspecto concreto de un fallo silencioso:** la página carga, el botón responde, y
el importe emitido es el equivocado. No hay traza en consola.

---

## 4. Trampas conocidas — no las redescubras

1. **`next build` reescribe `tsconfig.json` y `next-env.d.ts`.** Descubierto en la
   sesión 1 y ya commiteado con los valores que produce el build. Si tras un build
   aparecen como modificados, **algo revirtió la migración**; no los "arregles" a
   mano.
2. **`(8/8)`, no `9/9`.** Turbopack cuenta la fase distinto. Ninguna ruta cambió.
   No lo trates como regresión.
3. **`npm@12` bloquea los install scripts** (`esbuild` postinstall). Ruido
   esperado; vitest funciona igual porque el binario llega por dependencia
   opcional. **No añadas `allowScripts`.**
4. **El codemod `upgrade` ofrece `middleware-to-proxy`.** Está prohibido hasta la
   sesión 4. En esta sesión no deberías ejecutar ningún codemod.
5. **PROHIBIDO `npm audit fix --force`**, `--legacy-peer-deps` y
   `"type": "module"`. El audit está hoy en 0/0; cualquier propuesta suya de
   "breaking change" es un downgrade encubierto.
6. **`src/mocks/` lo importan archivos de producción.** No es artefacto de test.
7. **Tras un 500 de Siigo la `Idempotency-Key` queda consumida.** El reintento
   genera clave nueva. Roza directamente C-5 y C-6.
8. **Los tres gates no ven `vercel.json`.** Por eso existe
   `src/test/vercelSecurityHeaders.test.ts`.
9. **RLS no protege nada**: las conexiones `pg` directas autentican con un rol que
   la salta.
10. **Fechas de factura en `America/Bogota`**, nunca `new Date().toISOString()`.
    C-4 es exactamente esta clase de bug.

---

## 5. Decisiones cerradas — no se relitigan

- **Vercel Pro** a nombre de la dueña es el destino. Render Starter es la
  alternativa evaluada, bloqueada hasta que la paginación de Provet baje a
  `page_size=200`. Firebase App Hosting descartado por ahora; Firebase Auth y
  Firestore descartados sin condición.
- **`middleware.ts` se queda en Edge** hasta la sesión 4.
- **`@hookform/resolvers` 5.x fuera de alcance.** Corrección de la sesión 1 al
  motivo escrito: `^3.23.8` ya resuelve a `zod 3.25.76`, que **sí** satisface
  `^3.25.0`. El motivo válido es el rango declarado y revalidar todos los payloads
  de Siigo, no una incompatibilidad de resolución.
- **Un solo `PROJECT_STATE.md`.** Su `## Current State` es la fuente de verdad;
  las entradas `Previous Update` son changelog append-only.
- **Numeración única:** la columna `#` del backlog consolidado. Los prefijos
  `N*`, `H*`, `P*`, `S*`, `B*`, `D*` están retirados.
- **`docs/audits/` no es fuente de verdad** y no se ejecuta nada desde ahí.

---

## 6. Reglas que no cambian

- **Tres gates después de cada paso**, los tres verdes o no se avanza:
  `npx tsc --noEmit` · `npx vitest run` · `env -u NODE_ENV npx next build`.
  `npm run lint` es un alias de `tsc --noEmit`: correrlo como tercer gate no
  comprueba nada.
- **Un hallazgo a la vez**, gates completos entre sub-pasos.
- **Evidencia antes que hipótesis.** "No lo sé" es una respuesta aceptable.
- **No asumas el shape de una respuesta de Siigo o Provet sin evidencia real.**
- **Fail loudly, never silently.**
- **Archivos completos, nunca diffs parciales**, con la ruta exacta desde la raíz
  del repo. Si dos archivos tienen nombre o función parecida, dilo al entregar
  (`invoices` emite, `invoice-history` no; `catalog-mapping` lee de Postgres,
  `catalogs/sync` llama a Siigo en vivo).

---

## 7. Protocolo de entrega

### Dependencias — solo si la sesión toca `package.json`
Esta sesión **no debería tocarlo**. Si aun así hiciera falta: Claude pega el
`package.json` en el chat, Jean corre `rm -rf node_modules && npx npm@12 install`
en su máquina y pega el resultado, Claude revisa, y **solo entonces** sale el ZIP.
El ZIP **no lleva** `package.json` ni `package-lock.json` — un lockfile escrito a
mano rompe `npm ci` en Vercel. Al dar el conteo de `git status --short`, esos
archivos se cuentan igual: ya están modificados en el árbol de Jean.

### El ZIP
- **Uno solo**, `snake_case`, sin espacios ni acentos: `sesion2_ruta_critica.zip`.
- **Sin carpeta contenedora**: los archivos en la raíz del archivo, con su
  estructura de directorios (`src/...`) intacta.
- **Todos** los tocados, nuevos y modificados. **Archivos completos.**
- Incluye `PROJECT_STATE.md` editado y `prompt_sesion_3.md`.
- Nunca `node_modules/`, `.next/`, `.git/`, ni ningún `.env` con valores.

### Dotfiles — fuera del ZIP, siempre
macOS Archive Utility **descarta los dotfiles que estén en la raíz de un ZIP**: un
`.clinerules` junto a un solo directorio se perdió entero en la extracción, sin
quedar siquiera suelto en `~/Downloads`. Si el entregable incluye `.clinerules`,
`.gitignore` o `.env.example`, van **sueltos y renombrados**
(`clinerules_sesion2.txt`) con instrucción explícita de `cp` al nombre real, y hay
que decirlo al listar qué debe aparecer en `~/Downloads`.

### macOS descomprime solo — **no incluir ningún paso de `unzip`**
Al descargar, macOS extrae el ZIP y deja `~/Downloads/<nombre_sin_extensión>`. Un
paso de `unzip` **falla**, porque el `.zip` ya no está. Sintaxis **zsh/macOS**.
Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`.

### Los pasos, un comando por bloque

**1. Rama**

    cd ~/Proyects/Programing/fact_vet/fact_elect_vet
    git checkout main && git pull
    git status

Debe decir `nothing to commit, working tree clean`. Si no, parar.

    git checkout -b sesion2/ruta-critica

**2. Verificar la descarga**

    ls -a ~/Downloads/<nombre_carpeta>

Decir **literalmente qué archivos deben aparecer**, sueltos incluidos.

**3. Copiar**

    rsync -av --exclude '__MACOSX' ~/Downloads/<nombre_carpeta>/ .

La barra final en el origen es **obligatoria**.

    find . -name .DS_Store -not -path "./node_modules/*" -delete

**4. Verificar antes de nada**

    git status --short

Dar **el número exacto de líneas, desglosado en cuántas `M` y cuántas `??`, y la
lista literal de los `??`**. Si no cuadra, parar.

**5. Reinstalar — solo si cambió el lockfile**

    rm -rf node_modules
    npm ci

**6. Los tres gates, uno por bloque**

    npx tsc --noEmit

    npx vitest run

    env -u NODE_ENV npx next build

Para cada uno, **el valor exacto esperado**, nunca "debería pasar".

**7. Guion manual en preview antes del merge.** Ver §3. C-3 no se mergea sin él.

**8. Subir y merge**

    git add -A
    git commit -m "<mensaje>"
    git push -u origin sesion2/ruta-critica

PR en GitHub con **"Create a merge commit"**.

**9. Después del merge**

    git checkout main && git pull
    npx vitest run | tail -4
    git log --oneline -3

    git branch -d sesion2/ruta-critica
    git push origin --delete sesion2/ruta-critica

    rm -rf ~/Downloads/<nombre_carpeta>

### Antes de desplegar
En prosa corta: qué probar en preview flujo por flujo empezando por la emisión con
un documento que tenga abono; cuál es el aspecto concreto de un fallo silencioso; y
**cuál de los siete fixes es el que más probablemente rompa producción y cómo
revertir solo ese**.

---

## 8. Regla de encadenamiento

Al cerrar, esta sesión produce **`prompt_sesion_3.md`** dentro del mismo ZIP, con:
alcance congelado y lo que explícitamente no entra; estado verificado **medido**;
decisiones cerradas que no se relitigan; lo descubierto que cambie el plan; este
protocolo de entrega íntegro; y las trampas que costaron tiempo.

**Si la sesión termina sin ese archivo, no está terminada.**

La sesión 3 es la nota crédito: **C-9 primero** (borrar los 23 tests que blindan el
contrato inventado), luego **C-8** (el mapper contra el contrato real) y **C-10**
(claim y reconciliación de NC por el GUID de la factura padre, que `GET
/v1/credit-notes` devuelve en `invoice: {id, name}`).
