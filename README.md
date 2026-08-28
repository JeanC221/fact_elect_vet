# Provet Cloud ↔ Siigo Nube Integrator

Internal web application that automates DIAN-approved electronic invoicing for a Colombian veterinary clinic, bridging **Provet Cloud** (Practice Management System) with **Siigo Nube** (ERP/Accounting).

---

## Tech Stack

- **Framework:** Next.js 14.2.5 (App Router, Server Components)
- **Language:** TypeScript 5.5 (strict mode)
- **Validation:** Zod 3.23 (runtime schema validation)
- **Styling:** Tailwind CSS 3.4 (clinical UI palette)
- **Forms:** React Hook Form 7.52 + @hookform/resolvers
- **Icons:** Lucide React 0.427
- **Testing:** Vitest 2.0 (unit + integration tests)
- **Deployment:** Vercel (serverless, edge-runtime middleware)

---

## Prerequisites

- **Node.js:** 18.17+ (LTS recommended)
- **npm:** 9.0+ (or pnpm/yarn)
- **Accounts:**
  - Provet Cloud (veterinary PMS)
  - Siigo Nube (Colombian ERP with DIAN electronic invoicing)

---

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-org/fact_vet.git
cd fact_vet
npm install
```

### 2. Environment Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your actual values:

| Variable | Purpose | Example |
|----------|---------|---------|
| `JWT_SECRET` | HMAC-SHA256 signing key for session tokens | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `EMPLOYEE_EMAIL` | Receptionist login email | `recepcion@vetclinic.com` |
| `EMPLOYEE_PASSWORD_HASH` | sha256(password) in base64url | `node -e "console.log(require('crypto').createHash('sha256').update('YOUR_PASSWORD').digest('base64url'))"` |
| `ADMIN_EMAIL` | Administrator login email (separate account) | `admin@vetclinic.com` |
| `ADMIN_PASSWORD_HASH` | sha256(admin password) in base64url | `node -e "console.log(require('crypto').createHash('sha256').update('YOUR_ADMIN_PASSWORD').digest('base64url'))"` |
| `SIIGO_PARTNER_ID` | Siigo API partner identifier | `your-partner-id` |
| `SIIGO_USERNAME` | Siigo API username | `api-user@company.com` |
| `SIIGO_ACCESS_KEY` | Siigo API access key | `your-access-key` |
| `SIIGO_CLIENT_ID` | OAuth 2.0 client ID (Task 6.1) | `your-client-id` |
| `SIIGO_CLIENT_SECRET` | OAuth 2.0 client secret (Task 6.1) | `your-client-secret` |
| `SIIGO_BASE_URL` | Siigo API endpoint | `https://api-sandbox.siigo.com` (sandbox) or `https://api.siigo.com` (production) |
| `SIIGO_SANDBOX_MODE` | Toggle sandbox/production | `true` (sandbox) or `false` (production) |
| `PROVET_API_KEY` | Provet Cloud API key | `your-api-key` |
| `PROVET_CLINIC_ID` | Provet clinic identifier | `12345` |
| `PROVET_BASE_URL` | Provet API endpoint | `https://api.provetcloud.com` |

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.


---

## Development Workflow

### Available Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (hot reload) |
| `npm run build` | Create production build |
| `npm start` | Start production server |
| `npm run test` | Run Vitest test suite |
| `npm run lint` | TypeScript type checking (zero errors) |
| `npm run typecheck` | Alias for `lint` |

### Testing

```bash
npm run test
```

Runs all unit and integration tests with Vitest. Target: **100% pass rate**.

### Type Safety

```bash
npm run lint
```

Enforces strict TypeScript compliance. Zero `any` types allowed.

---

## Deployment to Vercel

### Option A: Vercel CLI (Recommended)

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login & Link Project:**
   ```bash
   vercel login
   vercel link
   ```

3. **Set Environment Variables:**
   ```bash
   vercel env add JWT_SECRET
   vercel env add EMPLOYEE_EMAIL
   vercel env add EMPLOYEE_PASSWORD_HASH
   vercel env add SIIGO_PARTNER_ID
   vercel env add SIIGO_USERNAME
   vercel env add SIIGO_ACCESS_KEY
   vercel env add SIIGO_CLIENT_ID
   vercel env add SIIGO_CLIENT_SECRET
   vercel env add SIIGO_BASE_URL
   vercel env add SIIGO_SANDBOX_MODE
   vercel env add PROVET_API_KEY
   vercel env add PROVET_CLINIC_ID
   vercel env add PROVET_BASE_URL
   ```

4. **Deploy:**
   ```bash
   vercel --prod
   ```

### Option B: Vercel Dashboard (Git Integration)

