import { pseudoTxHash } from "../src/lib/hash.js";
import { makeId } from "../src/lib/ids.js";
import { appendDocument } from "../src/services/document.service.js";
import { appendPropertyVersion } from "../src/services/hashRegistry.service.js";
import { appendVerificationRecord } from "../src/services/verification.service.js";

const DOCUMENT_NAMES = [
  "Sale Deed",
  "Encumbrance Certificate",
  "RERA Registration",
  "Property Tax Receipt",
];

const SEEDED_AT = "2026-10-01T09:00:00.000Z";

const userSeeds = [
  {
    id: "user-admin",
    name: "Rohan Deshmukh",
    email: "admin@landchain.in",
    mobile: "9876543210",
    role: "admin",
    walletAddress: "0x9f1c2C5d8E4a7B6c3D2e1F0a9B8c7D6e5F4a3B2c",
    kycStatus: "verified",
    panMasked: "ABCDE****F",
  },
  {
    id: "seller-001",
    name: "Arjun Mehta",
    email: "arjun.mehta@landchain.in",
    mobile: "9876543211",
    role: "seller",
    walletAddress: "0x3a4b5C6d7E8f9A0b1C2d3E4f5A6b7C8d9E0f1A2b",
    kycStatus: "verified",
    panMasked: "MHTYA****K",
  },
  {
    id: "buyer-001",
    name: "Neha Kulkarni",
    email: "neha.kulkarni@example.com",
    mobile: "9876543212",
    role: "buyer",
    walletAddress: "0x7c8d9E0f1A2b3C4d5E6f7A8b9C0d1E2f3A4b5C6d",
    kycStatus: "verified",
    panMasked: "KLKRN****P",
  },
  {
    id: "investor-001",
    name: "Kabir Shah",
    email: "kabir.shah@example.com",
    mobile: "9876543213",
    role: "investor",
    walletAddress: "0x1B2c3D4e5F6a7B8c9D0e1F2a3B4c5D6e7F8a9B0c",
    kycStatus: "verified",
    panMasked: "SHHKB****M",
  },
  {
    id: "investor-002",
    name: "Ananya Rao",
    email: "ananya.rao@example.com",
    mobile: "9876543214",
    role: "investor",
    walletAddress: "0x5E6f7A8b9C0d1E2f3A4b5C6d7E8f9A0b1C2d3E4f",
    kycStatus: "pending",
    panMasked: null,
  },
];

