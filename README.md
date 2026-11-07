# LANDCHAIN

**Fractional real estate ownership with verifiable records and a real secondary market.**

LANDCHAIN turns a single income-producing property into a finite supply of whole units, sells those units to many investors, anchors every ownership and document record on **Hedera Testnet**, and lets investors resell units to each other without ever creating new ones.

Built for the ETHGlobal hackathon as four independently owned modules — frontend, backend, blockchain, investment engine — that meet at one REST contract and one JSON store.

`Hedera Testnet` · `Next.js 16` · `Node.js 20+` · `Express 4` · `Solidity 0.8.24` · `HTS + HCS + Mirror Node`

---

## The problem

| Barrier | What it costs today |
| --- | --- |
| Ticket size | Prime Indian property starts around ₹50 lakh; most savers are priced out |
| Liquidity | Selling a fractional interest means finding one buyer for the whole asset |
| Trust | Title, encumbrance and approvals are verified by paperwork, not by verifiable digests |
| Secondary market | Fractional positions have no compliant, auditable place to trade |

## The solution

| Pillar | How LANDCHAIN does it |
| --- | --- |
| **Tokenised ownership** | One finite-supply HTS fungible token per property, `decimals = 0`, so **1 unit = 1 token**. Supply is fixed at the property's total units — the chain cannot mint more. |
| **Verifiable assets** | A SHA-256 digest of the asset fields is registered in `PropertyRegistry`, chained to the previous version. Documents are anchored as `bytes32` digests. Any change produces a new version, never an overwrite. |
| **Programmable primary market** | `InvestmentPool` enforces the funding target, minimum ticket and unit price on-chain. An investment that would exceed the target, or pay the wrong amount, reverts. |
| **Escrowed secondary market** | `ResaleContract` takes units into escrow when a listing is created, reserves them for a buyer, and settles operator-only. Sellers cannot list the same unit twice or spend escrowed units. |
| **Audit by construction** | An HCS topic records `property_registered`, `units_allocated`, `ownership_transfer`, `resale_listed`, `resale_completed` with consensus timestamps — an append-only log that no operator can rewrite. |
| **Off-chain speed, on-chain truth** | The operational store is JSON files with atomic writes and append-only ledgers; Hedera is the trust anchor. The investment engine writes both in one flow. |

## Why Hedera

- **Predictable fixed fees** (about $0.0001 per transaction) make a ₹5,000 investment ticket economically viable — a variable gas auction would not.
- **3–5 second finality** keeps the buy and resell flow usable without a confirmation spinner.
- **HTS is a native token service.** Finite supply, treasury minting, token association and balances are protocol features, so the unit ledger does not depend on a hand-written ERC-20.
- **HCS gives ordering for free.** Every event gets a consensus timestamp and sequence number, which is exactly what an ownership audit trail needs.
- **EVM + Solidity + Mirror Node** means the business rules sit in auditable contracts while reads come from a credential-free REST mirror.

---

## Live on Hedera Testnet

Deployed and verified against Hedera Testnet (chain id `296`). Operator `0.0.11333963`
(`0xbDe59e2266EdF1F1394c20a366699f2EC369A704`). Addresses are recorded in
[`blockchain/deployments/hedera-testnet.json`](blockchain/deployments/hedera-testnet.json).