1. Push code to GitHub/GitLab/Bitbucket
2. Import project at [vercel.com/new](https://vercel.com/new)
3. Configure environment variables in project settings
4. Deploy (automatic on every push to `main`)

### Custom Domain

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add your domain (e.g., `invoicing.vetclinic.com`)
3. Configure DNS records (A/CNAME) as instructed

---

## Production Checklist

Before going live, verify:

- [ ] All environment variables set in Vercel dashboard
- [ ] `SIIGO_SANDBOX_MODE` set to `false` (production mode)
- [ ] `SIIGO_BASE_URL` points to `https://api.siigo.com` (not sandbox)
- [ ] Test login flow with real employee credentials
- [ ] Verify Siigo API connectivity (check OAuth token retrieval)
- [ ] Issue a test invoice in production (validate DIAN acceptance)
- [ ] Confirm PDF/XML downloads work
- [ ] Test credit note emission (annulment flow)
- [ ] Verify cookie security flags (`HttpOnly`, `Secure`, `SameSite=Strict`)
- [ ] Check HTTPS enforcement (redirect HTTP → HTTPS)
- [ ] Review security headers (HSTS, X-Frame-Options, CSP)

---

## Maintenance & Troubleshooting

### Credential Rotation

**JWT Secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```
Update `JWT_SECRET` in Vercel env vars. All active sessions will be invalidated.

**Employee Password:**
```bash
node -e "console.log(require('crypto').createHash('sha256').update('NEW_PASSWORD').digest('base64url'))"
```
Update `EMPLOYEE_PASSWORD_HASH` in Vercel env vars.

**Admin Password:**
```bash
node -e "console.log(require('crypto').createHash('sha256').update('NEW_ADMIN_PASSWORD').digest('base64url'))"
```
Update `ADMIN_PASSWORD_HASH` in Vercel env vars. This is independent from the
receptionist password — rotate it separately.

**Siigo/Provet API Keys:**
Regenerate in respective dashboards and update env vars. No downtime required.

### Common Issues

**Issue:** "Invalid credentials" on login
- **Cause:** `EMPLOYEE_PASSWORD_HASH` mismatch
- **Fix:** Regenerate hash with the exact password (case-sensitive)

**Issue:** Siigo API returns `requests_limit` (429)
- **Cause:** Exceeded 100 req/min (production) or 10 req/min (sandbox)
- **Fix:** System automatically retries with exponential backoff. Wait 1-2 minutes.

**Issue:** Invoice stuck in "Draft" status
- **Cause:** Siigo/DIAN service unavailable (503)
- **Fix:** Check Siigo status page. System saves as draft for manual retry.

**Issue:** PDF/XML download fails
- **Cause:** Invoice not yet stamped by DIAN
- **Fix:** Wait for DIAN acceptance (check status badge), then retry download.

### Monitoring Logs

- **Vercel Dashboard:** Real-time logs for all serverless functions
- **Browser Console:** Client-side errors (check Network tab for API calls)
- **Siigo Dashboard:** API request history and error details

---

## Security Notes

- **Zero Hardcoded Secrets:** All credentials stored in environment variables
- **HTTPS Enforcement:** Mandatory for production (automatic on Vercel)
- **JWT Expiration:** 24-hour session tokens (configurable in `src/services/auth.ts`)
- **Cookie Security:** `HttpOnly`, `Secure`, `SameSite=Strict` flags prevent XSS/CSRF
- **DIAN Compliance:** All invoices comply with Colombian electronic invoicing regulations (Resolution 948)
- **Rate Limiting:** Siigo API enforces 100 req/min (production) / 10 req/min (sandbox)

---

## Project Structure

```
fact_vet/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── login/        # Authentication page
│   │   ├── settings/     # Catalog mapping & credentials
│   │   └── page.tsx      # Main dashboard
│   ├── components/       # Reusable UI components
│   ├── mappers/          # Pure data transformation functions
│   ├── services/         # API clients (Provet, Siigo, Auth)
│   └── middleware.ts     # Edge runtime auth guard
├── .env.example          # Environment variable template
├── vercel.json           # Vercel deployment config
├── next.config.js        # Next.js configuration
├── tailwind.config.ts    # Tailwind CSS configuration
└── package.json          # Dependencies & scripts
```

---

## License

Internal use only — proprietary software for veterinary clinic operations.

---

## Support

For technical issues or questions, contact the development team or refer to:
- [Next.js Documentation](https://nextjs.org/docs)
- [Siigo Nube API Docs](https://developers.siigo.com)
- [Provet Cloud API Docs](https://developers.provetcloud.com)
- [DIAN Electronic Invoicing](https://www.dian.gov.co/FacturaElectronica)

