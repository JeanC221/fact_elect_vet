# Project Requirements Specification and Guidelines
**Provet Cloud ↔ Siigo Nube Integrator (DIAN Electronic Invoicing)**

This document serves as the complete technical and functional reference for the project to ensure architectural consistency across all development environments and associated chat sessions.

---

## 1. Project Overview & Scope

### 1.1 System Nature
- **Type:** Internal Web Application (Middleware API + Operational Dashboard).
- **Purpose:** Automate the issuance of DIAN-approved Electronic Invoicing in Colombia, eliminating manual data entry between the clinical PMS (**Provet Cloud**) and the accounting ERP (**Siigo Nube**).
- **Deployment Environment & Domain:** Vercel / Render / AWS hosted under a private corporate instance or subdomain of the clinic (e.g., `https://invoicing.yourvetclinic.com`).
- **Access & User Security:** Dashboard protected by JWT-based authentication, strictly restricted to authorized reception and administrative staff.

### 1.2 Core Functional Requirements
1. **Automated Consultation Ingestion:** Ingest services, products, owners, and patients data from Provet Cloud via REST API (`/consultations`, `/clients`, `/patients`) and real-time Webhooks (`List of Webhook Triggers` - Event `45: Consultation finalized`).
2. **Preview & Interaction (1-Click Invoicing):** An agile interface enabling receptionists to validate or adjust critical client details (ID/NIT, address, email, payment method) before confirming emission.
3. **Dynamic Catalog Mapping:** Administrative module to dynamically link Provet items/services with Siigo product/tax codes (`/products`) and map Provet payment methods to active Siigo payment types (`/payment-types`).
4. **Accounting & DIAN Tax Transformation:** Build the strict JSON payload for `POST /v1/invoices` adhering to Resolution 948 and DIAN health parameters, if applicable.
5. **Integrated Emission & Transmission:** Direct electronic signing (`stamp.send: true`), **CUFE** hash retrieval, and automated email dispatch to the end client (`mail.send: true`).
6. **Auditing, History & Retries:** Transaction logging (Drafts, Accepted, Rejected) with visible technical details and a 1-click retry mechanism.
7. **Credentials Configuration Module:** Protected view where administrators input access keys (`Partner-Id`, `Username`, `Access Key`, `Client ID`, `Client Secret`) and dynamically toggle between **Test Mode (Mock/Sandbox)** and **Production Real Mode**.

### 1.3 Non-Essential Requirements (Wishlist / Future Phases)
- Bulk report export in Excel/CSV formats.
- Graphical dashboards for daily and monthly sales metrics.
- Automated invoice PDF delivery via WhatsApp API.

---

## 2. Security Directives & Sensitive Data Protection

Given the handling of personal data (Tax ID/Cedula, emails, physical addresses) and legal liability before the DIAN:

1. **Secrets Management:**
   - Absolute prohibition of hardcoding API keys within source code.
   - Credentials must be retrieved exclusively from Environment Variables (`.env`) or an encrypted database layer (AES-256).
2. **Frontend & Session Security:**
   - Enforced HTTPS protocol.
   - JWT session tokens stored in cookies with `HttpOnly`, `SameSite=Strict`, and `Secure` flags.
   - Defense mechanisms against XSS, CSRF, and Clickjacking vulnerabilities.
3. **API Integration Standards (Siigo & Provet):**
   - Mandatory `Partner-Id` header in all requests to Siigo (between 3 and 100 valid alphanumeric characters).
   - `Idempotency-Key` header (alphanumeric, max 30 characters) on `POST /v1/invoices` endpoints to prevent duplicate invoice generation.
   - Automatic JWT Token renewal (`POST /auth`) prior to expiration (24h validity).

---

## 3. Fallbacks, Fault Tolerance & Error Handling

The system must intercept raw API error codes and present human-readable messages alongside immediate corrective options:

| Error Code | Cause / Trigger | User-Facing Message | Suggested Fallback / Action |
| :--- | :--- | :--- | :--- |
| `invalid_identification` | Invalid Cedula/NIT format. | "The entered ID or NIT is invalid for DIAN processing." | Enable inline editing modal to correct the Tax ID before retrying. |
| `invalid_total_payments` | Discrepancy between line items subtotal and payment total. | "The total paid amount does not match the consultation total." | Automatically recalculate line-item decimals and smooth rounding differences. |
| `parameter_required` | Missing mandatory field (e.g., email, address). | "Customer email address is required to dispatch the invoice." | Highlight the missing field for fast manual entry and retry. |
| `requests_limit` (429) | Exceeded 100 req/min rate limit (or 10 req/min in Sandbox). | "Invoicing server busy. Retrying automatically..." | Trigger an automatic retry using an Exponential Backoff algorithm. |
| `service_unavailable` (503)| Siigo or DIAN services temporarily offline. | "DIAN service is unreachable. Invoice saved as Draft." | Store document as `Draft` and place into an asynchronous retry queue. |

---

## 4. Performance Standards, Metrics & Web Benchmarks

To ensure a seamless operational experience adhering to high industry performance benchmarks:

- **Target Core Web Vitals:**
  - **LCP (Largest Contentful Paint):** `< 2.5s`
  - **INP (Interaction to Next Paint):** `< 200ms`
  - **CLS (Cumulative Layout Shift):** `< 0.1`
- **Standard Performance Measurement Tools:**
  1. **Google Lighthouse / PageSpeed Insights:** Speed, accessibility, best practices, and technical SEO evaluations.
  2. **WebPageTest / GTmetrix:** Deep-dive analysis into network waterfalls, TTFB (Time to First Byte), and initial rendering pipeline.
- **Optimization Strategies:**
  - Hybrid rendering (SSR for shell layouts, Client Components for isolated interactive controls).
  - Lazy loading for large historical data tables.
  - Caching and *Revalidation* strategy for Siigo static catalogs (`/products`, `/payment-types`) to avoid hitting API rate limits.

---

## 5. Code Cleanliness & Architectural Rules

- **Zero Dead Code:** Strip unused functions, declared but unreferenced variables, legacy imports, and commented code blocks prior to commits.
- **Strict Layer Decoupling:**
  - `/services`: Direct HTTP communication layer with external APIs (Provet, Siigo).
  - `/mappers`: Pure, side-effect-free JSON data transformation utilities.
  - `/components`: Modular, responsive, and interactive UI components.
- **Forms & Validation:** Leverage React Hook Form combined with Zod schema validation (or lightweight equivalents) for strict runtime checking across client and server.