| Component | Address / ID |
| --- | --- |
| PropertyRegistry | [`0x85f83F17F954b98357D199826B1c8b28ddbdB9C4`](https://hashscan.io/testnet/contract/0x85f83F17F954b98357D199826B1c8b28ddbdB9C4) |
| InvestmentPool | [`0x29B45a3cf3a0770C7F018f04E124eFD00F12237c`](https://hashscan.io/testnet/contract/0x29B45a3cf3a0770C7F018f04E124eFD00F12237c) |
| TokenAllocation | [`0x26aeE113425906B4e92646f2159FA0cD21b2F5BC`](https://hashscan.io/testnet/contract/0x26aeE113425906B4e92646f2159FA0cD21b2F5BC) |
| ResaleContract | [`0x4Eb2feE8fe75f1F72B082Dd2ABa58b0DB58a87C0`](https://hashscan.io/testnet/contract/0x4Eb2feE8fe75f1F72B082Dd2ABa58b0DB58a87C0) |
| HCS activity topic | [`0.0.11347205`](https://hashscan.io/testnet/topic/0.0.11347205) |
| Demo property token | [`0.0.11347218`](https://hashscan.io/testnet/token/0.0.11347218) `LAND900`, 1,000 units |

Confirmed testnet transactions from the deployment run:

- property registration — [`0xa606dd45…`](https://hashscan.io/testnet/transaction/0xa606dd4562862dc1e2ec27a6528d429373eb7e694233428266cae6ee530d9961)
- document hash anchor — [`0x8dd855a1…`](https://hashscan.io/testnet/transaction/0x8dd855a1beee63e0f3fc428e48c6fa16f89f9269ff671e3bb22dec21d64a2a41)
- HCS event — [`0.0.11333963@1794009378.705042315`](https://hashscan.io/testnet/transaction/0.0.11333963@1794009378.705042315)

`npm run verify:testnet` reports **8/8 checks passed** (network, mirror node, operator balance, four contracts with bytecode, topic with submit key).

---

## Architecture

```
                         ┌──────────────────────────────────────────────┐
                         │  Frontend — Next.js 16 (App Router)          │
                         │  investor · buyer · seller · admin · registry│
                         │  resale marketplace · property detail        │
                         └───────────────────────┬──────────────────────┘
                                                 │ REST (JSON)
                         ┌───────────────────────▼──────────────────────┐
                         │  Backend — Express + JSON store              │
                         │  auth · properties · documents · verification│
                         │  transactions · registry · admin             │
                         │  atomic transact() · append-only ledgers     │
                         └───────────┬───────────────────────┬──────────┘
                                     │                       │
              ┌──────────────────────▼──────┐   ┌────────────▼─────────────────┐
              │  Investment engine          │   │  Blockchain service          │
              │  thresholds · external      │   │  BlockchainService           │
              │  investors · ownership      │   │  registerProperty            │
              │  pooling · resale escrow    │   │  allocateUnits / transfer    │
              │  reservations · audit       │   │  resale escrow · HCS events  │
              └──────────────┬──────────────┘   └────────────┬─────────────────┘
                             │                               │
                             │                    ┌──────────▼───────────┐
                             │                    │  Hedera Testnet      │
                             │                    │  HTS · HCS · EVM     │
                             │                    │  Mirror Node (read)  │
                             │                    └──────────────────────┘
                             │
                  ┌──────────▼───────────────────────────────────────────┐
                  │  backend/data/*.json  — single operational store      │
                  │  investments · investors · resaleListings ·           │
                  │  ownershipHistory · transactions · tokenRecords · …   │
                  └──────────────────────────────────────────────────────┘
```

**One store, two markets, one chain anchor.** The engine does not keep a second database: it instantiates the backend's `JsonStore` against the same `backend/data` directory, so a resale the engine settles is immediately visible to the backend API and the UI.

---

## Repository layout

```
.
├── frontend/            Next.js 16 app: 13 routes, role workspaces, charts
├── backend/             Express REST API + JSON storage + seed + smoke tests
├── blockchain/          Hedera integration: contracts, HTS, HCS, mirror, service
└── investment-engine/   Thresholds, external investors, ownership, pooling, resale
```

Each module has its own README with the full API reference:

- [`frontend/README.md`](frontend/README.md)
- [`backend/README.md`](backend/README.md)
- [`blockchain/README.md`](blockchain/README.md)
- [`investment-engine/README.md`](investment-engine/README.md)
- [`blockchain/docs/INTEGRATION.md`](blockchain/docs/INTEGRATION.md)

---

## Feature set

| Persona | Capabilities |
| --- | --- |
| **Investor** | Portfolio value, allocation by category, units held, ownership %, transaction ledger, rental and appreciation projections from the quoting endpoint |
| **Buyer** | Filterable marketplace, investment calculator, property detail, primary purchase, resale purchase |
| **Seller** | Seller portfolio and funding chart, add a property, document upload with hashes, verification status |
| **Admin** | Verification queue, user and role management, property status transitions, transaction and investment inspection, platform settings, backups |
| **Everyone** | Public registry with hash history and integrity check, resale marketplace, append-only ownership history |

### Investment engine rules

Defaults are resolved per property; the property's own `totalValue`, `unitPrice`, `totalUnits` and `minInvestment` always win, and an optional `investmentRules` object can override the caps.

| Rule | Default |
| --- | --- |
| Property valuation | ₹50,00,000 |
| Total units | 5,000 |
| Unit value | ₹1,000 |
| Buyer minimum | ₹5,000 / 5 units |
| Buyer maximum | 20% of total units |
| External investor minimum | ₹10,000 / 10 units |
| External investor maximum | 25% of the funding target |
| Investors per property | 3 minimum, 50 maximum |

Ownership is `(investor units / total units) × 100`.

**Primary market is two-phase.** An investment is first reserved (`pending` + `property.unitsReserved`), then the ledger is called, then it is confirmed in a single atomic write that moves the reservation to `unitsSold` and appends the transaction, token and ownership records together. Concurrent buyers cannot oversell a property, and a failed ledger call releases the reservation.

Rejections carry stable codes: `BELOW_MINIMUM_UNITS`, `CONTRIBUTION_CAP_EXCEEDED`, `SUPPLY_EXHAUSTED`, `INVESTOR_CAPACITY_FULL`, `INVESTOR_MINIMUM_NOT_MET`, `PROPERTY_NOT_OPEN`, `PLATFORM_CAP_EXCEEDED`.

### Resale lifecycle

```
Investor A holds 100 units
  create listing 40 @ ₹1,200   →  40 units escrowed, 60 listable
  Investor B reserves           →  listing locked for B until the window expires
  Investor B buys               →  A holds 60, B holds 40
                                  no new tokens, property.unitsSold unchanged
  seller cancels instead        →  escrow released, A can list 100 again
```

Guarantees enforced in code: no double listing, no spending escrowed units, no buying a listing reserved by someone else, no self-purchase, no resale of unowned units, and a listing the seller can no longer back is cancelled with its escrow released. Every movement writes a `transfer` token record and a `resale_transfer` ownership record — never an `allocation`.

---

## Integrity and security

| Concern | Control |
| --- | --- |
| Partial writes across collections | `JsonStore.transact([...])` persists every touched file together, after an atomic temp-file rename |
| Concurrent writers | In-process queue + OS lock file with stale-lock recovery; a second process receives `503 STORE_BUSY` |
| History tampering | `transactions`, `ownershipHistory`, `tokenRecords`, `propertyHashes`, `verificationRecords` are append-only at the store level (`409 APPEND_ONLY_VIOLATION`) |
| Asset tampering | Hash chain: `sha256(propertyId | version | dataHash | previousHash)`; `/integrity` recomputes it |
| Double spend | Unit escrow for listings; supply reservation for pending investments |
| Contract abuse | Role-gated contracts, no open transfer function, escrow authorised as the only caller that may move units, two-step admin handover |
| Key handling | Keys live only in git-ignored `.env`; no endpoint returns or logs them; Testnet-only guard in the SDK client |
| Fabricated chain data | Every stored Hedera id is a receipt or HCS sequence. When the ledger is not configured, the record says `not_anchored` and `hederaTransactionId: null` |
| Personal data | OTPs and PANs are stored as peppered hashes; only `panMasked` is returned; sessions are stateless HMAC tokens |
| Demo-only auth bypass | `DEMO_ALLOW_ANONYMOUS` / `DEMO_ADMIN_BYPASS` are documented and must be disabled for any real deployment |

---

## Integration status — what is real, what is simulated

We would rather be precise than impressive:

| Area | Status |
| --- | --- |
| Hedera contracts, HTS token, HCS topic, Mirror reads | **Live on Testnet**, deployed and verified 8/8 |
| Blockchain service → Hedera writes | **Real receipts.** No id is generated client-side |
| Investment engine → blockchain service | **Wired.** `ENGINE_LEDGER_MODE=auto` anchors when `blockchain/.env` is configured; otherwise it records `not_anchored` with the reason instead of faking a hash |
| Backend → blockchain | The backend keeps simulated `pseudoTxHash` ids by design (Contributor 2 scoped chain calls out); the wiring path is documented in `blockchain/docs/INTEGRATION.md` and demonstrated end-to-end by the engine |
| KYC / OTP / PAN verification | Simulated flows (demo OTP `123456`) with real hashing and masking |
| Payments | Not implemented. Investments settle against a generated payment reference; a payment rail is roadmap work |
| Frontend ↔ backend | Real REST when `NEXT_PUBLIC_USE_MOCK_API=false`; deterministic mock fallback otherwise so every screen stays navigable |
| Legal wrapper (SPV / REIT structure) | Out of scope for the prototype |

---

## Quick start

Prerequisites: Node.js 20.11+ (22 LTS recommended), npm.

### 1. Backend (port 5000)

```bash
cd backend
npm install
npm run seed          # deterministic demo dataset
npm start
```

### 2. Investment engine (port 5100)

```bash
cd investment-engine
npm install
npm run seed          # LAND-2026-010: ₹50,00,000 / 5,000 units @ ₹1,000 + 3 investors
npm start
```

### 3. Frontend (port 3000)

```bash
cd frontend
cp .env.example .env.local
# .env.local
# NEXT_PUBLIC_API_URL=http://localhost:5000
# NEXT_PUBLIC_USE_MOCK_API=false
npm install
npm run dev
```

Open <http://localhost:3000>, sign in with any valid Indian mobile number and OTP `123456`.

### Optional: Hedera contracts and tests

```bash
cd blockchain
npm install
npm test                 # 37 contract tests + 60 unit tests, no network needed
npm run compile          # Solidity artifacts
npm run verify:testnet   # checks the live deployment (needs blockchain/.env)
```

---

## Five-minute demo script

1. **Registry** — open `/registry`, pick an asset, show the SHA-256 hash, version history and the `integrity: intact` check.
2. **Buy primary** — as an investor, buy units in `LAND-2026-010`. Show the quote endpoint's threshold validation *before* the purchase (try 4 units and watch it refuse).
3. **Ownership** — `GET http://localhost:5100/api/engine/properties/LAND-2026-010/ownership` shows three holders, their units and exact percentages, and total vs available supply.
4. **Pooling** — `GET …/funding` shows raised amount, remaining amount, investor count and whether the round can close (3-investor minimum).
5. **Resale** — as `ext-001`, list 40 units at ₹1,200; `…/resale/available` drops from 100 to 60. Reserve as `ext-002`, then buy. Seller becomes 60, buyer becomes 60, and total supply is still 130/5,000.
6. **Audit** — `GET http://localhost:5100/api/engine/audit` reconciles supply, token ledger, ownership history, escrow and profiles. `ok: true`.
7. **Chain proof** — open the HashScan links above: four contracts, the HCS topic and the HTS token are live.

---

## Verification and test evidence

| Suite | Command | Result |
| --- | --- | --- |
| Backend API smoke | `cd backend && npm run smoke` | 79 assertions across every API group |
| Smart contracts | `cd blockchain && npm run test:contracts` | 37 Hardhat tests |
| Blockchain units | `cd blockchain && npm run test:unit` | 60 unit tests |
| Live testnet deployment | `cd blockchain && npm run verify:testnet` (needs `blockchain/.env`) | 8/8 checks at deployment time |
| Investment engine unit | `cd investment-engine && npm test` | 4 tests (thresholds, ownership maths, caps, full lifecycle) |
| Investment engine HTTP e2e | `cd investment-engine && npm run e2e` | 22 checks on a throwaway data dir |

The engine e2e proves the invariants that matter: minimum and cap rejection, supply accounting, escrow preventing double listing, reservation blocking third-party purchase, seller 100→60 / buyer 20→60 on a 40-unit resale, unchanged supply, and a clean append-only audit.

---

## API at a glance

**Backend — `http://localhost:5000`**

| Group | Endpoints |
| --- | --- |
| `/api/auth` | `register`, `otp`, `verify-otp`, `wallet`, `pan`, `session`, `logout`, `roles` |
| `/api/properties` | list/filter, create, detail, update, status, `quote`, `documents`, `versions`, `integrity`, `history` |
| `/api/investments` | list, `summary`, `holdings`, detail, create |
| `/api/resale` | list, `stats`, create, detail, cancel, buy |
| `/api/documents` · `/api/verification` · `/api/registry` | metadata + hashes, KYC/asset verification, public registry records |
| `/api/transactions` · `/api/property-history` · `/api/admin` | append-only ledger, per-asset chain, platform operations |
| `/health` · `/api/health/storage` | liveness, collection counts, append-only list |

**Investment engine — `http://localhost:5100/api/engine`**

| Group | Endpoints |
| --- | --- |
| `/investors` | register external investor, list, profile, history, holdings |
| `/investments` | `quote`, create, list, detail, `release-stale` |
| `/properties` | funding overview, per-property funding, ownership, ownership history |
| `/resale` | create, list, `available`, `history`, `stats`, detail, `reserve`, `release`, `cancel`, `buy` |
| `/audit` · `/health` · `/config` | integrity report, ledger status, effective thresholds |

---

## Roadmap

1. **Retire simulated ids.** Point Contributor 2's investment/property services at `BlockchainService` so `txHash` is always a receipt (the engine already shows the pattern).
2. **Payments.** UPI/escrow settlement with a payment reference bound to the listing, so a reservation can only complete against a settled payment.
3. **Wallet-signed resale.** Move listing/reservation signing into the frontend wallet (HashPack/Blade/MetaMask on chain 296) instead of the operator key.
4. **KYC provider.** Replace simulated PAN checks with a CKYC/NSDL-integrated flow; keep only hashes on chain.
5. **Storage.** Swap `JsonStore` for Postgres behind the same `transact()` interface; the collection semantics and append-only guards already model a database.
6. **Mainnet readiness.** Multisig admin, operator key in KMS/HSM, audit of the four contracts, and a legal SPV wrapper per asset.

---

## Team

| Module | Contributor |
| --- | --- |
| Frontend, design system, role workspaces | [@mitalimali358-rgb](https://github.com/mitalimali358-rgb) |
| Backend REST API, JSON storage, verification flows | [@aditibhosale-2111](https://github.com/aditibhosale-2111) |
| Hedera integration, contracts, HTS/HCS, deployment | [@Hardik-369](https://github.com/Hardik-369) |
| Investment engine, ownership, pooling, resale marketplace | [@DevshriDamle](https://github.com/DevshriDamle) |

---

## Notes

- Everything targets **Hedera Testnet** (chain id `296`). There is no mainnet configuration in the repository.
- Demo credentials are intentional: OTP `123456`, demo wallet and PAN `ABCDE1234F`. Disable `DEMO_ALLOW_ANONYMOUS` and `DEMO_ADMIN_BYPASS` before exposing the API.
- This is a hackathon prototype, not investment advice and not a licensed securities offering.
