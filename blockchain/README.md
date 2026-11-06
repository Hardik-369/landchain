# LANDCHAIN — Hedera Blockchain Integration (Contributor 3)

Complete Hedera **Testnet-only** integration for the LANDCHAIN fractional
real-estate platform: property hash anchoring, an append-only consensus log,
property investment tokens, Solidity escrow/resale contracts and Mirror Node
reads.

Everything lives in `/blockchain`. No other contributor's module is modified.

---

## What is implemented

| Requirement | Implementation |
| --- | --- |
| Hedera wallet integration | `src/hedera/wallet.js` — account ID / EVM alias resolution, account info, EIP-1193 browser connect with chain switch to Testnet, HBAR transfers |
| Property hash registry | `contracts/PropertyRegistry.sol` + `registerProperty()` / `updatePropertyHash()` / `storeDocumentHash()` |
| Hedera Consensus Service | `src/hedera/consensus.js` — topic creation, submit-key protection, append-only activity log, mirror read-back |
| Hedera Token Service | `src/hedera/token.js` — one finite-supply fungible token per property, association checks, allocation and transfers |
| Solidity contracts | Property registry, investment pool, token allocation ledger, resale escrow (all with role-gated access) |
| Mirror Node integration | `src/hedera/mirror.js` — transactions, status, token info/balances, topics, accounts, HashScan links |
| Security | Env-only keys, typed validation on every input, role-based contract access, no fabricated transaction IDs, key never in a response |
| Reusable service | `src/services/blockchain.service.js` exposes the exact required function names |
| Backend coordination | `src/api/router.js` — mountable Express router + `docs/INTEGRATION.md` |

---

## Architecture

```
                    ┌─────────────────────────────────────────────┐
 Contributor 1      │  Frontend (Next.js)                         │
 (wallet UI) ──────▶│  connectBrowserWallet()  → chain 296        │
                    └──────────────────┬──────────────────────────┘
                                       │ REST
                    ┌──────────────────▼──────────────────────────┐
 Contributor 2      │  Backend (Express + JSON store)              │
 (REST API) ───────▶│  /api/blockchain/*  → createBlockchainRouter │
                    └──────────────────┬──────────────────────────┘
                                       │ BlockchainService
     ┌─────────────────────────────────┼─────────────────────────────────┐
     │                                 │                                 │
┌────▼─────────────┐        ┌──────────▼────────────┐          ┌─────────▼──────────┐
│ Hedera SDK       │        │ ethers + JSON-RPC     │          │ Mirror Node REST   │
│ HCS · HTS · HBAR │        │ Hedera Smart Contract │          │ reads only         │
└────┬─────────────┘        └──────────┬────────────┘          └─────────┬──────────┘
     │                                 │                                 │
     ▼                                 ▼                                 ▼
 HCS topic 0.0.x              PropertyRegistry / InvestmentPool /   tx · token · topic
 (audit log)                  TokenAllocation / ResaleContract      account queries
```

---

## Quick start

```bash
cd blockchain
npm install
npm run compile      # Solidity → artifacts
npm test             # 37 contract tests + 53 unit tests, no network needed
```

### 1. Testnet account

Create a free account at <https://portal.hedera.com> and select **Testnet**.

```bash
cp .env.example .env
```

Fill in:

```ini
HEDERA_OPERATOR_ID=0.0.1234567
HEDERA_OPERATOR_KEY=302e020100300506032b657004220420...   # DER or raw key
HEDERA_OPERATOR_EVM_KEY=0x...                              # 32-byte ECDSA key, for the relay
```

`HEDERA_OPERATOR_EVM_KEY` is the ECDSA key of the **same** account, in the form
the Hedera JSON-RPC relay accepts. The portal shows both the DER key and the
ECDSA key. Keys stay in `.env` (git-ignored) and are never printed or returned.

### 2. Deploy the contracts

```bash
npm run deploy:testnet
```

Copy the printed addresses into `.env`:

```ini
PROPERTY_REGISTRY_ADDRESS=0x...
INVESTMENT_POOL_ADDRESS=0x...
TOKEN_ALLOCATION_ADDRESS=0x...
RESALE_CONTRACT_ADDRESS=0x...
```

The deployment writes `deployments/hedera-testnet.json` and wires the roles:
verifier on the registry, operator on the pool/allocation/resale contracts and
the resale contract as the only authorised escrow on the allocation ledger.

### 3. Create the HCS activity topic

```bash
npm run topic:create
```

```ini
HEDERA_PROPERTY_TOPIC_ID=0.0.9876543
```

The operator holds the submit key, so only this backend can append events.

### 4. Verify the live integration

```bash
npm run verify:testnet                  # mirror, operator, contracts, topic
npm run verify:testnet -- --token 0.0.7001
npm run demo                            # optional end-to-end write flow
```

---

## Solidity contracts

All contracts compile with Solidity `0.8.24`, optimizer on, `paris` EVM target —
no PUSH0 opcodes, so the bytecode runs on Hedera's EVM without surprises.

