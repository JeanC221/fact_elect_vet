# UI/UX & Clinical Ergonomics Specification
**Provet Cloud ↔ Siigo Nube Operational Dashboard**

## Design Philosophy: "Enterprise Clinical Utility"
The interface must reflect professional medical software (Practice Management Information System - PIMS). It prioritizes information density, low cognitive load, strict spatial constraints, and high readability over decorative aesthetics.

---

## 1. Palette & High-Contrast Visual System
- **App Background:** `#F4F6F8` (Cool Grey Light)
- **Container / Panel Background:** `#FFFFFF` (Pure White)
- **Primary Text:** `#1A202C` (Slate Dark - Contrast ratio > 7:1)
- **Muted Text / Labels:** `#5A6A85` (Cool Muted Grey)
- **Borders & Grid Lines:** `#E2E8F0` (Solid 1px boundaries)
- **Primary Action (Clinical Blue):** `#0052CC` (Hover: `#0043A4`, Active: `#00317A`)
- **Badges & Statuses:**
  - `Accepted` (DIAN Approved): Text `#0F5132`, BG `#D1E7DD`, Border `#BADACC`
  - `Draft` / `Pending`: Text `#664D03`, BG `#FFF3CD`, Border `#FFECB5`
  - `Rejected` (DIAN Error): Text `#842029`, BG `#F8D7DA`, Border `#F5C2C7`

---

## 2. Layout, Viewport & Scroll Control Directives

### 2.1 Viewport Enclosure (No Page-Level Overlap)
- **Body / Main Shell:** Set `overflow: hidden` on the root viewport (`h-screen w-screen`). The global browser window MUST NOT scroll.
- **Isolated Scroll Regions:**
  - Sidebar / Filter Area: Fixed height, internal `overflow-y: auto`.
  - Main Table Container: Dynamic height calculation (`h-[calc(100vh-120px)]`), internal `overflow-y: auto` with custom thin scrollbars.
  - Side Drawers / Action Panels: Independent `overflow-y: auto` boundary.

### 2.2 Table Pagination vs. Infinite Scroll
- **STRICT DIRECTIVE:** DO NOT use infinite scroll for accounting or consultation tables.
- All consultation lists, invoice histories, and catalog mapping tables MUST use **Explicit Pagination** (e.g., 15/25/50 items per page) with item counts displayed (`Showing 1-15 of 142 records`).

---

## 3. Form Input Masking & Pre-flight Validation UI

To prevent raw Siigo/DIAN rejection codes before sending network payloads:

1. **Identification / NIT Field:**
   - Enforce numeric/alphanumeric filtering. Strip spaces and special characters automatically.
   - Show inline verification hint (`Valid Cedula format` or `NIT requires Verification Digit`).
2. **Email Address Field:**
   - Real-time RFC 5322 regex validation.
   - Show clear visual warning pill if missing: `[⚠️ Missing Email - Required for DIAN Mail Dispatch]`.
3. **Payment Totals Reconciliation Bar:**
   - Inside the Quick-Edit Modal, render a live comparison strip:
     `Consultation Total: $80,000 COP | Total Paid: $80,000 COP | Difference: $0 COP (Balanced ✅)`
   - If `Difference != 0`, disable the "Emit Invoice" button and highlight the discrepancy in red.

---

## 4. Typography, Iconography & Component Guidelines

### 4.1 Typography Scale
- Font Family: `Inter`, `Segoe UI`, or Native System Sans-serif.
- Table Cells & Labels: `text-xs` (12px), `font-medium`.
- Body & Inputs: `text-sm` (14px).
- Headers & Status Badges: `text-base` (16px), `font-semibold`.
- Border Radius: Conservative scale (`rounded-sm` [2px] or `rounded-md` [6px]). **NEVER use `rounded-2xl` or `rounded-3xl`**.

### 4.2 Standard Clinical Iconography
Use `lucide-react` icons strictly for functional meaning:
- `CheckCircle2` (Green) -> Accepted DIAN Invoice.
- `Clock` (Amber) -> Pending Consultation.
- `AlertTriangle` (Red) -> Rejected / Missing Fields.
- `RefreshCw` -> Retry Emission / Sync Webhooks.
- `FileText` / `Code` -> PDF / XML Downloads.
- `Search` / `Filter` -> Table Navigation.

---

## 5. User Flow, Modals & Toast Notification Architecture

### 5.1 Main Operational Flow (1-Click Invoicing)
1. **Queue View:** User sees incoming closed consultations from Provet (`Consultation finalised` webhook event).
2. **Action Click:** User clicks `[Invoice Now]` on a row.
3. **Quick-Edit Side Drawer:** Opens on the right (width 480px, modal backdrop `bg-slate-900/40`).
   - Displays pre-filled Provet data (Owner NIT, email, items, payment method).
   - Allows inline correction of missing fields.
4. **Submission & Feedback:**
   - Button enters loading state with spinner (`Emitting to DIAN...`).
   - On Success: Drawer closes automatically, row status badges update to `Accepted`, and a green Toast appears at bottom-right (`Invoice FV-1-7751 generated successfully`).
   - On DIAN Error: Drawer remains open, button resets, and an inline error card appears explaining the exact issue (e.g., *"DIAN Error: Invalid Tax ID. Please edit NIT and retry"*).

### 5.2 Keyboard Accessibility
- `Esc`: Close open drawers/modals without saving.
- `Ctrl + Enter` / `Cmd + Enter`: Submit active invoice form.

---

## 6. Prohibited UI Anti-Patterns
- ❌ NO soft glassmorphism or blurry frosted backgrounds.
- ❌ NO glowing neon borders or rainbow gradients.
- ❌ NO custom AI-generated 3D illustrations or empty state graphics.
- ❌ NO layout shift on data load (Skeleton loaders must match exact table row height: `py-2 px-3`).