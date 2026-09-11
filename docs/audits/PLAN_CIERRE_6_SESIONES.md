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
> **Este documento es un PLAN SUPERSEDED, no un informe.** Está escrito en
> imperativo y describe seis sesiones. **Su tabla de sesiones ya no es válida:**
>
> - Commit base `81b1003` — el real al cerrar la sesión 0 es dos commits posterior.
> - La sesión 1 **no menciona React 19**, que es inseparable de Next 16 y entra en
>   su alcance congelado.
> - La sesión 2 **no incluye C-1**, el hallazgo de mayor consecuencia fiscal
>   descubierto después de escribir esto.
> - La sesión 4 no incluye el paso `middleware.ts` → `proxy.ts` (A-4), diferido allí.
> - La sesión 5 trata N10 como higiene de paginación; es rediseño del fetch.
>
> El plan vigente es la tabla de sesiones de `PROJECT_STATE.md` y, para la sesión
> inmediata, `prompt_sesion_1.md`.
> ---

# PLAN DE CIERRE — `fact_elect_vet`

**Escrito:** 2026-09-09 · **Commit base:** `81b1003` (`main`)
**Origen:** consolidación de `AUDITORIA_PROYECTO_2026-09-09.md` (22 hallazgos de
proceso, API e infra) y `AUDITORIA_FACT_ELECT_VET_2026-09-09.md` (22 hallazgos de
código sobre el 100% de `src/`).

> **Este documento vive en el conocimiento del Project y es el índice del plan.**
> No es la fuente de verdad del estado — esa sigue siendo `## Current State` en
> `PROJECT_STATE.md`, dentro del repo. Este documento dice **qué falta y en qué
> orden**; `PROJECT_STATE.md` dice **qué hay hoy**.

---

## 1. Regla que gobierna todo el plan

**Cuadrar el código contra la documentación oficial hoy, para que las credenciales
de producción sirvan solo de confirmación y nunca de descubrimiento.**

Todo lo que se pueda decidir leyendo la doc se decide ahora. Lo único que espera a
credenciales reales son **formas de respuesta que nadie ha visto**. Para esos
puntos, y solo esos, aplica el contrato de tolerancia:

> **El esquema tolera campos extra. La lógica nunca tolera campos ausentes.**

Concretamente: `.passthrough()` sí; un `.transform()` que devuelva `cufe: ""` y
`status: "Draft"` cuando el `stamp` no trae CUFE, **no**. Eso convierte una factura
aceptada por la DIAN en un borrador silencioso, y es el fallo de mayor consecuencia
legal del proyecto. Si el campo no está, se lanza.

El día que llegue la credencial real: o funciona, o grita. Nunca miente.

---

## 2. Las seis sesiones

Cada fila es **un chat**. El alcance está congelado antes de empezar.

| # | Sesión | Cierra | Espera credencial |
|---|---|---|---|
| **0** | **Pipeline limpio y backlog único** | H-1, H-2, N21, N22, y el commit de las referencias de API | No |
| **1** | **Migración a Next.js 16.3.4** | 27 advisories, CVE-2026-44581 | No |
| **2** | **Ruta crítica de la factura** | N5, N16, N7, N17, N18, N6 | No |
| **3** | **Nota crédito, reescritura completa** | N8, N13, N14 | Solo la forma del 201 |
| **4** | **Frontera de admin y sesión** | N15, N19, N20 | No |
| **5** | **Higiene, desacople y CI** | N1–N4, N10, N12, N23, L2/L4, D-c, D-d | No |
| **6** | **Retoque final con credenciales reales** | B1, B2, N11, N17-confirmación, P-5, CSP fase 2 | **Sí, toda** |

Son **seis sesiones de trabajo más la 0**, que es preparación y no toca `src/`.

### Sesión 0 — Pipeline limpio y backlog único
**No toca `src/`. Sin gates.** Funde los dos informes en un solo backlog dentro de
`PROJECT_STATE.md`, con numeración única. Commitea al repo las dos referencias de
API (`API_SIIGO_REFERENCIA_COMPLETA.md`, `API_PROVET_CLOUD_REFERENCIA_COMPLETA.md`)
y `EVIDENCIA_APIS.md`, y las añade al protocolo de lectura de `.clinerules §1`.

Resuelve dos conflictos entre los informes antes de escribir nada:

1. El informe de proyecto dice *"funcionalmente terminado"*; el de código dice que
   la anulación **no puede funcionar** (N8). **Gana el de código**: leyó la doc
   oficial de nota crédito campo por campo. "Terminado" es falso mientras la
   anulación legal no exista.
