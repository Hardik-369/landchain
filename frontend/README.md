# LANDCHAIN — Frontend

Contributor 1 deliverable: the complete responsive frontend and UI/UX for the
LANDCHAIN fractional real-estate platform.

Built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS v4**,
shadcn-style UI primitives (Radix), **Recharts** and **lucide-react**.

## Running locally

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
```

## Demo flow

1. Open `/auth`, enter any valid 10-digit Indian mobile number (starts with 6–9),
   pick a role and accept the consent checkbox.
2. Enter the OTP `123456` (shown on screen while the backend OTP service is not
   connected).
3. Link a wallet (paste an address or use the demo wallet) and verify a PAN
   (`ABCDE1234F`).
4. You land in the workspace for the role you selected.

| Role | Entry point | What it shows |
| --- | --- | --- |
| Investor | `/investor` | Portfolio value, allocation, units, transaction ledger |
| Buyer | `/buyer` | Marketplace of 15 seeded properties, filters, calculator |
| Seller | `/seller` | Seller portfolio, funding chart, add-property form |
| Admin | `/admin` | Verification queue, users, investments, transactions |

Supporting screens: `/buyer/[id]` property detail, `/registry` public registry,
`/registry/[id]` record with hashes and verification timeline, `/resale` resale
marketplace.

## API integration

All persistence and computation flows through `src/lib/api/*`:

| Module | Contracts |
| --- | --- |
| `client.ts` | Base URL, timeout, error type, mock fallback |
| `auth.ts` | `POST /api/auth/otp`, `/verify-otp`, `/wallet`, `/pan` |
| `properties.ts` | `GET /api/properties`, `GET /api/properties/:id` |
| `portfolio.ts` | `GET /api/investments`, `/summary`, `/transactions`, `GET /api/properties/:id/quote`, `POST /api/investments` |
| `seller.ts` | `GET/POST /api/seller/properties`, `GET /api/seller/stats` |
| `registry.ts` | `GET /api/registry`, `GET /api/registry/:id` |
| `resale.ts` | `GET/POST /api/resale`, `DELETE /api/resale/:id`, `POST /api/resale/:id/buy` |
| `admin.ts` | `GET /api/admin/stats`, `/users`, `/properties`, `POST /api/admin/properties/:id/verify` |

Set `NEXT_PUBLIC_API_URL` to the shared backend to use the real endpoints.
When it is unset (or a request fails), the service layer serves deterministic
mock responses from `src/lib/mock/*` so every screen stays navigable. Set
`NEXT_PUBLIC_USE_MOCK_API=false` to disable the fallback.

Investment projections are computed by the quoting endpoint — components never
hardcode returns, ownership percentages or unit maths.

## Design system

- Dark navy (`#060b18`) base with white marketing sections, emerald verification
  accents.
- Design tokens live in `src/app/globals.css` (`@theme`).
- UI primitives live in `src/components/ui/*` (shadcn pattern with `cn`).
- Charts in `src/components/charts/*` are client components built on Recharts.

Nothing outside `/frontend` is modified by this module.
