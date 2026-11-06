# LANDCHAIN — Backend (Contributor 2)

Complete REST API and **JSON-file** storage layer for the LANDCHAIN fractional
real-estate platform.

- **Stack:** Node.js 20+, Express 4, plain JavaScript (ES modules)
- **Storage:** JSON files in `backend/data` — **no database server**
- **Dependencies:** `express`, `cors` only

Nothing outside `/backend` is modified by this module.

---

## Quick start

```bash
cd backend
npm install
npm run seed     # writes the demo dataset (5 users, 6 properties, ...)
npm start        # http://localhost:5000
```

Then point the frontend at this server:

```bash
# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_USE_MOCK_API=false
```

```bash
npm run smoke    # 79 end-to-end assertions across every API group
```

`npm run smoke` writes records; re-run `npm run seed -- --force` afterwards to
restore the committed demo dataset.

### Environment

Copy `.env.example` to `.env`. The important flags:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `5000` | HTTP port |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed browser origins (comma separated) |
| `AUTH_SECRET` | dev string | HMAC key for session tokens and OTP/PAN fingerprints — **change before sharing** |
| `SESSION_TTL_SECONDS` | `43200` | Session lifetime |
| `OTP_TTL_SECONDS` | `300` | OTP validity |
| `OTP_DEV_MODE` | `true` | Return `devOtp` in OTP responses |
| `OTP_DEMO_CODE` | `123456` | Fixed code accepted while dev mode is on |
| `DEMO_ALLOW_ANONYMOUS` | `true` | Requests without a token act as a seeded demo user |
| `DEMO_ADMIN_BYPASS` | `true` | Demo actors may call admin-only routes |
| `BACKUP_RETENTION` | `25` | Backups kept per collection |

`DEMO_ALLOW_ANONYMOUS` and `DEMO_ADMIN_BYPASS` exist because the current
frontend does not attach a Bearer token. **Set both to `false` for any real
deployment** — then every non-public route requires a valid session.

---

## Storage layout

```
backend/data/
  users.json               accounts, roles, KYC/PAN state, wallet
  properties.json          listings and funding progress
  investments.json         every unit purchase (primary + resale)
  investors.json           per-investor aggregate holdings
  documents.json           document metadata + SHA-256 hashes
  propertyHashes.json      append-only hash registry versions
  transactions.json        append-only ledger
  resaleListings.json      secondary-market listings
  ownershipHistory.json    append-only ownership movements
  verificationRecords.json append-only audit trail
  tokenRecords.json        append-only token allocations/transfers
  platformSettings.json    platform configuration object
```

### Store guarantees (`src/lib/jsonStore.js`)

| Requirement | Implementation |
| --- | --- |
| Centralised storage service | One `JsonStore` singleton used by every service |
| Safe JSON writes | Write to `<file>.<pid>.<ts>.tmp`, then atomic `rename` |
| Backup before important updates | Previous file copied to `data/.backups/` before every write (retention pruned) |
| Prevent simultaneous conflicting updates | In-process promise queue + OS lock file (`data/.write.lock`) with stale-lock recovery; a second process gets `503 STORE_BUSY` |
| Prevent duplicate records | Unique ids, mobile/email uniqueness checks, investment/oversubscription checks |
| Keep ownership history append-only | `appendOnly` collections reject edits and deletions with `409 APPEND_ONLY_VIOLATION` |
| Multi-collection consistency | `transact([...collections], draft => …)` commits all touched files together, so units sold and investments never drift |
| Corruption safety | Invalid JSON fails fast instead of being overwritten |

Append-only collections: `propertyHashes`, `transactions`, `ownershipHistory`,
`verificationRecords`, `tokenRecords`.

---

## Response convention

Success returns the resource directly (array for collections), which is what the
frontend service layer casts to its model types:

```json
{ "id": "LAND-2026-001", "title": "Skyline Residences", "documents": [] }
```

Errors are consistent:

```json
{
  "success": false,
  "message": "Only 355 units are available for this property.",
  "code": "CONFLICT",
  "details": [{ "field": "units", "message": "..." }],
  "requestId": "…"
}
```

List endpoints return a bare array and expose pagination in headers:
`X-Total-Count`, `X-Page`, `X-Page-Size`, `X-Total-Pages`. Every response
carries `X-Request-Id`.

---

## Authentication model

- `POST /api/auth/otp` → simulated OTP (`devOtp` while `OTP_DEV_MODE=true`).
  Codes are stored only as a peppered SHA-256 fingerprint with TTL + attempt limit.
- `POST /api/auth/verify-otp` → HMAC-signed session token (`payload.signature`),
  no server-side session table needed. Unknown mobiles are onboarded as
  `investor` on first verify (simulated registration).
- `Authorization: Bearer <token>` on any request.
- Roles: `buyer`, `seller`, `investor`, `admin`. Roles can be changed by an admin
  via `PATCH /api/users/:id/role`.

**Never exposed:** PAN digits (only `panMasked` + a peppered hash), OTP codes,
token secrets, `AUTH_SECRET`, internal hashes of user credentials.

---

## API reference