const propertySeeds = [
  {
    id: "LAND-2026-001",
    title: "Skyline Residences",
    description:
      "A 42-storey premium residential tower in Bandra West with sea-facing 2 and 3 BHK apartments, a sky lounge and concierge services. The asset is fully RERA registered and generates rental income from 61 occupied units.",
    address: "Off Carter Road, Bandra West",
    city: "Mumbai",
    state: "Maharashtra",
    category: "residential",
    status: "open",
    totalValue: 125_000_000,
    unitPrice: 50_000,
    totalUnits: 2500,
    unitsSold: 2145,
    minInvestment: 50_000,
    expectedYield: 7.8,
    expectedAppreciation: 18.5,
    areaSqft: 142_000,
    imageSeed: 1,
    highlights: ["Sea-facing tower", "RERA registered", "61 units tenanted"],
    createdAt: "2026-01-12T09:30:00.000Z",
    verifiedAt: "2026-01-18T11:15:00.000Z",
  },
  {
    id: "LAND-2026-002",
    title: "Palm Grove Villas",
    description:
      "Twelve boutique villas set in a gated community near Anjuna beach, managed as short-stay rentals. Fractional ownership includes the land parcel, clubhouse and hospitality revenue share.",
    address: "Anjuna–Vagator Road",
    city: "Goa",
    state: "Goa",
    category: "residential",
    status: "open",
    totalValue: 84_000_000,
    unitPrice: 40_000,
    totalUnits: 2100,
    unitsSold: 1470,
    minInvestment: 40_000,
    expectedYield: 9.2,
    expectedAppreciation: 14,
    areaSqft: 96_500,
    imageSeed: 2,
    highlights: ["Gated villa community", "Hospitality income", "Beach 900 m"],
    createdAt: "2026-02-03T08:00:00.000Z",
    verifiedAt: "2026-02-09T10:20:00.000Z",
  },
  {
    id: "LAND-2026-003",
    title: "Cyber Park Tower A",
    description:
      "Grade-A office tower in Whitefield leased to three Fortune 500 tenants with an average lock-in of 4.2 years. This asset is fully funded and distributions are paid quarterly.",
    address: "Whitefield Tech Corridor",
    city: "Bengaluru",
    state: "Karnataka",
    category: "commercial",
    status: "funded",
    totalValue: 175_000_000,
    unitPrice: 50_000,
    totalUnits: 3500,
    unitsSold: 3500,
    minInvestment: 50_000,
    expectedYield: 8.4,
    expectedAppreciation: 16.2,
    areaSqft: 210_000,
    imageSeed: 3,
    highlights: ["Three Fortune 500 tenants", "4.2 year lock-in", "Quarterly distributions"],
    createdAt: "2026-03-14T07:45:00.000Z",
    verifiedAt: "2026-03-20T09:05:00.000Z",
  },
  {
    id: "LAND-2026-004",
    title: "Greenfield Logistics Hub",
    description:
      "A 1.4 lakh sq.ft warehousing and cold-chain facility on the Pune–Solapur highway with 22 loading docks and two long-term 3PL tenants.",
    address: "NH-65, Kharadi Annex",
    city: "Pune",
    state: "Maharashtra",
    category: "industrial",
    status: "open",
    totalValue: 96_000_000,
    unitPrice: 30_000,
    totalUnits: 3200,
    unitsSold: 1184,
    minInvestment: 30_000,
    expectedYield: 8.9,
    expectedAppreciation: 15.5,
    areaSqft: 148_000,
    imageSeed: 4,
    highlights: ["22 loading docks", "Cold-chain ready", "Two 3PL tenants"],
    createdAt: "2026-05-08T11:10:00.000Z",
    verifiedAt: "2026-05-14T12:30:00.000Z",
  },
  {
    id: "LAND-2026-005",
    title: "Sunrise Plots Phase II",
    description:
      "Fifty-six plotted parcels in a gated layout near ORR with internal roads, drainage and an approved gated community plan. Awaiting registry verification.",
    address: "Shankarpally, Outer Ring Road",
    city: "Hyderabad",
    state: "Telangana",
    category: "land",
    status: "pending_verification",
    totalValue: 42_000_000,
    unitPrice: 25_000,
    totalUnits: 1680,
    unitsSold: 0,
    minInvestment: 25_000,
    expectedYield: 11.5,
    expectedAppreciation: 22,
    areaSqft: 54_000,
    imageSeed: 5,
    highlights: ["56 gated plots", "ORR 4 km", "Awaiting verification"],
    createdAt: "2026-09-22T06:20:00.000Z",
    verifiedAt: undefined,
  },
  {
    id: "LAND-2026-006",
    title: "Maple Court Apartments",
    description:
      "A 96-unit mid-income residential community in OMR Phase 2 with an active rental pool and a fully subscribed fractional tranche.",
    address: "OMR Phase 2, Thoraipakkam",
    city: "Chennai",
    state: "Tamil Nadu",
    category: "residential",
    status: "active",
    totalValue: 72_000_000,
    unitPrice: 36_000,
    totalUnits: 2000,
    unitsSold: 2000,
    minInvestment: 36_000,
    expectedYield: 7.2,
    expectedAppreciation: 13.4,
    areaSqft: 88_000,
    imageSeed: 6,
    highlights: ["96 rental units", "OMR employment hub", "Fully subscribed"],
    createdAt: "2026-06-19T10:05:00.000Z",
    verifiedAt: "2026-06-25T11:40:00.000Z",
  },
];

