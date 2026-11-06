# LANDCHAIN — Integration guide

How Contributor 2's backend and Contributor 1's frontend connect to
`/blockchain`, what already matches, and the gaps that need a decision.

---

## 1. Compatibility check

| Area | Status | Notes |
| --- | --- | --- |
| Property IDs (`LAND-2026-001`) | ✅ compatible | `validation.propertyId` accepts the existing format |
| Property hash (`sha256` canonical JSON, 64 hex) | ✅ compatible | `src/utils/hash.js` reproduces `backend/src/lib/hash.js` exactly; a backend hash can be anchored directly (`toBytes32`) |
| Document hashes (`sha256` hex) | ✅ compatible | anchored as `bytes32` |
| Units (whole integers) | ✅ compatible | HTS `decimals = 0`, contracts use `uint32` |
| Amounts (`unitPrice`, `minInvestment`) | ✅ compatible by convention | passed through as integers; no currency conversion is applied |
| Network name | ✅ compatible | backend config already calls the network "Hedera Testnet" |
| Backend module system (ESM) | ✅ compatible | blockchain is CommonJS; named ESM imports verified against `src/index.js` |
| Wallet address format | ⚠️ bridge needed | the current frontend stores an EVM `0x` address; the ledger needs the Hedera account/EVM alias. `resolveLedgerAddress()` maps it |
| Transaction IDs | ❌ mismatch | backend invents `pseudoTxHash` / `registryTxId`; the blockchain module only returns real receipt IDs. The backend should store the real values |
| HTS token IDs | ❌ missing field | `tokenRecords` has a `tokenSymbol` but no Hedera token ID. Add `hederaTokenId` when wiring |
| Mock API layer | ⚠️ dev-only | `NEXT_PUBLIC_USE_MOCK_API=true` serves fabricated data; set it to `false` for the integration demo |

---

## 2. Backend (Contributor 2)

### 2.1 Mount the router

```js
// backend/src/app.js (Contributor 2's file)
import express from "express";
import { createBlockchainRouter } from "../../blockchain/src/api/router.js";

app.use("/api/blockchain", createBlockchainRouter(express));
```

No blockchain dependency needs to be added to `backend/package.json` — the
module resolves from its own folder. `express` is injected, so there is no
version conflict.

Routes exposed (all JSON):

```
GET    /health
GET    /network
POST   /wallet/connect
GET    /accounts/:accountId
GET    /accounts/:accountId/transactions
GET    /accounts/:accountId/tokens
POST   /properties/register
GET    /properties/:propertyId/registry?hash=
PUT    /properties/:propertyId/hash
POST   /properties/:propertyId/documents
POST   /properties/:propertyId/events
GET    /properties/:propertyId/events
POST   /properties/:propertyId/configure
GET    /properties/:propertyId/pool
POST   /properties/:propertyId/investments
GET    /properties/:propertyId/allocation?accountId=
POST   /properties/:propertyId/tokens
POST   /properties/:propertyId/allocate
POST   /tokens/:tokenId/transfer
GET    /tokens/:tokenId/balance/:accountId
GET    /tokens/:tokenId
GET    /transactions/:reference
GET    /transactions/:reference/status
GET    /explorer-links
GET    /resale/:listingId
POST   /resale/listings
POST   /resale/:listingId/reserve
POST   /resale/:listingId/cancel
POST   /resale/:listingId/complete
```

Errors come back as `{ "error": "VALIDATION_ERROR", "message": "..." }` with the
matching HTTP status (422 validation, 404 not found, 409 transaction conflict,
502 mirror/RPC failure).

### 2.2 Call the service directly

```js
import { getBlockchainService } from "../../blockchain/src/index.js";

const blockchain = getBlockchainService();

// In property.service.js, after the JSON record is written:
const anchored = await blockchain.registerProperty({
  propertyId: property.id,
  propertyHash: property.propertyHash,   // already sha256 from hashRegistry.service.js
  actor: "backend",
  metadata: { title: property.title },
});

property.registryTxId = anchored.transaction.transactionHash; // real hash
property.hederaHcsSequence = anchored.audit.sequenceNumber ?? null;
```

### 2.3 Field mapping

