# Atomic Execution Protocol & AI Agent Rules (Cline Pass Rules)

This document governs the operational behavior of all coding agents (GLM 5.2, Kimi K3, DeepSeek V4 Pro/Flash, MiniMax M3, MiMo V2.5, Qwen3.7-Max/Plus, etc.) to prevent context loss, optimize token usage, and guarantee production-grade code quality.

---

## 1. Atomic Task Protocol (Strict Single Task Scope)

Every agent intervention MUST be strictly **atomic, self-contained, and scope-delimited**. No agent shall tackle multiple modules or unrelated files simultaneously.

### 4-Step Operational Cycle per Task:
1. **Read Project State:** Parse `PROJECT_STATE.md` to identify the current stage and the exact atomic task assigned.
2. **Delimited Execution:** Write or refactor ONLY the code strictly required for the assigned task. Modifying files outside the task scope without explicit instruction is forbidden.
3. **Verification & Cleanup:** Ensure zero dead code, no unused imports, proper error handling, and valid TypeScript/Zod schemas.
4. **Update Project State:** Record progress, modified files, and the next pending task in `PROJECT_STATE.md`.

---

## 2. Zero Small-Talk Directive (Token Optimization)

To preserve maximum context window and keep focus purely on execution:

* **No Conversational Prefixes:** Do NOT start responses with greetings, pleasantries, or confirmation filler (e.g., "Hello!", "Sure, I can help", "Understood, proceeding to...").
* **No Code Redundancy:** Do NOT print entire unmodified files when modifying a single function. Provide clear, targeted diffs or complete single files only when creating or refactoring them entirely.
* **Mandatory Response Format:**
  1. Short technical summary of modifications (3 lines max).
  2. Structured code/diff block.
  3. Updated markdown block for `PROJECT_STATE.md`.

---

## 3. Agent Task Assignment Matrix

| Agent | Core Specialization | Assigned Task Types |
| :--- | :--- | :--- |
| **DeepSeek V4 Pro / Qwen3.7-Max** | Complex reasoning & heavy refactoring | System architecture setup, DB schemas, core data mappers. |
| **DeepSeek V4 Flash / MiMo V2.5** | Fast & precise code editing | Bug fixes, UI component tuning, dead code removal. |
| **Kimi K3 / Kimi K2.7 Code** | Advanced agentic integration | API client implementations (Siigo/Provet), webhook listeners, retry mechanisms. |
| **GLM 5.2 / MiniMax M3** | General modular coding | UI components, form validation (Zod/React Hook Form), settings screens. |
| **Qwen3.7-Plus / MiMo V2.5 Pro**| Performance & balanced tasks | Core Web Vitals optimizations, Lighthouse audits, refactoring speed. |

---

## 4. Mandatory `PROJECT_STATE.md` Schema

Every repository must contain a `PROJECT_STATE.md` file at the root adhering strictly to this schema:

```markdown
# Current Project State: Provet-Siigo Integrator

## Current Phase
- [ ] Phase 1: Base Architecture & Mock Schemas
- [ ] Phase 2: API Services & Pure Mappers
- [ ] Phase 3: Interactive Web Dashboard
- [ ] Phase 4: Settings Module & Catalog Mapping
- [ ] Phase 5: Error Handling & Fallbacks
- [ ] Phase 6: Performance Optimization & Core Web Vitals

## Last Update
- **Date:** YYYY-MM-DD
- **Agent:** [Agent Name]
- **Completed Task:** [Atomic description]
- **Modified Files:** `path/to/file1.js`, `path/to/file2.js`

## Next Pending Task
- **Task:** [Atomic task description]
- **Recommended Agent:** [Agent Name]
- **Target Files:** `path/to/target.js`

## 5. Quality & Acceptance Criteria
- Before marking an atomic task as complete, code must satisfy:
- **Strict Validation: Full schema validation via Zod/TypeScript. Avoid implicit any types.**
- **Clean Output: Zero leftover console.log debug statements in production builds.**
- **Exception Safety: All async calls must be wrapped in try/catch blocks with user-friendly UI errors.**
- **Domain Integrity: Mandatory Partner-Id and Idempotency-Key headers on Siigo API calls; togglable stamp.send flag for DIAN submission.**