/**
 * Seed a property that matches the investment-engine specification plus three
 * external investors. Idempotent: re-running only fills in what is missing.
 *
 *   node scripts/seed.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "../../backend/src/lib/hash.js";
import { initStore, store } from "../src/lib/store.js";
import { config } from "../src/config.js";
import { registerInvestor } from "../src/services/investor.service.js";

export const DEMO_PROPERTY_ID = "LAND-2026-010";

const DEMO_PROPERTY = {
  id: DEMO_PROPERTY_ID,
  title: "Landchain Model Estate",
  description:
    "Reference asset used by the investment engine demo: a 12,000 sqft mixed-use plot in Pune split into 5,000 units of ₹1,000 each. Thresholds match the specification exactly (₹5,000 minimum, 20% buyer cap, 25% external cap).",
  address: "Survey 42, Hinjawadi Phase II",
  city: "Pune",
  state: "Maharashtra",
  category: "land",
  status: "open",
  sellerId: "seller-001",
  sellerName: "Arjun Mehta",
  totalValue: 5_000_000,
  unitPrice: 1_000,
  totalUnits: 5_000,
  unitsSold: 0,
  unitsReserved: 0,
  minInvestment: 5_000,
  expectedYield: 8.2,
  expectedAppreciation: 15,
  areaSqft: 12_000,
  imageSeed: 10,
  highlights: ["Model asset", "5,000 units", "₹1,000 per unit"],
  createdAt: "2026-11-01T09:00:00.000Z",
  verifiedAt: "2026-11-02T09:00:00.000Z",
  version: 1,
  hashVersion: 1,
  documentsCount: 0,
};

const DEMO_INVESTORS = [
  {
    userId: "ext-001",
    name: "Ananya Rao",
    email: "ananya.rao@example.com",
    walletAddress: "0x1111111111111111111111111111111111111111",
  },
  {
    userId: "ext-002",
    name: "Vikram Iyer",
    email: "vikram.iyer@example.com",
    walletAddress: "0x2222222222222222222222222222222222222222",
  },
  {
    userId: "ext-003",
    name: "Meera Nair",
    email: "meera.nair@example.com",
    walletAddress: "0x3333333333333333333333333333333333333333",
  },
];

export async function seedDemoData({ silent = false } = {}) {
  await initStore();
  const log = silent ? () => {} : (...args) => console.log(...args);

  const propertyHash = sha256({
    id: DEMO_PROPERTY.id,
    title: DEMO_PROPERTY.title,
    totalValue: DEMO_PROPERTY.totalValue,
    totalUnits: DEMO_PROPERTY.totalUnits,
    unitPrice: DEMO_PROPERTY.unitPrice,
  });

  const createdProperty = await store.transact(["properties"], (drafts) => {
    const existing = drafts.properties.find((property) => property.id === DEMO_PROPERTY_ID);
    if (existing) {
      // Keep the engine-specific fields present without touching other data.
      if (existing.unitsReserved === undefined) existing.unitsReserved = 0;
      return false;
    }
    drafts.properties.push({
      ...DEMO_PROPERTY,
      propertyHash,
      registryTxId: null,
      updatedAt: new Date().toISOString(),
    });
    return true;
  });
  log(createdProperty ? `Property ${DEMO_PROPERTY_ID} created.` : `Property ${DEMO_PROPERTY_ID} already exists.`);

  for (const investor of DEMO_INVESTORS) {
    await store.transact(["users"], (drafts) => {
      const existing = drafts.users.find((user) => user.id === investor.userId);
      if (existing) return;
      drafts.users.push({
        id: investor.userId,
        name: investor.name,
        email: investor.email,
        mobile: null,
        role: "investor",
        kycStatus: "verified",
        walletAddress: investor.walletAddress,
        status: "active",
        joinedAt: new Date().toISOString(),
        lastLoginAt: null,
        propertiesOwned: 0,
        totalInvested: 0,
      });
    });

    await registerInvestor({
      userId: investor.userId,
      name: investor.name,
      email: investor.email,
      walletAddress: investor.walletAddress,
      investorType: "external",
      kycStatus: "verified",
    });
    log(`Investor ${investor.userId} (${investor.name}) registered.`);
  }

  log(`\nData directory: ${config.dataDir}`);
  log(`Ledger mode:    ${config.ledgerMode}`);
  log(`\nTry it:`);
  log(`  curl http://localhost:5100/api/engine/properties/${DEMO_PROPERTY_ID}`);
  log(
    `  curl -X POST http://localhost:5100/api/engine/investments -H "content-type: application/json" -H "x-user-id: ext-001" -d '{"propertyId":"${DEMO_PROPERTY_ID}","units":10,"investorType":"external"}'`,
  );

  return { propertyId: DEMO_PROPERTY_ID, investors: DEMO_INVESTORS.map((entry) => entry.userId) };
}

const invokedDirectly =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  seedDemoData().catch((error) => {
    console.error("[investment-engine] seed failed", error);
    process.exit(1);
  });
}