| Backend field | Service argument | Direction |
| --- | --- | --- |
| `property.id` | `propertyId` | → chain |
| `property.propertyHash` | `propertyHash` | → chain |
| `document.hash` | `documentHash` | → chain |
| `document.type` / `document.name` | `documentType` | → chain |
| `investment.units` | `units` | → chain |
| `investment.amount` | `amount` (pool) | → chain |
| `user.walletAddress` | `accountId` (resolved) | → chain |
| `tokenRecords[].hederaTokenId` | `tokenId` | ← chain (new field) |
| `transactions[].txHash` | real `transactionId` / hash | ← chain |

### 2.4 Where to hook in

| Backend moment | Blockchain call |
| --- | --- |
| Property created (`property.service.js`) | `registerProperty()` |
| Property edited | `updatePropertyHash()` |
| Document uploaded (`document.service.js`) | `storeDocumentHash()` |
| Document verified (`verification.service.js`) | `recordPropertyEvent({ eventType: "document_verified" })` |
| Investment confirmed (`investment.service.js`) | `recordInvestment()` then `allocateUnits()` |
| Ownership movement (`appendOwnershipRecord`) | `recordPropertyEvent({ eventType: "ownership_transfer" })` |
| Resale listing created (`resale.service.js`) | `createResaleListing()` |
| Resale completed | `completeResale()` |
| Token metadata (`tokenRecords`) | `createPropertyToken()` once per property |

The service is async — `store.transact()` callbacks are synchronous, so perform
blockchain calls **before** or **after** the transaction, not inside it, and
store the returned IDs in the same or a follow-up write.

### 2.5 Gaps to close in the backend

1. **Stop generating transaction hashes.** `pseudoTxHash()` in
   `backend/src/lib/hash.js` produces a value that looks like a hash but is not
   on-chain. Replace `investment.txHash`, `property.registryTxId` and
   `transactions[].reference` with IDs returned by the service.
2. **Store the HTS token ID.** Add `hederaTokenId` (and `hederaTopicSequence`)
   to `tokenRecords` so balances can be read later.
3. **Gate the mock layer.** For the demo set
   `NEXT_PUBLIC_USE_MOCK_API=false` and `NEXT_PUBLIC_API_URL=http://localhost:5000`.
4. **Fail soft on audit.** `registerProperty()` may return
   `audit.recorded: false` when the HCS write fails; the property is still
   anchored on-chain. Surface that state instead of treating it as a failure.

---

## 3. Frontend (Contributor 1)

The current `auth/connect` page stores an EVM `0x` address. That is fine — Hedera
accounts have an EVM alias — but the wallet must be on **Hedera Testnet (296)**
and the address must exist on Hedera before it can be used.

### 3.1 Chain parameters

```js
import { HEDERA_TESTNET_CHAIN } from "../../blockchain/src/index.js";

// chainId 0x128 (296)
// RPC     https://testnet.hashio.io/api
// explorer https://hashscan.io/testnet
```

### 3.2 Connect flow

```js
const res = await fetch(`${API_URL}/api/blockchain/wallet/connect`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ accountId: address }), // 0x... from MetaMask
});
// { connected, network, chainId, accountId: "0.0.x", evmAddress, balanceHbar, explorerUrl }
```

If the address has never been funded on Testnet the mirror node returns 404 and
the API returns a 404 with a clear message; the UI should tell the user to fund
the account from <https://portal.hedera.com> first.

### 3.3 Wallet-signed actions

Listing and reserving change `msg.sender`, so an investor's own wallet must sign
them (HashPack/Blade via WalletConnect, or MetaMask on chain 296). The backend
cannot sign for a user. Expose the contract addresses from
`npm run deploy:testnet` to the frontend and call:

```
ResaleContract.createListing(propertyId, units, pricePerUnit)
ResaleContract.reserveUnits(listingId)
ResaleContract.cancelListing(listingId)
```

`completeResale` stays operator-only and is called by the backend once payment
settles.

---

## 4. Recovery / operations

- **HTS leg failed after the ledger write**: the error includes
  `details.compensation` with the exact `transferUnits(...)` call to reverse the
  ledger entry. Run it with `signerKey` for the investor or as the operator if
  the units sit in the treasury.
- **Wrong property hash anchored**: call `updatePropertyHash()` with the correct
  digest; history keeps both, and `verifyPropertyHash()` reports the current one.
- **Compromised resale contract**: `TokenAllocation.setAuthorizedContract(resale, false)`
  freezes all escrow movement immediately.
- **Rotate operator key**: grant the operator role to the new address on all
  four contracts, then revoke the old one. Admin stays on the deployment account.
