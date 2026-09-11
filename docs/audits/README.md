# `docs/audits/` — archivo histórico

**Nada de esta carpeta es fuente de verdad, y nada de aquí se ejecuta.**

Estos documentos se archivaron el 2026-09-10, al cerrar la sesión 0, cuando su
contenido se fusionó en el backlog consolidado de `PROJECT_STATE.md`. Vivían en el
conocimiento del Project de Claude, que no tiene mecanismo de sincronización con el
repo — ese desfase ya provocó que un agente leyera un `.clinerules` obsoleto durante
varias sesiones. Se conservan aquí para poder trazar **por qué** se decidió cada
cosa, no **qué** hay que hacer.

| Archivo | Qué es | Estado |
|---|---|---|
| `AUDITORIA_PROYECTO_2026-09-09.md` | Auditoría de proceso, gobernanza e infraestructura sobre `81b1003`. 22 hallazgos | Fusionada |
| `AUDITORIA_FACT_ELECT_VET_2026-09-09.md` | Auditoría de código sobre el 100% de `src/` en `81b1003`. 22 hallazgos | Fusionada |
| `PLAN_CIERRE_6_SESIONES.md` | Plan de cierre en seis sesiones. **Superseded** | Reemplazado |

## Dónde está lo vigente

| Necesitas | Mira |
|---|---|
| Estado verificado y backlog vivo | `PROJECT_STATE.md` → `## Current State — Backlog Consolidado` |
| Decisiones de plataforma cerradas | `PROJECT_STATE.md` → `## Decisiones de plataforma` |
| Evidencia observada de las APIs | `EVIDENCIA_APIS.md` |
| Qué hacer en la sesión siguiente | `prompt_sesion_<N>.md` en la raíz |
| Protocolo de agente y leyes de dominio | `.clinerules`, `2_AGENT_WORKFLOW_RULES.md` |

## Numeración

Los prefijos `N*`, `H*`, `P*`, `S*`, `B*`, `D*` y `T*` de estos documentos **están
retirados**. La referencia válida es la columna `#` del backlog consolidado:
`C-*` (corrección), `A-*` (autorización), `H-*` (higiene), `P-*` (requiere
credenciales de producción), `T-*` (bloqueante de terceros). Cada fila del backlog
conserva su origen entre paréntesis para poder volver aquí.

## Advertencia

Ambas auditorías contienen afirmaciones **falsificadas por medición en vivo el
2026-09-10**, y ninguna de las dos detectó C-1, el hallazgo de mayor consecuencia
fiscal del proyecto. Cada archivo lleva la lista concreta en su cabecera.
**Léelas antes de reutilizar nada de aquí.**

## Regla

Esta carpeta es de solo lectura en la práctica: se añade, no se edita. Si un
documento futuro queda superseded, va aquí con su cabecera de estatus. **Nunca al
conocimiento del Project.** El repo es la única fuente.