const investmentSeeds = [
  { userId: "investor-001", propertyId: "LAND-2026-001", units: 50, purchasedAt: "2026-02-10T09:15:00.000Z" },
  { userId: "investor-001", propertyId: "LAND-2026-002", units: 25, purchasedAt: "2026-03-02T14:20:00.000Z" },
  { userId: "investor-001", propertyId: "LAND-2026-003", units: 80, purchasedAt: "2026-04-06T06:40:00.000Z" },
  { userId: "investor-002", propertyId: "LAND-2026-006", units: 40, purchasedAt: "2026-07-21T12:00:00.000Z" },
  { userId: "buyer-001", propertyId: "LAND-2026-004", units: 30, purchasedAt: "2026-08-12T08:30:00.000Z" },
];

const resaleSeeds = [
  {
    id: "RSL-2026-001",
    propertyId: "LAND-2026-001",
    sellerId: "investor-001",
    units: 10,
    pricePerUnit: 55_000,
    status: "active",
    listedAt: "2026-10-18T09:00:00.000Z",
  },
  {
    id: "RSL-2026-002",
    propertyId: "LAND-2026-006",
    sellerId: "investor-002",
    units: 15,
    pricePerUnit: 38_500,
    status: "active",
    listedAt: "2026-10-24T13:20:00.000Z",
  },
  {
    id: "RSL-2026-003",
    propertyId: "LAND-2026-002",
    sellerId: "investor-001",
    units: 5,
    pricePerUnit: 43_000,
    status: "cancelled",
    listedAt: "2026-09-30T10:10:00.000Z",
  },
];

