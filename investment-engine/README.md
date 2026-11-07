# LANDCHAIN — Investment Engine

Contributor 4's module: the investment threshold system, external investor
programme, fractional ownership accounting, investment pooling and the secondary
resale marketplace.

It is a standalone Express service that **shares Contributor 2's JSON store**
(`backend/data`) and **calls Contributor 3's Hedera service**. It does not modify
`/backend`, `/blockchain` or `/frontend` — it only imports their public modules.

```
investment-engine/
├── src/
│   ├── config.js              # env + data dir + ledger mode
│   ├── thresholds.js          # investment rules and the ownership formula
│   ├── app.js / server.js     # Express service on :5100
│   ├── lib/
│   │   ├── store.js           # adapter over backend/src/lib/jsonStore.js
│   │   ├── ledger.js          # adapter over blockchain/src/index.js
│   │   ├── portfolio.js       # holdings, supply and funding projections
│   │   └── records.js         # transaction / token / ownership writers
│   ├── services/
│   │   ├── investor.service.js     # external investor registration + history
│   │   ├── investment.service.js   # validation, reservation, confirmation
│   │   ├── ownership.service.js    # fractional ownership projections
│   │   ├── pooling.service.js      # funding progress per property
│   │   ├── resale.service.js       # escrow, reservations, transfers
│   │   └── audit.service.js        # append-only integrity checker
│   └── routes/
├── scripts/seed.mjs           # spec-matching demo property + 3 investors
├── scripts/e2e.mjs            # 22-check HTTP lifecycle test
└── test/engine.test.js        # unit + lifecycle tests
```

## Quick start

```bash
cd investment-engine
npm install
npm run seed          # adds LAND-2026-010 (₹50,00,000 / 5,000 units @ ₹1,000)
npm start             # http://localhost:5100/api/engine
```

```bash
npm test              # thresholds, caps, supply, no-mint resale invariant
npm run e2e           # boots the real app on a throwaway data dir, 22 checks
npm run verify        # both
```

The service reads and writes `backend/data/*.json`, so start it **instead of**
(or beside) the backend. Contributor 2's API immediately sees engine records:

```bash
curl "http://localhost:5000/api/investments/holdings?userId=ext-002"
# [{ "propertyId": "LAND-2026-010", "units": 60, "ownershipPercent": 1.2, ... }]
```

## Investment rules

`GET /api/engine/config` returns the effective defaults, resolved by
`thresholds.js`:

| Rule | Default | Source |
| --- | --- | --- |
| Property valuation | ₹50,00,000 | property `totalValue` |
| Total units | 5,000 | property `totalUnits` |
| Unit value | ₹1,000 | property `unitPrice` |
| Buyer minimum | ₹5,000 / 5 units | `max(property.minInvestment, 5 units)` |
| Buyer maximum | 20% of total units | `maxBuyerContributionPercent` |
| External minimum | ₹10,000 / 10 units | `external.minUnits` |
| External maximum | 25% of the funding target | `external.maxContributionPercent` |
| Investors per property | 3 minimum, 50 maximum | `external.minInvestors/maxInvestors` |

A property's own `totalValue`, `unitPrice`, `totalUnits` and `minInvestment`
always win, so the same engine works on the existing seeded assets. An optional
`investmentRules` object on a property can override the caps:

```json
{
  "id": "LAND-2026-010",
  "investmentRules": {
    "maxBuyerContributionPercent": 20,
    "minBuyerUnits": 5,
    "external": { "maxContributionPercent": 25, "minInvestors": 3, "maxInvestors": 50 }
  }
}
```

Ownership percentage: `(investor units / total units) × 100`, 4 decimals.

## API

Base: `http://localhost:5100/api/engine`. The acting investor comes from the
`x-user-id` header (or `userId` in the body); `x-user-role: admin` unlocks
administrative actions.

### Investors

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/investors` | Register an external investor (creates/links a user record) |
| `GET` | `/investors?type=external&propertyId=` | List investors |
| `GET` | `/investors/:userId` | Profile + aggregates |
| `GET` | `/investors/:userId/history` | Investments, transactions, ownership, resales |
| `GET` | `/investors/:userId/holdings` | Units per property with percentages |

### Primary market

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/investments/quote` | Eligibility + price without writing |
| `POST` | `/investments` | Buy units (reserve → ledger → confirm) |
| `GET` | `/investments?userId=&propertyId=&status=` | Investment records |
| `GET` | `/investments/:id` | Investment with its transaction/token/ownership rows |

### Ownership, pooling, integrity

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/properties?status=` | Every property with funding progress |
| `GET` | `/properties/:propertyId` | Pool terms + funding snapshot |
| `GET` | `/properties/:propertyId/ownership` | Holders, percentages, listable balance |
| `GET` | `/properties/:propertyId/ownership-history` | Append-only movements |
| `GET` | `/audit` | Reconciles supply, tokens, ownership, profiles (`200` clean / `409` drift) |
| `GET` | `/health` | Service + ledger status |

### Resale market

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/resale` | List units (escrowed immediately) |
| `GET` | `/resale?status=active\|sold\|cancelled` | Listings |
| `GET` | `/resale/available?sellerId=&propertyId=` | `held`, `available`, escrowed |
| `GET` | `/resale/history?propertyId=&userId=` | Seller/buyer wallets, units, price, timestamp, Hedera id |
| `GET` | `/resale/stats` | Volume, premiums, reservation counts |
| `GET` | `/resale/:id` | One listing |
| `POST` | `/resale/:id/reserve` | Buyer reserves for `RESALE_RESERVATION_TTL_SECONDS` |
| `POST` | `/resale/:id/release` | Release a reservation |
| `POST` | `/resale/:id/cancel` | Cancel and release the seller's escrow |
| `POST` | `/resale/:id/buy` | Transfer units to the buyer |

