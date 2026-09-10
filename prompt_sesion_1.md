# Sesión 1 — Migración a Next.js 16.3.4 + React 19

**Generado por:** sesión 0, el 2026-09-10.
**Commit base:** el merge de la sesión 0 sobre `0019ef5` en `main`.
**Este archivo es lo único que hace falta para abrir el chat.**

---

## 0. Antes de escribir una línea

Clona fresco y lee los **siete** documentos de `.clinerules §1`. Todos están en la
raíz del repo. Ninguno vive en el conocimiento del Project — si encuentras una copia
allí, ignórala: ya provocó que un agente leyera una versión vieja durante varias
sesiones.

**Confirma el HEAD antes de nada.** Si no coincide con el merge de la sesión 0,
para y repórtalo. El prompt anterior asumía `81b1003` y el clon real estaba dos
commits por delante; costó media sesión detectarlo.

---

## 1. Alcance congelado

### Entra

| # | Qué |
|---|---|
| 1 | **Next.js 14.2.35 → 16.3.4** |
| 2 | **React 18.3.1 → 19.x + react-dom 19.x.** Inseparable: Next 16 no arranca con React 18 |
| 3 | Codemods de Next: `upgrade` y **`next-async-request-api` aparte** — el primero NO incluye al segundo |
| 4 | `@types/react` y `@types/react-dom` a la línea 19 |
| 5 | Regenerar el lockfile con `npx npm@12` (bug de arborist en npm 10.9.7, ver `EVIDENCIA §3`) |
| 6 | Reescribir el baseline del gate 3 en `PROJECT_STATE.md` — ver §4 |

### NO entra — explícito

| Qué | Por qué |
|---|---|
| **`middleware.ts` → `proxy.ts`** | Congelado por decisión de plataforma nº 6. Se queda tal cual, con su aviso de deprecación. Va a la sesión 4 (A-4) |
| **Bump de `react-hook-form`** | `^7.52.1` **ya declara** `react: ^19`. 7.52.0 fue exactamente la versión que amplió el peer. Medido en el registro npm el 2026-09-10. No lo toques |
| **Bump de `@hookform/resolvers`** | `3.x`, `4.x` y `5.x` declaran **cero peer de `react`** — solo `react-hook-form`. Es agnóstico a la versión de React. Y `5.0.0` exige `zod ^3.25.0 \|\| ^4`, contra el `^3.23.8` actual: arrastraría un bump de Zod, que valida todos los payloads de Siigo. **Fuera de alcance** |
| Cualquier hallazgo del backlog (C-*, A-*, H-*) | Sesiones 2 en adelante |
| Tocar `vitest.config.ts` | Aunque duela. Ver §3 |
| `vercel.json` | Ni `maxDuration` ni CSP. Sesión 6 |

---

## 2. Estado verificado, medido — no citado

Medido sobre `81b1003` por dos auditorías independientes el 2026-09-09, y la
sesión 0 no tocó `src/` ni `package.json`. **Re-mídelo igualmente al abrir**, y si
algo no coincide, repórtalo antes de cambiar nada.

| Gate / métrica | Valor esperado |
|---|---|
| `npx tsc --noEmit` | sin salida, exit 0 |
| `npx vitest run` | `Test Files 45 passed (45)` · `Tests 637 passed (637)` |
| `env -u NODE_ENV npx next build` | `Generating static pages (9/9)`, 20 rutas |
| Páginas `○ (Static)` | 4: `/`, `/_not-found`, `/settings/credentials`, `/settings/mapping` |
| `ƒ Middleware` | **40.1 kB** |
| Archivos fuente no-test | 84–85 según criterio de conteo |
| Archivos `.tsx` | **30** |
| Tests `.tsx` | **0** |
| `npm audit` por paquete | 2: 1 critical (`next`), 1 high (`postcss`) |
| `npm audit` por advisory | 27: 2 critical · 10 high · 13 moderate · 2 low |

Medido en `package.json` a 2026-09-10: `next 14.2.35`, `react ^18.3.1`,
`react-dom ^18.3.1`, `zod ^3.23.8`, `react-hook-form ^7.52.1`,
`@hookform/resolvers ^3.9.0`, `typescript 5.5.4`, `"lint": "tsc --noEmit"`.
Entorno de Jean: Node 22.22.2, npm 10.9.7.

---

## 3. El riesgo real de esta sesión, y no es el que parece

**La superficie de rotura de React 19 en `src/` es casi nula.** Medido:

```
forwardRef 0 · propTypes 0 · defaultProps 0 · useFormState 0
ReactDOM.render 0 · react-dom/test-utils 0 · element.ref 0
```

Y 7 llamadas síncronas a `cookies()` en 5 archivos (`actions.ts`,
`login/page.tsx`, `settings/page.tsx`, `settings/profile/page.tsx`), cero
`await cookies()`. El codemod las cubre.