/** Build every JSON collection for a fresh demo dataset. */
export function buildSeedData() {
  const users = userSeeds.map((user) => ({
    walletAddress: null,
    panMasked: null,
    panHash: user.panMasked ? pseudoTxHash(`pan:${user.id}`) : null,
    status: "active",
    joinedAt: SEEDED_AT,
    lastLoginAt: "2026-11-05T18:45:00.000Z",
    propertiesOwned: 0,
    totalInvested: 0,
    ...user,
  }));

  const properties = [];
  const documents = [];
  const propertyHashes = [];
  const verificationRecords = [];
  const investments = [];
  const ownershipHistory = [];
  const tokenRecords = [];
  const transactions = [];
  const draft = { properties, documents, propertyHashes, verificationRecords };

  for (const seed of propertySeeds) {
    const seller = users.find((user) => user.id === "seller-001");
    const property = {
      sellerId: "seller-001",
      sellerName: seller.name,
      ...seed,
      version: 0,
      hashVersion: 0,
      propertyHash: null,
      registryTxId: null,
      documentsCount: DOCUMENT_NAMES.length,
      updatedAt: seed.verifiedAt ?? seed.createdAt,
    };
    properties.push(property);

    for (const name of DOCUMENT_NAMES) {
      appendDocument(draft, {
        propertyId: property.id,
        ownerId: property.sellerId,
        name,
        type: "PDF",
        size: `${(0.8 + DOCUMENT_NAMES.indexOf(name) * 0.7).toFixed(1)} MB`,
        content: `${property.id}:${name}`,
        status: property.status === "pending_verification" ? "pending" : "verified",
      });
    }

    const version = appendPropertyVersion(draft, property, {
      actor: seller,
      changeType: "created",
    });

    appendVerificationRecord(draft, {
      propertyId: property.id,
      action: "Property submitted for verification",
      actor: seller,
      role: "seller",
      hash: version.hash,
      status: "pending",
      note: `${DOCUMENT_NAMES.length} ownership documents uploaded.`,
    });

    if (property.status !== "pending_verification") {
      appendVerificationRecord(draft, {
        propertyId: property.id,
        action: "Property verified",
        actor: users.find((user) => user.role === "admin"),
        role: "admin",
        hash: property.propertyHash,
        status: "verified",
        note: "Documents and ownership details verified by the platform admin.",
      });
    }
  }

  for (const seed of investmentSeeds) {
    const property = properties.find((item) => item.id === seed.propertyId);
    const investor = users.find((user) => user.id === seed.userId);
    const amount = seed.units * property.unitPrice;
    const txHash = pseudoTxHash(`seed-investment:${seed.userId}:${seed.propertyId}:${seed.units}`);
    const investment = {
      id: makeId("INV"),
      propertyId: property.id,
      propertyTitle: property.title,
      userId: investor.id,
      investorName: investor.name,
      units: seed.units,
      pricePerUnit: property.unitPrice,
      amount,
      ownershipPercent: Number(((seed.units / property.totalUnits) * 100).toFixed(4)),
      purchasedAt: seed.purchasedAt,
      status: "confirmed",
      txHash,
      source: "primary",
    };
    investments.push(investment);

    const transaction = {
      id: makeId("TXN"),
      type: "investment",
      description: `${property.title} · ${seed.units} units`,
      amount: -amount,
      userId: investor.id,
      propertyId: property.id,
      units: seed.units,
      date: seed.purchasedAt,
      status: "completed",
      reference: txHash,
      createdAt: seed.purchasedAt,
    };
    transactions.push(transaction);

    tokenRecords.push({
      id: makeId("TOK"),
      propertyId: property.id,
      userId: investor.id,
      fromUserId: null,
      units: seed.units,
      investmentId: investment.id,
      transactionId: transaction.id,
      type: "allocation",
      tokenSymbol: "LANDT",
      status: "settled",
      createdAt: seed.purchasedAt,
    });

    ownershipHistory.push({
      id: makeId("OWN"),
      propertyId: property.id,
      type: "primary_allocation",
      units: seed.units,
      fromUserId: null,
      toUserId: investor.id,
      investmentId: investment.id,
      transactionId: transaction.id,
      pricePerUnit: property.unitPrice,
      ownershipPercent: investment.ownershipPercent,
      propertyVersion: property.version,
      createdAt: seed.purchasedAt,
    });
  }

  const investors = users
    .filter((user) => investments.some((investment) => investment.userId === user.id))
    .map((user) => {
      const mine = investments.filter((investment) => investment.userId === user.id);
      const holdings = [...new Set(mine.map((investment) => investment.propertyId))].map(
        (propertyId) => {
          const property = properties.find((item) => item.id === propertyId);
          const units = mine
            .filter((investment) => investment.propertyId === propertyId)
            .reduce((sum, investment) => sum + investment.units, 0);
          return {
            propertyId,
            title: property.title,
            units,
            invested: units * property.unitPrice,
            ownershipPercent: Number(((units / property.totalUnits) * 100).toFixed(4)),
          };
        },
      );
      return {
        id: makeId("INVSTR"),
        userId: user.id,
        name: user.name,
        kycStatus: user.kycStatus,
        holdings,
        totalInvested: mine.reduce((sum, investment) => sum + investment.amount, 0),
        totalUnits: mine.reduce((sum, investment) => sum + investment.units, 0),
        propertiesCount: holdings.length,
        createdAt: SEEDED_AT,
        updatedAt: SEEDED_AT,
      };
    });

  for (const user of users) {
    const mine = investments.filter((investment) => investment.userId === user.id);
    user.propertiesOwned = new Set(mine.map((investment) => investment.propertyId)).size;
    user.totalInvested = mine.reduce((sum, investment) => sum + investment.amount, 0);
  }

  const resaleListings = resaleSeeds.map((seed) => {
    const property = properties.find((item) => item.id === seed.propertyId);
    const seller = users.find((user) => user.id === seed.sellerId);
    return {
      propertyId: property.id,
      propertyTitle: property.title,
      city: property.city,
      sellerName: seller.name,
      originalPricePerUnit: property.unitPrice,
      totalValue: seed.units * seed.pricePerUnit,
      imageSeed: property.imageSeed,
      soldAt: null,
      buyerId: null,
      updatedAt: seed.listedAt,
      ...seed,
    };
  });

  return {
    users,
    properties,
    investments,
    investors,
    documents,
    propertyHashes,
    transactions,
    resaleListings,
    ownershipHistory,
    verificationRecords,
    tokenRecords,
    platformSettings: {
      platformName: "LANDCHAIN",
      tokenSymbol: "LANDT",
      networkName: "Hedera Testnet",
      currency: "INR",
      maxInvestmentAmount: 50_000_000,
      maintenanceMode: false,
      verificationSlaHours: 48,
      supportEmail: "support@landchain.in",
      dataVersion: 1,
      seededAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
      updatedBy: "seed",
    },
  };
}