### `PropertyRegistry.sol`

Append-only hash history per property ID.

| Function | Access | Purpose |
| --- | --- | --- |
| `registerProperty(propertyId, propertyHash)` | verifier/operator/admin | first hash + timestamp |
| `updatePropertyHash(propertyId, newHash)` | verifier/admin | supersede the current hash, keeps history |
| `storeDocumentHash(propertyId, documentHash, documentType)` | verifier/admin | anchor a document digest |
| `getProperty`, `getPropertyHashHistory`, `getDocument`, `getDocumentHashes`, `verifyPropertyHash`, `propertyCount` | anyone | reads |

Hashes are `bytes32` SHA-256 digests. The contract never deletes a hash.

### `InvestmentPool.sol`

Funding target, minimum investment and unit price, validated on-chain.

`recordInvestment(propertyId, investor, units, amount, paymentRef)` reverts when:

- the pool is missing or closed,
- `units == 0` or exceed the remaining units,
- `amount != units * unitPrice`,
- `amount < minInvestment`,
- the investment pushes `amountRaised` past `targetAmount`.

`openPool`, `closePool`, `reopenPool`, `getPool`, `fundingProgressBps`,
`isFunded`, `unitsRemaining`, `contributionOf`, `getInvestment`.

### `TokenAllocation.sol`

Fixed unit supply per property and property-scoped investor balances.

- `setPropertySupply(propertyId, totalUnits)` — operator, once.
- `allocate(propertyId, investor, units)` — operator/authorised, capped by supply.
- `transferUnits(propertyId, from, to, units)` — operator/authorised contracts only. There is **no** open transfer function, so an outsider cannot move anyone's units.
- `ownershipBps(propertyId, investor)` — ownership in basis points (10 000 = 100%).
- `setAuthorizedContract(address, bool)` — admin; grants/revokes the escrow contract.

### `ResaleContract.sol`

Escrow-based resale: units leave the seller when the listing is created and only
move again on settlement or cancellation.

```
createListing → (reserveUnits) → completeResale
              → cancelListing   (returns escrowed units)
```

- `completeResale` requires an active (non-expired) reservation and is operator-only.
- Sellers cannot reserve their own listing; a second buyer is blocked while a reservation is live.
- Reservation window defaults to 15 minutes (`MIN 1 min`, `MAX 7 days`).

---

## Service API

`src/services/blockchain.service.js` / `getBlockchainService()`.

### Required surface

| Function | Chain operations |
| --- | --- |
| `registerProperty({ propertyId, propertyHash, actor?, metadata? })` | PropertyRegistry + HCS `property_registered` |
| `storeDocumentHash({ propertyId, documentHash, documentType?, actor? })` | PropertyRegistry + HCS `document_verified` |
| `recordPropertyEvent({ propertyId, eventType, data?, actor? })` | HCS only |
| `createPropertyToken({ propertyId, name?, symbol, totalUnits, actor? })` | HTS token create + HCS `token_created` |
| `allocateUnits({ propertyId, tokenId, investorAccountId, units, actor? })` | TokenAllocation + HTS transfer + HCS `units_allocated` |
| `transferUnits({ propertyId, tokenId, fromAccountId, toAccountId, units, signerKey? })` | HTS transfer + TokenAllocation + HCS `ownership_transfer` |
| `getTokenBalance({ tokenId, accountId })` | Mirror Node |
| `getTransactionHistory({ accountId, limit? })` | Mirror Node |

### Supporting reads/writes

`connectWallet`, `getAccountInfo`, `checkAccount`, `connectBrowserWallet`,
`updatePropertyHash`, `getPropertyEvents`, `getActivityLog`, `getTokenInfo`,
`getAccountTokens`, `configurePropertyOnChain`, `recordInvestment`,
`getInvestmentPool`, `getPropertyRecord`, `verifyDocumentHash`,
`getRegisteredProperties`, `getAllocation`, `createResaleListing`,
`reserveUnits`, `cancelReservation`, `completeResale`, `cancelListing`,
`getResaleListing`, `getTransaction`, `getTransactionStatus`,
`getExplorerLinks`, `getNetworkInfo`, `health`.

### Return shape (example)

```json
{
  "propertyId": "LAND-2026-001",
  "propertyHash": "cbed434b22947c8ccc99ed0e2cd64cc6330f67725d0d46e3b58cc82f210f20a0",
  "transaction": {
    "transactionHash": "0x8f2c...",
    "status": "SUCCESS",
    "blockNumber": 1234,
    "gasUsed": 128000,
    "explorerUrl": "https://hashscan.io/testnet/transaction/0x8f2c..."
  },
  "audit": {
    "recorded": true,
    "sequenceNumber": 12,
    "transactionId": "0.0.1234567@1762500000.123456789",
    "explorerUrl": "https://hashscan.io/testnet/transaction/0.0.1234567@1762500000.123456789"
  }
}
```