### `/api/auth`
| Method | Path | Notes |
| --- | --- | --- |
| POST | `/register` | Mobile registration + OTP challenge |
| POST | `/otp` | Request OTP (`202`) |
| POST | `/verify-otp` | Session token + user |
| POST | `/wallet` | Link EVM address |
| POST | `/pan` | Simulated PAN verification |
| GET | `/session` | Current user (auth) |
| POST | `/logout` | Revokes the presented token |
| GET | `/roles` | Role catalogue |

### `/api/users`
`GET /` (admin, filters `role|kycStatus|status|search`) · `GET /me` ·
`PATCH /me` · `GET /:id` · `PATCH /:id` (self/admin; admin-only KYC/status) ·
`PATCH /:id/role` (admin) · `GET /:id/investments`

### `/api/properties`
`GET /` (filters `search|city|state|category|status|sellerId|minInvestment|maxInvestment|featured|sort`) ·
`POST /` (seller/admin) · `GET /:id` · `PATCH /:id` ·
`PATCH /:id/status` · `GET /:id/quote?units=` · `GET /:id/documents` ·
`GET /:id/versions` · `GET /:id/integrity` · `GET /:id/history`

Sort values: `funding`, `value_asc`, `value_desc`, `yield`, `newest`.
Status moves are validated against an explicit transition table.

### `/api/documents`
`POST /` · `GET /?propertyId=&status=&hashesOnly=true` · `GET /:id` ·
`PATCH /:id/verification` (admin)

Uploads are fictional (JSON metadata, optional `content` string). The stored
hash is always real SHA-256; verification status changes are appended to the
document's `statusHistory`.

### `/api/verification`
`GET /?propertyId=&status=` · `POST /pan` ·
`POST /:propertyId/verify` (admin, `{"action":"approve"|"reject"}`) ·
`GET /:propertyId` (audit trail)

### `/api/investments`
`GET /` · `GET /summary` (portfolio analytics) · `GET /holdings` ·
`GET /:id` · `POST /` (`{ propertyId, units }`)

Validation: property must be investable, `units >= ceil(minInvestment/unitPrice)`,
`units <= availableUnits`, and the platform cap is enforced.

### `/api/transactions`
`GET /?userId=&propertyId=&type=&status=&limit=` · `GET /:id` ·
`POST /` (admin manual entry)

### `/api/property-history`
`GET /?propertyId=&userId=&type=` · `GET /:propertyId` (per-asset chain) ·
`POST /` (admin-only manual append — the collection itself stays append-only)

### `/api/resale`
`GET /?status=` · `GET /stats` · `POST /` · `GET /:id` · `DELETE /:id` ·
`POST /:id/buy`

Buying transfers units FIFO from the seller's investments, then writes a
`resale_purchase`/`resale_sale` transaction pair, a token transfer and an
append-only ownership record.

### `/api/admin`
`GET /stats` · `GET /users` · `GET /properties?status=` ·
`POST /properties/:id/verify` · `GET /transactions` · `GET /investments` ·
`GET|PATCH|PUT /settings` · `GET /backups`

### Frontend-facing aliases
The UI also calls `GET /api/registry`, `GET /api/registry/:id`,
`GET /api/seller/properties`, `POST /api/seller/properties`,
`GET /api/seller/stats`, `GET /api/properties/:id/quote` and
`POST /api/resale/:id/buy`; all are implemented on top of the same services.

### Health
`GET /health` · `GET /api/health/storage` (per-collection record counts and the
append-only list) · `GET /api` (endpoint index)

---

## Property hash registry

Every create/update/status change appends a version to `propertyHashes.json`:

```
hash = sha256(propertyId | version | dataHash | previousHash)
dataHash = sha256(canonical JSON of the hashed asset fields)
```

`GET /api/properties/:id/integrity` recomputes the chain and reports whether it
is intact; `GET /api/properties/:id/versions` lists versions. Deleting or editing
an older version is rejected by the store and would also break verification.

Property ids are sequential and unique per year: `LAND-<YYYY>-<NNN>`.

---

## Security notes

- Only `express` + `cors` are used; no credentials are written to disk in clear
  text (tokens are stateless HMACs, OTPs and PANs are fingerprinted).
- Input is validated per route (`src/lib/validate.js`); unknown routes and
  malformed JSON return 404/400 with the standard error envelope.
- CORS is an explicit allow-list; `*` works only when configured deliberately.
- Rate limiting (in-memory) protects OTP issuance.
- **Blockchain interactions are intentionally out of scope** for this module;
  hashes and tx ids are simulated so the blockchain module can anchor them later.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Start the API |
| `npm run dev` | Start with `--watch` |
| `npm run seed` | Write demo data (skips non-empty store) |
| `npm run seed -- --force` | Overwrite demo data |
| `npm run smoke` | End-to-end API assertions |

## Layout

```
backend/
  data/                 12 JSON collections (committed demo dataset)
  seed/demoData.js      deterministic seed builder
  scripts/seed.mjs      seeding CLI
  scripts/smoke-test.mjs end-to-end API checks
  src/
    app.js server.js config.js
    lib/       store, hashing, ids, validation, responses, security
    middleware/auth, error handling, request context
    services/  auth, user, property, document, verification, hash registry,
               investment, transaction, resale, registry, admin
    routes/    one router per API group
```