2. `EVIDENCIA_APIS.md` **nunca ha existido en el repo** — ni en el árbol ni en la
   historia de git (H-1) — pero `.clinerules` manda leerlo y el informe de código
   lo cita cuatro veces. Ese vacío es por donde entró N8.

También unifica la definición del cap de 150 líneas, que hoy tiene **tres**
(25, 17 u 11 archivos según cuál apliques). Se arregla **la regla**, no los archivos.

### Sesión 1 — Next.js 16.3.4
Va primera y sin discusión. 14.2.35 es EOL desde el 2025-10-26, con 27 advisories y
ninguno parcheable en su rama. **Se salta 15.x por completo**: pierde soporte el
2026-10-21. Cierra CVE-2026-44581 de raíz y cambia el terreno de N11 y de la CSP,
así que hacerla después obligaría a rehacer trabajo.

### Sesión 2 — Ruta crítica de la factura
Los cuatro grandes van juntos porque comparten ficheros y separarlos multiplicaría
los gates:

- **N5** — `provetToQueue.ts:117` descarta en silencio toda línea con
  `sum_total <= 0`. Un descuento desaparece, el pago se calcula sobre las
  supervivientes, **la suma cuadra consigo misma** y la DIAN timbra el importe sin
  descuento. Sobrefacturación silenciosa con validez legal.
- **N16** — el `balanced` que recepción confirma antes de emitir compara contra un
  número que no es el que se factura. La única barrera de cuadre es decorativa.
- **N17** — `created_end` sin hora se interpreta como `T00:00:00`, así que la
  reconciliación puede excluir justo la factura que busca, devolver `null`, y
  provocar **una segunda factura timbrada**. Fix defensivo, se aplica hoy.
- **N7** — `duplicated_document` llega como 400 y se toma como prueba de que no se
  creó nada. Es el único 4xx que significa lo contrario.
- **N18** y **N6** entran aquí por proximidad de fichero.

### Sesión 3 — Nota crédito
La más grande. **Borrar `creditNote.test.ts` ANTES de tocar el mapper**: sus 23
tests blindan el contrato inventado y harían que un agente futuro revierta el fix.
Reescribir mapper, esquema y ruta contra la tabla oficial (`invoice` como GUID,
`date` obligatorio, `reason` entero, importes **positivos**, sin `total` en raíz,
respuesta con `cufe`/`cude`/`status` **bajo `stamp`**). Añadir claim, marcador y
reconciliación, que hoy no existen (N13) — **anular por duplicado es peor que emitir
por duplicado**.

### Sesión 4 — Frontera de admin y sesión
Corta y aislada. `PUT /api/catalog-mapping` y `POST /api/credentials/health` solo
piden `requireSession`: un `employee` puede cambiar por API el tipo de comprobante
DIAN y todo el mapeo (N15). Es la misma clase de bug que D0 y **sobrevivió al chat
6a**. Más N19 (la justificación escrita de D1 es falsa: `sha256` sin sal no es
irreversible) y N20.

### Sesión 5 — Higiene, desacople y CI
Todo lo pequeño en una tanda de gates: N1–N4, N10 (paginación de Provet a
`page_size=200` e `id__gt=`), N12, N23 (12 `fetch` crudos en 5 componentes),
unificar las **tres** implementaciones de `America/Bogota` y las dos utilidades de
redondeo. Y lo que más retorno da del backlog entero: **CI en GitHub Actions** y un
**smoke test de emisión autenticado**, que habría atrapado 3 de los 4 fallos que
escaparon a los tres gates.

### Sesión 6 — Retoque con credenciales reales
Lo único que de verdad las necesita. Captura del JSON crudo del 201 de nota crédito,
verificación de la forma real del `stamp` con CUFE, confirmación de que la ventana
de N17 sobraba, `maxDuration` explícito según lo que diga Fluid compute, prueba de
los catálogos por tipo de Provet (P-5), y CSP fase 2.

---

## 3. Cada sesión genera el prompt de la siguiente

**Regla de encadenamiento, obligatoria y parte del entregable.**

Al cerrar, cada sesión produce **el prompt completo de la siguiente** como un `.md`
aparte, dentro del mismo ZIP, llamado `prompt_sesion_<N+1>.md`. Ese archivo es lo
único que hace falta para abrir el chat siguiente.

Razón: el estado verificado solo se conoce **al terminar**. Un plan escrito hoy para
la sesión 5 estaría basado en suposiciones sobre lo que las sesiones 2, 3 y 4 dejaron
en el repo. El agente que acaba de correr los gates es el único que sabe con qué se
encuentra el siguiente.

El prompt generado debe contener, sin excepción:

1. **Alcance congelado** — qué hallazgos entran y, explícitamente, **cuáles no**.
2. **Estado verificado medido**, no citado: salida real de los tres gates, conteo de
   tests y archivos, `N/N` de páginas estáticas, lista de páginas `○`, tamaño de
   `ƒ Middleware`, y el hash del commit.
3. **Decisiones de diseño ya cerradas** que la sesión nueva no debe relitigar.
4. **Lo que se descubrió y cambia el plan** — si algo invalida una sesión posterior
   de esta tabla, se dice ahí y se reordena.
5. **El protocolo de entrega** de la sección 5 de este documento, íntegro.
6. **Trampas conocidas** que costaron tiempo, para no repetirlas.

Si una sesión termina sin generar ese archivo, **no está terminada**.

---

## 4. Reglas que no cambian entre sesiones

- **Tres gates después de cada paso**, los tres verdes o no se avanza:
  `npx tsc --noEmit` · `npx vitest run` · `env -u NODE_ENV npx next build`.
  *(Ojo: `npm run lint` es un alias de `tsc --noEmit`. No hay ESLint en el
  proyecto. El gate 3 de `.clinerules` es el gate 1 — se corrige en la sesión 0.)*
- **TDD con fase RED confirmada** antes de cada fix, y **mutation testing** para
  probar que los tests no son decorativos.
- **Un hallazgo a la vez**, gates completos entre sub-pasos.
- **Evidencia antes que hipótesis.** Medir, no suponer. "No lo sé" es una respuesta
  aceptable; inventar no.
- **Fail loudly, never silently.** Un fallback silencioso es un bug, no un default
  seguro.
- **Un solo `PROJECT_STATE.md`.** Prohibido crear archivos de estado paralelos: ya
  provocaron que `.clinerules` apuntara a un fichero equivocado.
- **Archivos completos, nunca diffs parciales.** Un diff parcial ya hizo que un
  archivo sobrescribiera a otro.
- **Prohibido:** `npm audit fix --force` (subió Next 14→16 en silencio y rompió el
  build), `--legacy-peer-deps`, `"type": "module"` en `package.json`.
- **`src/mocks/` no es solo de tests** — lo importan archivos de producción.
- **`ts-prune` da falsos positivos** con los `export type X = z.infer<...>`.

---

## 5. Protocolo de entrega — idéntico en las seis sesiones

### El ZIP

- **Un solo ZIP**, nombre en `snake_case`, sin espacios ni acentos.
  Ejemplo: `sesion2_ruta_critica.zip`.
- **Sin carpeta contenedora**: los archivos van en la raíz del archivo
  (`src/...`, `vercel.json`, `PROJECT_STATE.md`).
- **Todos** los archivos tocados, nuevos y modificados, **dotfiles incluidos**.
- **Archivos completos, nunca diffs parciales.**
- Incluye `PROJECT_STATE.md` editado y `prompt_sesion_<N+1>.md`.
- Nunca `node_modules/`, `.next/`, `.git/`, ni ningún `.env` con valores.

### macOS descomprime solo — **no incluir ningún paso de `unzip`**

Al descargar, macOS extrae el ZIP y deja `~/Downloads/<nombre_sin_extensión>`. Un
paso de `unzip` **falla**, porque el `.zip` ya no está. Los comandos asumen que la
carpeta ya existe. Sintaxis **zsh/macOS**: nada de PowerShell ni `robocopy`.
Repo en `~/Proyects/Programing/fact_vet/fact_elect_vet`.

### Los pasos, un comando por bloque

**1. Rama**

    cd ~/Proyects/Programing/fact_vet/fact_elect_vet
    git checkout main && git pull
    git status

Debe decir `nothing to commit, working tree clean`. Si no, parar.

    git checkout -b sesion<N>/<slug>

**2. Verificar la descarga**

    ls -a ~/Downloads/<nombre_carpeta>

El agente debe decir **literalmente qué archivos deben aparecer**, dotfiles
incluidos. Si falta algo, parar.

**3. Copiar**

    rsync -av --exclude '__MACOSX' ~/Downloads/<nombre_carpeta>/ .

La barra final en el origen es **obligatoria**.

    find . -name .DS_Store -not -path "./node_modules/*" -delete

**4. Verificar antes de nada**

    git status --short

El agente debe dar **el número exacto de líneas, desglosado en cuántas `M` y
cuántas `??`, y la lista literal de los `??`**. Si no cuadra, parar.

**5. Los tres gates, uno por bloque**

    npx tsc --noEmit

    npx vitest run

    env -u NODE_ENV npx next build

Para cada uno, **el valor exacto esperado**, nunca "debería pasar": conteo de tests
y archivos, el `N/N` de `Generating static pages`, la lista de páginas `○ (Static)`
y el tamaño de `ƒ Middleware`.