Every transaction ID and hash in these responses comes from an SDK receipt or
the Mirror Node. Nothing is generated locally.

---

## HCS event schema

```json
{
  "v": 1,
  "type": "investment",
  "propertyId": "LAND-2026-001",
  "actor": "0.0.1234567",
  "timestamp": "2026-11-07T10:00:00.000Z",
  "data": { "units": 50, "amount": "2500000" }
}
```

Types used by the service: `property_registered`, `property_hash_updated`,
`document_verified`, `token_created`, `units_allocated`, `ownership_transfer`,
`investment`, `property_configured`, `resale_listed`, `resale_completed`.

Messages are capped at 1024 bytes by Hedera; the service validates the size
before submitting and fails with a clear error instead of chunking.

If the HCS write fails after a confirmed chain transaction, the result still
returns the chain transaction and sets `audit.recorded: false` with the reason.
Confirmed work is never masked, and nothing is retried behind your back.

---

## HTS token model

- One `FungibleCommon` token per property, `decimals = 0`, finite supply equal
  to the property's total units, full supply minted to the operator treasury.
- `allocateUnits()` transfers units treasury → investor.
- HTS requires the receiver to be **associated** with the token. The service
  checks the mirror node first and returns `TOKEN_NOT_ASSOCIATED` with
  instructions instead of a raw receipt failure. Investors associate from their
  own wallet (HashPack/Blade/MetaMask) before receiving units.
- Investor-to-investor HTS transfers must be signed by the holder. The service
  refuses them unless a trusted server-side `signerKey` is supplied; user-owned
  actions are wallet-signed flows, not HTTP calls.

---

## Mirror Node

No credentials needed. Used for account info, balances, token metadata,
transaction lookup/status, account history and topic messages.

```js
await service.getTransaction("0.0.1234@1762500000.123456789"); // Hedera tx
await service.getTransaction("0x8f2c...");                    // EVM tx / contract call
await service.getTransactionStatus("0x8f2c...");
await service.getExplorerLinks({ accountId: "0.0.1234", tokenId: "0.0.7001" });
```

Links target `https://hashscan.io/testnet/...`.

---

## Security

- **Private keys** live only in `blockchain/.env`; no getter returns them, no
  API body field is forwarded, and no log line prints them.
- **Role-gated contracts**: verifier writes the registry, operator records
  investments/allocations/resales, only the admin grants roles.
- **No open token transfers**: the allocation ledger has no public `transfer`.
- **Escrow**: resale units leave the seller at listing time, preventing
  double-listing and post-sale spending.
- **Two-step admin handover** so a typo cannot lock the contracts.
- **Validation**: account IDs, EVM addresses, property IDs, hashes, units and
  event types are all validated before reaching the SDK or a contract call.
- **Testnet only**: `assertTestnet()` refuses any other network and the Hardhat
  config has no mainnet entry.
- **No fake IDs**: every hash/ID returned is from a receipt or the Mirror Node.

### Threat notes

- The operator key is hot (server-side). For production, move it to a KMS/HSM
  and grant the operator role to that address only.
- The admin can always move escrowed units (admin override in
  `TokenAllocation`). That is deliberate for recovery; rotate the admin to a
  multisig before holding real value.

---

## Tests

```
npm test
```

- **37 Hardhat tests** (`test/contracts/landchain.test.js`): registry hashing and
  history, investment validation (amount mismatch, minimum, unit cap, target),
  allocation caps and ownership basis points, resale escrow/reservation/expiry/
  cancellation, unauthorised-caller rejection, full end-to-end lifecycle.
- **53 unit tests** (`test/unit/`): canonical hashing against the backend
  formula, input validation, explorer URLs, Mirror Node parsing with mocked
  HTTP (404 → 0 balance, EVM vs Hedera tx lookup), service orchestration with
  fakes (including HCS failure tolerance and the HTS-failure compensation path),
  and the Express adapter's allowlist and error mapping.

Live Testnet reads were verified while building this module: the public mirror
node returned account `0.0.2`, the HBAR exchange rate and topic queries, and the
Hedera JSON-RPC relay (`https://testnet.hashio.io/api`) reported chain `296` and
block `42,758,204`. Writes were **not** executed because no operator credentials
were provided; `npm run verify:testnet` and `npm run demo` are ready for the
account holder to run after adding keys.

---

## Layout

```
blockchain/
  contracts/            Solidity: registry, pool, allocation, resale + access base
  scripts/              deploy, create-topic, verify-testnet, demo-flow
  src/
    api/router.js       Express adapter for Contributor 2
    hedera/             client, wallet, consensus, token, contracts, mirror
    services/           blockchain.service.js (reusable service)
    utils/              hash, validation, explorer
    config.js           env loading + testnet guards
    index.js            public entry point
  test/                 contracts/ (Hardhat) · unit/ (node:test)
  docs/INTEGRATION.md   backend + frontend wiring guide
```