Example:

```bash
curl -X POST http://localhost:5100/api/engine/resale \
  -H "content-type: application/json" -H "x-user-id: ext-001" \
  -d '{"propertyId":"LAND-2026-010","units":40,"pricePerUnit":1200}'
```

## Resale lifecycle

```
create listing      held 100 → escrow 40 → available 60
buyer reserves      listing locked for that buyer (others get 409)
reservation expires released automatically on the next read/buy
seller cancels      escrow 40 released → available 100
buyer purchases     seller 100 → 60, buyer N → N + 40
                    no new tokens, property.unitsSold unchanged
```

Guarantees enforced in `resale.service.js`:

- a unit can only be listed once at a time (`held − escrowed`);
- a reserved listing cannot be bought or reserved by someone else;
- a listing the seller can no longer back is cancelled and its escrow released;
- the resale ledger writes a `transfer` token record and a
  `resale_transfer` ownership record — never an `allocation`.

## Shared JSON records

No separate database. All writes go through `JsonStore.transact()` so
cross-collection invariants persist atomically (and the append-only guard on
`transactions`, `ownershipHistory`, `tokenRecords` is preserved):

| File | Engine writes |
| --- | --- |
| `investments.json` | `pending` → `confirmed` investments, split rows on resale |
| `investors.json` | profiles, holdings, totals, `investorType` |
| `resaleListings.json` | listings, escrow state, buyer reservations, settlement |
| `ownershipHistory.json` | `primary_allocation`, `resale_transfer` |
| `transactions.json` | `investment`, `resale_purchase`, `resale_sale` |
| `tokenRecords.json` | `allocation` (mint) and `transfer` (move) |

Every investment is confirmed in a single transaction with its property supply,
transaction row, token row, ownership row and investor profile update.

## Hedera integration

The engine never fakes a transaction. `lib/ledger.js` wraps Contributor 3's
`getBlockchainService()` and exposes only real receipts:

| Engine action | Blockchain call |
| --- | --- |
| Investment confirmed | `recordInvestment()` then `allocateUnits()` |
| Unit allocation | `allocateUnits()` (HTS + TokenAllocation) |
| Resale settlement | `completeResale()` when the listing has an on-chain id, else an HCS event |
| Ownership event | `recordPropertyEvent()` (`resale_listed`, `resale_completed`, `resale_cancelled`) |

`ENGINE_LEDGER_MODE`:

- `auto` (default) — use Hedera when `blockchain/.env` has operator credentials
  and all four contract addresses; otherwise record `anchor.status =
  "not_anchored"` with the reason and `hederaTransactionId: null`.
- `live` — require Hedera. A missing configuration is a `503
  LEDGER_NOT_CONFIGURED` and the investment is not written.
- `local` — never load the blockchain module.

A real Hedera id is only ever stored from a receipt: `anchor.transactionId` is
the SDK transaction id, `anchor.transactionHash` the contract hash,
`anchor.sequenceNumber` the HCS sequence. Investment `txHash` is `null` when
unanchored.

## Validation

`investment.service.js` rejects with a stable code:

| Code | Status | Reason |
| --- | --- | --- |
| `PROPERTY_NOT_OPEN` | 409 | Property is not `open`/`active` |
| `INVALID_UNITS` | 422 | Not a positive whole number |
| `BELOW_MINIMUM_UNITS` | 422 | Below the buyer/external minimum |
| `CONTRIBUTION_CAP_EXCEEDED` | 422 | Would exceed 20% / 25% |
| `SUPPLY_EXHAUSTED` | 409 | Not enough unreserved units |
| `INVESTOR_CAPACITY_FULL` | 409 | Property already has 50 investors |
| `INVESTOR_MINIMUM_NOT_MET` | 422 | Round cannot close below 3 investors |
| `PLATFORM_CAP_EXCEEDED` | 422 | Exceeds `platformSettings.maxInvestmentAmount` |

Resale rejects unowned units, double listings, over-balance listings, reserved
listings sold to a third party, and self-purchases. Unit supply is reserved by a
`pending` investment before the ledger call, so concurrent buyers cannot
oversell; failed or timed-out ledger calls release the reservation
(`POST /investments/release-stale` forces the sweep).

## Coordination

- **Contributor 1 (frontend)** — point an API client at `/api/engine`; the
  payload shapes mirror the backend's investment/resale models.
- **Contributor 2 (backend)** — the engine imports `JsonStore`, `COLLECTIONS`,
  `makeId`, `AppError`, `Validator` and the record constants. No backend file is
  changed.
- **Contributor 3 (blockchain)** — the engine imports
  `blockchain/src/index.js` only. No contract or Hedera code is duplicated.