**El riesgo es que hay 30 archivos `.tsx` y CERO tests.** `vitest.config.ts` usa
`environment: "node"` e `include: ["src/**/*.test.ts"]` — sin `.tsx`, sin DOM. No
es que falten tests de componente: **la configuración los hace imposibles.**

> **Esta actualización tiene cobertura automática cero. Los tres gates darán verde
> pase lo que pase.** Un gate verde aquí no significa nada sobre la UI.

**Por eso el guion manual es parte del entregable, no un extra.** No se declara
terminada la sesión sin él, y debe recorrerse en preview antes de tocar `main`.

### Guion manual — orden obligatorio

1. **`LoginForm.tsx` — PRIMERO.** Es uno de los dos únicos consumidores de
   react-hook-form (`useForm` + `zodResolver`). Si RHF se rompe bajo React 19, el
   síntoma es que **nadie entra a la aplicación**. Probar: envío válido, envío con
   email inválido (que el error de Zod aparezca bajo el campo), envío con
   contraseña incorrecta (mensaje del servidor), y el bloqueo por rate limit.
2. **`CredentialsForm.tsx`** — el otro consumidor de RHF. Mismos casos.
3. **`QuickEditDrawer.tsx`** — **NO usa RHF**, es `useState` plano (`:49`). Va
   tercero por ser el corazón de la emisión, no por el formulario. Probar: abrir,
   `Esc`, `Ctrl+Enter`, el lápiz de importe, y que el botón se bloquee cuando no
   cuadra.
4. **`/settings/mapping` y `/settings/credentials`** — las dos páginas estáticas
   `○` que además concentran 7 de los 12 `fetch` crudos.
5. **Las dos cuentas, admin y empleado.** Los guards devuelven 403 legítimo al
   empleado en rutas admin: eso es correcto, no un fallo de la migración.

**Aspecto concreto de un fallo silencioso:** la página carga pero un botón no
responde, un modal no abre, o los estilos se ven crudos. No hay traza en consola
necesariamente.

---

## 4. Trampas conocidas — no las redescubras

1. **`middleware.ts` NO rompe el build en 16.3.4.** Verificado empíricamente:
   exit 0 con el aviso `The "middleware" file convention is deprecated`. El codemod
   `middleware-to-proxy` existe; **no lo ejecutes**.
2. **El baseline del gate 3 deja de existir tal como está escrito.** Next 16 usa
   Turbopack por defecto en `next build` y **elimina las columnas `size` y
   `First Load JS`**. La línea del middleware pasa a imprimirse como
   `ƒ Proxy (Middleware)` **sin kB**. Los 40.1 kB no se pueden comparar con nada.
   **Sustituto medible que debes usar y dejar escrito en `PROJECT_STATE.md`:**
   presencia de la línea `ƒ Proxy (Middleware)`, `"version": 3` en
   `.next/server/middleware-manifest.json`, y el conteo de `matchers` de ese
   manifiesto. No inventes un valor esperado que no puedas medir.
3. **`next lint` se elimina en 16.** Aquí da igual: `"lint"` es un alias propio de
   `tsc --noEmit`, no `next lint`. No lo "arregles".
4. **Node ≥ 20.9 y TypeScript ≥ 5.1** son requisitos de 16. Jean tiene 22.22.2 y
   5.5.4. Caben.
5. **PROHIBIDO `npm audit fix --force`.** Sigue armado: el audit actual propone
   `next@16.3.4` como cambio incompatible, y ya rompió el build una vez subiendo
   14→16 en silencio. Prohibido también `--legacy-peer-deps` y `"type": "module"`.
6. **`src/mocks/` lo importan archivos de producción.** No es un artefacto de test.
7. **Ruido preexistente, avísalo para que no se confunda con regresión:**
   `Failed to patch lockfile ... reading 'os'` en el build, el aviso de
   `configLoader: 'native'` en vitest, y el resumen de `npm ci` con 1 critical y
   1 high. El primero debería desaparecer con la migración.

---

## 5. Argumento de seguridad, corregido

La prioridad de esta sesión es correcta, pero **por una razón distinta de la
escrita en las auditorías**. Ambas centran el relato en CVE-2026-44581
(`GHSA-ffhc-5mcf-pf4q`, moderate 4.7, nonce de CSP), que es la advisory **menos**
relevante aquí: exige que la app use nonces de CSP —no los usa, decisión DP2— y una
caché compartida, medida como inexistente.

Consultado OSV por versión exacta el 2026-09-10: **23 advisories afectan a
`next@14.2.35`**. Las dos exclusiones `critical` se sostienen (`GHSA-p293-qw3h-jr36`
exige Pages Router sobre Windows; `GHSA-2xp9-vwfh-vxw4` exige el optimizador de
imágenes con AVIF). Lo que sí aplica y no está en ningún informe:

| Advisory | Sev. | Por qué importa aquí |
|---|---|---|
| `GHSA-4633-3j49-mh5q`, `GHSA-68g3-v927-f742` | MODERATE | Confusión de caché de cuerpos de respuesta. Una app que sirve datos de factura con alcance por rol detrás de un CDN es el perfil exacto |
| `GHSA-955p-x3mx-jcvp` | MODERATE | Divulgación no autenticada de endpoints internos de Server Function |
| `GHSA-3g8h-86w9-wvmq` | LOW | Envenenamiento de caché en redirecciones de middleware — y el middleware **es** la autorización |

Descartado explícitamente para que nadie lo repita: `CVE-2026-44574` y
`CVE-2026-44575` (bypass de autenticación en middleware) **no afectan a 14.2.x**.
No aparecen en el listado de OSV para esa versión.

Ciclos de vida confirmados en endoflife.date el 2026-09-10: **14 EOL 2025-10-26**,
**15 EOL 2026-10-21**, **16 Active LTS**, `dist-tags.latest = 16.3.4` (2026-08-31).

---

## 6. Reglas que no cambian

- **Tres gates después de cada paso**, los tres verdes o no se avanza:
  `npx tsc --noEmit` · `npx vitest run` · `env -u NODE_ENV npx next build`.
- **Un hallazgo a la vez**, gates completos entre sub-pasos.
- **Evidencia antes que hipótesis.** "No lo sé" es una respuesta aceptable;
  inventar no. En la sesión 0, tres hipótesis razonables resultaron falsas al
  medirlas y ningún gate las habría detectado.
- **Fail loudly, never silently.**
- **Un solo `PROJECT_STATE.md`.** Prohibido crear archivos de estado paralelos.
- **Archivos completos, nunca diffs parciales.**

---

## 7. Protocolo de entrega — idéntico en todas las sesiones

### El ZIP
- **Uno solo**, nombre en `snake_case`, sin espacios ni acentos:
  `sesion1_next16_react19.zip`.
- **Sin carpeta contenedora**: los archivos en la raíz del archivo.
- **Todos** los tocados, nuevos y modificados, **dotfiles incluidos**.
- **Archivos completos, nunca diffs parciales.**
- Incluye `PROJECT_STATE.md` editado y `prompt_sesion_2.md`.
- Nunca `node_modules/`, `.next/`, `.git/`, ni ningún `.env` con valores.

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

    git checkout -b sesion1/next16-react19

**2. Verificar la descarga**

    ls -a ~/Downloads/<nombre_carpeta>

Di **literalmente qué archivos deben aparecer**, dotfiles incluidos.

**3. Copiar**

    rsync -av --exclude '__MACOSX' ~/Downloads/<nombre_carpeta>/ .

La barra final en el origen es **obligatoria**.

    find . -name .DS_Store -not -path "./node_modules/*" -delete

**4. Verificar antes de nada**

    git status --short

Da **el número exacto de líneas, desglosado en cuántas `M` y cuántas `??`, y la
lista literal de los `??`**. Si no cuadra, parar.

**5. Reinstalar — esta sesión sí lo necesita**

    rm -rf node_modules
    npm ci

**6. Los tres gates, uno por bloque**

    npx tsc --noEmit

    npx vitest run

    env -u NODE_ENV npx next build

Para cada uno, **el valor exacto esperado**, nunca "debería pasar". Con la salvedad
del §4.2: para el build, los valores esperados son los nuevos, no los de 14.

**7. Guion manual en preview antes del merge.** Ver §3. Esta sesión **no se mergea
sin él**.

**8. Subir y merge**

    git add -A
    git commit -m "<mensaje>"
    git push -u origin sesion1/next16-react19

PR en GitHub con **"Create a merge commit"**.

**9. Después del merge**

    git checkout main && git pull
    npx vitest run | tail -4
    git log --oneline -3

    git branch -d sesion1/next16-react19
    git push origin --delete sesion1/next16-react19

    rm -rf ~/Downloads/<nombre_carpeta>

### Antes de desplegar
En prosa corta: qué probar en preview flujo por flujo empezando por el login, con
las dos cuentas; cuál es el aspecto concreto de un fallo silencioso; y **qué cambio
del paquete es el que más probablemente rompa producción y cómo revertir solo ese**.

---

## 8. Regla de encadenamiento

Al cerrar, esta sesión produce **`prompt_sesion_2.md`** dentro del mismo ZIP, con:
alcance congelado y lo que explícitamente no entra; estado verificado **medido**;
decisiones ya cerradas que no se relitigan; lo descubierto que cambie el plan;
este protocolo de entrega íntegro; y las trampas que costaron tiempo.

**Si la sesión termina sin ese archivo, no está terminada.**

La sesión 2 es la ruta crítica de la factura: **C-1** (omisión de abonos de Provet,
hallazgo nuevo con sobrefacturación medida de 125.00), C-2 (N5), C-3 (N16),
C-4 (N17), C-5 (N7), C-6 (N6), C-7 (N18).
