# Atomic Execution Protocol & AI Agent Rules (Cline Pass Rules)

This document governs the operational behavior of all coding agents (GLM 5.2, Kimi K3, DeepSeek V4 Pro/Flash, MiniMax M3, MiMo V2.5, Qwen3.7-Max/Plus, etc.) to prevent context loss, optimize token usage, enforce clinical UI standards, and guarantee production-grade code quality.

---

## 1. Mandatory Read-First & Atomic Task Protocol

Every agent intervention MUST be strictly **atomic, self-contained, and scope-delimited**. No agent shall tackle multiple modules or unrelated files simultaneously.

### Mandatory Pre-Flight Checklist:
Before writing or refactoring any code, the agent MUST read the seven governance
documents listed in `.clinerules` §1. In short:
1. `PROJECT_STATE.md` -> `## Current State` is the source of truth. The `Next Pending Task` lines below it are an append-only changelog, not live instructions.
2. `01_PROJECT_REQUIREMENTS.md` -> Verify DIAN tax rules, API specs (Provet/Siigo), and domain constraints.
3. `03_UI_UX_DESIGN_SPEC.md` -> Enforce clinical UI layouts, high-density rules, and color palettes.
4. `EVIDENCIA_APIS.md` -> Observed API evidence. Takes priority over official docs under its own class rule.
5. `API_SIIGO_REFERENCIA_COMPLETA.md` and `API_PROVET_CLOUD_REFERENCIA_COMPLETA.md` -> Captured official documentation.

### 4-Step Operational Cycle per Task:
1. **Audit & Plan:** Inspect `/src` for existing helpers/mappers to reuse. Output a brief 3-step strategy. DO NOT duplicate existing code.
2. **Delimited Execution:** Write or refactor ONLY the code strictly required for the assigned target files.
3. **Automated Verification Loop:** Execute `npx tsc --noEmit`, `npx vitest run`, and `env -u NODE_ENV npx next build`. Fix all compilation and schema errors before proceeding. **`npm run lint` is an alias of `tsc --noEmit`** — there is no ESLint in this project, so running it as a third gate verifies nothing new.
4. **Update Project State:** Record progress, modified files, and the next pending task in `PROJECT_STATE.md`.

---

## 2. Code Efficiency, Modular Structure & Complexity Rules

To ensure clean, maintainable, and non-redundant software:

* **Reuse Before Creating (DRY Rule):** Always check `/src/services`, `/src/mappers`, and `/src/schemas` before creating new utilities. Reinventing existing helpers is strictly prohibited.
* **Strict File Size Limit:** See `.clinerules` §CODE EFFICIENCY for the single authoritative definition: **150 raw lines** (`wc -l`) under `/src/services`, `/src/mappers` and `/src/components` only. `/src/app` is out of scope. The previous wording here ("no single file under `/src`") was one of three incompatible definitions of the same rule and is retired — it is not an alternative reading.
* **Algorithmic Simplicity:** Use pure, functional transformations (Zod schemas / native JS array methods like `.map()`, `.reduce()`). Maximum allowed time complexity for data mapping is $O(n)$.
* **Strict Layer Decoupling:**
  - `/services`: Direct HTTP API communication only.
  - `/mappers`: Pure, side-effect-free JSON data transformations.
  - `/components`: Modular UI matching `03_UI_UX_DESIGN_SPEC.md`. Components must NEVER execute raw HTTP calls or complex data transformations directly.

---

## 3. Zero Small-Talk Directive & Token Optimization

To preserve maximum context window and keep focus purely on execution:

* **No Conversational Prefixes:** Do NOT start responses with greetings, pleasantries, or confirmation filler (e.g., "Hello!", "Sure, I can help", "Understood, proceeding to...").
* **No Code Redundancy:** Do NOT print entire unmodified files when modifying a single function. Provide clear, targeted diffs or complete single files only when creating or refactoring them entirely.
* **Mandatory Output Format:**
  1. Short technical summary of modifications (3 lines max).
  2. Structured code/diff block.
  3. Updated markdown block for `PROJECT_STATE.md`.

---

## 4. Agent Task Assignment Matrix

| Agent | Core Specialization | Assigned Task Types |
| :--- | :--- | :--- |
| **DeepSeek V4 Pro / Qwen3.7-Max** | Complex reasoning & heavy refactoring | System architecture setup, DB schemas, core data mappers. |
| **DeepSeek V4 Flash / MiMo V2.5** | Fast & precise code editing | Bug fixes, UI component tuning, dead code removal. |
| **Kimi K3 / Kimi K2.7 Code** | Advanced agentic integration | API client implementations (Siigo/Provet), webhook listeners, retry mechanisms. |
| **GLM 5.2 / MiniMax M3** | General modular coding | UI components, form validation (Zod/React Hook Form), settings screens. |
| **Qwen3.7-Plus / MiMo V2.5 Pro**| Performance & balanced tasks | Core Web Vitals optimizations, Lighthouse audits, refactoring speed. |

---

## 5. Mandatory Quality & Acceptance Criteria

Before marking an atomic task as complete, code must satisfy:
1. **Strict Type Safety:** Full validation via Zod and TypeScript. Zero `any` types or unmasked `console.log` statements.
2. **Clinical UI Adherence:** Layouts must enforce `overflow: hidden` on root viewports, explicit table pagination (no infinite scroll), and clinical palette boundaries.
3. **Domain Integrity:** Mandatory `Partner-Id` and `Idempotency-Key` headers on all Siigo API calls; togglable `stamp.send` flag for DIAN submission (default `false` in Mock/Sandbox).
4. **User-Friendly Error Mapping:** Raw API failures (e.g., `invalid_identification`, `invalid_total_payments`) must be mapped to Spanish user-facing alert bars with quick-edit capabilities.