**6. Subir y merge**

    git add -A
    git commit -m "<mensaje>"
    git push -u origin sesion<N>/<slug>

PR en GitHub con **"Create a merge commit"**.

**7. Después del merge**

    git checkout main && git pull
    npx vitest run | tail -4
    git log --oneline -3

    git branch -d sesion<N>/<slug>
    git push origin --delete sesion<N>/<slug>

    rm -rf ~/Downloads/<nombre_carpeta>

### Ruido preexistente — avisar siempre para no confundirlo con regresión

`Failed to patch lockfile ... reading 'os'` en el build · el aviso de
`configLoader: 'native'` en vitest · el resumen de `npm ci` con 1 critical y 1 high.

### Antes de desplegar

Cada sesión que toque `src/` debe entregar, en prosa corta:

- Qué probar en preview, flujo por flujo, **empezando por el login**.
- **Con las dos cuentas**, admin y empleado. Los guards devuelven 403 legítimo al
  empleado en rutas admin; no confundirlo con un fallo.
- **Cuál es el aspecto concreto de un fallo silencioso**: la app carga pero un botón
  no responde, un modal no abre, los estilos se ven crudos.
- Qué cambio del paquete es el que más probablemente rompa producción, y **cómo
  revertir solo ese**.

---

## 6. Baseline contra el que se compara

Medido en el commit `81b1003`:

| Gate | Valor |
| --- | --- |
| `npx tsc --noEmit` | sin salida, exit 0 |
| `npx vitest run` | `Test Files 45 passed (45)` · `Tests 637 passed (637)` |
| `next build` | `Generating static pages (9/9)`, 20 rutas |
| Páginas `○` | 4: `/`, `/_not-found`, `/settings/credentials`, `/settings/mapping` |
| `ƒ Middleware` | 40.1 kB |
| Archivos fuente no-test | 84–85 según criterio de conteo |
| `npm audit` por paquete | 2: 1 critical (`next`), 1 high (`postcss`) |
| `npm audit` por advisory | 27: 2 critical · 10 high · 13 moderate · 2 low |

---

## 7. En paralelo, y no depende de ningún chat

Esto es el **camino crítico real**. Ninguna de las seis sesiones lo sustituye.

1. **Credenciales de producción de Siigo y Provet** — pedírselas al dueño de la
   clínica. Sin ellas la sesión 6 no existe y nada se cierra del todo.
2. **Resolución DIAN activa y `documentTypeId`** de la cuenta.
3. **Plan Vercel Pro** — Hobby incumple los ToS por dos vías independientes: te
   pagan por construirlo y el sitio procesa facturación. No es "probablemente".
   *(Pro **no** resuelve la trazabilidad fiscal: la retención de logs pasa de 1 hora
   a 1 día. Para eso hace falta un log drain externo.)*
4. **Plan de Supabase con backups.**
5. **Preguntar al dueño dónde se anula**, en Provet o en la app. Es la rama A/B de
   P-1 y decide entre una sesión completa y un detector de media hora.
6. **Vercel → Settings → Functions: ¿Fluid compute activo?** Cinco segundos, y
   desbloquea N11 entero. El peor caso de una emisión con reintento y reconciliación
   ronda los 250 s.

---

## 8. Lo que se decidió NO hacer

Está aquí para que ninguna sesión futura lo reabra:

| Descartado | Por qué |
|---|---|
| Refactorizar los 17–25 archivos que exceden 150 líneas | Deuda cosmética con riesgo de regresión real. Se arregla la regla, no los archivos |
| Mitigar CVE-2026-44581 en `middleware.ts` | La sesión 1 lo cierra igual. Añadir lógica a un middleware que se va a migrar es trabajo que se tira |
| `transforms` de CDN en `vercel.json` para el mismo CVE | Cambio invisible a los tres gates, para un CVSS 4.7 con `AC:H`/`UI:R` que necesita una caché compartida medida como inexistente |
| Migrar `invoice_claims` al `external_info` de Provet | Funciona y está probado. Registrado como alternativa, no ejecutado |
| Migrar a Next.js 15.x como paso intermedio | Pierde soporte el 2026-10-21 |
| `ANNULMENT_REASONS` con 5 motivos | El flujo real es siempre `reason: 2`. El desplegable ofrece una elección que la DIAN no reconoce |
| `ts-prune` como tarea recurrente | Filtrar sus falsos positivos cada sesión cuesta más que un barrido manual anual |
| Las 2 filas `invoices` sin `claim` como tarea de código | Limpieza de datos del día del corte. El SQL ya está preparado |
