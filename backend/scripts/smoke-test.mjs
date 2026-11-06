#!/usr/bin/env node
/**
 * End-to-end smoke test for every API group.
 *
 * Start the server first (npm start) then run: npm run smoke
 * BASE_URL can override the default http://localhost:5000
 *
 * Note: this script writes records. Re-run `npm run seed -- --force` afterwards
 * to restore the committed demo dataset.
 */
const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:5000").replace(/\/+$/, "");

let passed = 0;
const failures = [];
let token = null;
let createdUserId = null;
let createdPropertyId = null;
let createdDocumentId = null;
let createdResaleId = null;
let newUserMobile = null;

const log = (message) => console.log(message);

async function call(method, path, { body, auth = false, role, expect } = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { "Content-Type": "application/json" };
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const separator = path.includes("?") ? "&" : "?";
  const finalUrl = role ? `${url}${separator}role=${role}` : url;

  const response = await fetch(finalUrl, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }

  if (expect !== undefined && response.status !== expect) {
    failures.push(
      `${method} ${path} -> expected ${expect}, got ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`,
    );
    return payload;
  }
  return payload;
}

function check(label, condition, details = "") {
  if (condition) {
    passed += 1;
    log(`  ok   ${label}`);
  } else {
    failures.push(`${label} ${details}`);
    log(`  FAIL ${label} ${details}`);
  }
}

async function run() {
  log(`\nLANDCHAIN backend smoke test -> ${BASE_URL}\n`);

  // ---------------------------------------------------------------- health
  log("health");
  const health = await call("GET", "/health", { expect: 200 });
  check("health reports ok", health?.status === "ok");

  const storage = await call("GET", "/api/health/storage", { expect: 200 });
  check(
    "all twelve collections present",
    storage && Object.keys(storage.collections).length === 12,
    `got ${storage && Object.keys(storage.collections).length}`,
  );
  check(
    "append-only collections protected",
    Array.isArray(storage?.appendOnly) && storage.appendOnly.length === 5,
  );

  // ------------------------------------------------------------------ auth
  log("\nauth");
  newUserMobile = `9${String(Date.now()).slice(-9)}`;
  const otp = await call("POST", "/api/auth/otp", {
    body: { mobile: newUserMobile, role: "investor" },
    expect: 202,
  });
  check("otp request returns requestId", Boolean(otp?.requestId));
  check("otp exposes dev code", Boolean(otp?.devOtp));

  const badOtp = await call("POST", "/api/auth/verify-otp", {
    body: { requestId: otp.requestId, mobile: newUserMobile, otp: "000000" },
    expect: 401,
  });
  check("wrong otp rejected", badOtp?.code === "UNAUTHORIZED");

  const session = await call("POST", "/api/auth/verify-otp", {
    body: { requestId: otp.requestId, mobile: newUserMobile, otp: otp.devOtp },
    expect: 200,
  });
  check("verify-otp issues token", typeof session?.token === "string");
  check("verify-otp returns user", Boolean(session?.user?.id));
  token = session.token;
  createdUserId = session.user.id;

  const me = await call("GET", "/api/auth/session", { auth: true, expect: 200 });
  check("session returns the same user", me?.user?.id === createdUserId);

  const pan = await call("POST", "/api/auth/pan", {
    body: { pan: "ABCDE1234F" },
    auth: true,
    expect: 200,
  });
  check("pan is masked", pan?.panMasked === "ABCDE****F");

  const wallet = await call("POST", "/api/auth/wallet", {
    body: { address: "0x1234567890abcdef1234567890abcdef12345678" },
    auth: true,
    expect: 200,
  });
  check("wallet linked", wallet?.address?.startsWith("0x"));

  const dup = await call("POST", "/api/auth/register", {
    body: { mobile: newUserMobile, role: "buyer" },
    expect: 409,
  });
  check("duplicate mobile rejected", dup?.code === "CONFLICT");

  const invalidMobile = await call("POST", "/api/auth/otp", {
    body: { mobile: "12345" },
    expect: 422,
  });
  check("invalid mobile rejected", invalidMobile?.code === "VALIDATION_ERROR");

  // ----------------------------------------------------------------- users
  log("\nusers");
  const users = await call("GET", "/api/users", { expect: 200 });
  check("users list is an array", Array.isArray(users) && users.length >= 5);

  const selfList = await call("GET", "/api/users/me", { auth: true, expect: 200 });
  check("users/me resolves the session user", selfList?.id === createdUserId);

  const roleChange = await call("PATCH", `/api/users/${createdUserId}/role`, {
    body: { role: "seller" },
    expect: 200,
  });
  check("admin can change roles", roleChange?.role === "seller");

  await call("PATCH", `/api/users/${createdUserId}/role`, {
    body: { role: "investor" },
    expect: 200,
  });

  const forbidden = await call("GET", "/api/users", {
    auth: false,
    role: "investor",
    expect: 200,
  });
  check("demo admin bypass keeps the admin UI usable", Array.isArray(forbidden));

  // ------------------------------------------------------------ properties
  log("\nproperties");
  const properties = await call("GET", "/api/properties", { expect: 200 });
  check("properties listed", Array.isArray(properties) && properties.length >= 6);

  const goa = await call("GET", "/api/properties?city=Goa", { expect: 200 });
  check("city filter works", goa.length === 1 && goa[0].city === "Goa");

  const searched = await call("GET", "/api/properties?search=Cyber", { expect: 200 });
  check("search works", searched.length === 1 && searched[0].id === "LAND-2026-003");

  const featured = await call("GET", "/api/properties?featured=true", { expect: 200 });
  check("featured sorted by yield", featured[0].expectedYield >= featured[1].expectedYield);

  const detail = await call("GET", "/api/properties/LAND-2026-001", { expect: 200 });
  check("property detail hydrates documents", detail?.documents?.length === 4);
  check("property exposes computed funding", typeof detail?.fundingPercent === "number");

  const quote = await call("GET", "/api/properties/LAND-2026-001/quote?units=10", {
    expect: 200,
  });
  check("quote computes amount", quote?.amount === 500000);
  check("quote clamps available units", quote?.maxUnits === 355);

  const missing = await call("GET", "/api/properties/LAND-9999-999", { expect: 404 });
  check("missing property is 404", missing?.code === "NOT_FOUND");

  const versions = await call("GET", "/api/properties/LAND-2026-001/versions", {
    expect: 200,
  });
  check("property has a registry version", versions?.length === 1 && versions[0].version === 1);

  const integrity = await call("GET", "/api/properties/LAND-2026-001/integrity", {
    expect: 200,
  });
  check("hash chain intact", integrity?.intact === true);

  // --------------------------------------------------------- seller listing
  log("\nseller");
  const sellerStats = await call("GET", "/api/seller/stats", {
    role: "seller",
    expect: 200,
  });
  check("seller stats report portfolio value", sellerStats?.portfolioValue > 0);

  const createdProperty = await call("POST", "/api/seller/properties", {
    role: "seller",
    body: {
      title: "Smoke Test Residency",
      description: "Created by the smoke test.",
      address: "Test Road",
      city: "Indore",
      state: "Madhya Pradesh",
      category: "residential",
      totalValue: 50_000_000,
      areaSqft: 60_000,
      minInvestment: 25_000,
      expectedYield: 8.1,
      documents: [{ name: "Sale Deed", size: "1.2 MB", type: "PDF" }],
    },
    expect: 201,
  });
  createdPropertyId = createdProperty?.id;
  check("seller can create a property", Boolean(createdPropertyId));
  check(
    "new property awaits verification",
    createdProperty?.status === "pending_verification",
  );
  check("new property is hashed", createdProperty?.propertyHash?.length === 64);
  check("document metadata attached", createdProperty?.documents?.length === 1);

  const badProperty = await call("POST", "/api/seller/properties", {
    role: "seller",
    body: { title: "No docs", city: "Pune", category: "residential", totalValue: 1, areaSqft: 1, minInvestment: 1, expectedYield: 1, documents: [] },
    expect: 422,
  });
  check("invalid property rejected", badProperty?.code === "VALIDATION_ERROR");

  // -------------------------------------------------------------- documents
  log("\ndocuments");
  const document = await call("POST", "/api/documents", {
    body: {
      propertyId: createdPropertyId,
      name: "Encumbrance Certificate",
      type: "PDF",
      size: "0.9 MB",
      content: "smoke-test-document",
    },
    expect: 201,
  });
  createdDocumentId = document?.id;
  check("document hash is sha256", document?.hash?.length === 64);
  check("document status starts pending", document?.status === "pending");

  const documentsForProperty = await call(
    "GET",
    `/api/documents?propertyId=${createdPropertyId}`,
    { expect: 200 },
  );
  check("documents filter by property", documentsForProperty?.length >= 1);

  const hashesOnly = await call("GET", "/api/documents?hashesOnly=true", {
    expect: 200,
  });
  check("hashesOnly omits metadata", hashesOnly?.[0]?.ownerId === undefined);

  const verifiedDoc = await call(
    "PATCH",
    `/api/documents/${createdDocumentId}/verification`,
    { body: { status: "verified", note: "Checked by smoke test" }, expect: 200 },
  );
  check("document verification recorded", verifiedDoc?.status === "verified");
  check(
    "document keeps a status history",
    verifiedDoc?.statusHistory?.length === 2,
  );

  // ----------------------------------------------------------- verification
  log("\nverification");
  const verificationList = await call(
    "GET",
    `/api/verification?propertyId=${createdPropertyId}`,
    { expect: 200 },
  );
  check("verification records exist", verificationList?.length >= 1);

  const approval = await call(
    "POST",
    `/api/admin/properties/${createdPropertyId}/verify`,
    { body: { action: "approve", note: "Smoke test approval" }, expect: 200 },
  );
  check("admin approval returns verified", approval?.status === "verified");
  check("approval returns a tx hash", approval?.txHash?.length === 64);

  const afterApproval = await call("GET", `/api/properties/${createdPropertyId}`, {
    expect: 200,
  });
  check("approved property is open", afterApproval?.status === "open");
  check("approval bumped the hash version", afterApproval?.hashVersion === 2);

  const chainAfter = await call("GET", `/api/properties/${createdPropertyId}/integrity`, {
    expect: 200,
  });
  check("chain still intact after update", chainAfter?.intact === true);

  // -------------------------------------------------------------- registry
  log("\nregistry");
  const registry = await call("GET", "/api/registry", { expect: 200 });
  const registryEntry = registry.find((entry) => entry.id === createdPropertyId);
  check("registry lists the new property", Boolean(registryEntry));
  check("registry counts documents", registryEntry?.documentsCount >= 2);

  const record = await call("GET", `/api/registry/${createdPropertyId}`, {
    expect: 200,
  });
  check("registry record has a timeline", record?.timeline?.length >= 3);
  check("registry record exposes versions", record?.versions?.length === 2);

  // ----------------------------------------------------------- investments
  log("\ninvestments");
  const investment = await call("POST", "/api/investments", {
    body: { propertyId: "LAND-2026-001", units: 10 },
    auth: true,
    expect: 201,
  });
  check("investment created", investment?.units === 10);
  check("investment amount derived", investment?.amount === 500000);
  check("investment records ownership", investment?.ownershipPercent === 0.4);
  check("funding progress returned", investment?.funding?.unitsSold === 2155);

  const tooMany = await call("POST", "/api/investments", {
    body: { propertyId: "LAND-2026-001", units: 999999 },
    auth: true,
    expect: 409,
  });
  check("oversubscription blocked", tooMany?.code === "CONFLICT");

  const belowMin = await call("POST", "/api/investments", {
    body: { propertyId: "LAND-2026-001", units: 0 },
    auth: true,
    expect: 422,
  });
  check("minimum units enforced", belowMin?.code === "VALIDATION_ERROR");

  const summary = await call("GET", "/api/investments/summary", {
    auth: true,
    expect: 200,
  });
  check("portfolio summary computed", summary?.totalInvested === 500000);
  check("portfolio units tracked", summary?.totalUnits === 10);

  const holdings = await call("GET", "/api/investments/holdings", {
    auth: true,
    expect: 200,
  });
  check("holdings aggregated by property", holdings?.[0]?.units === 10);

  const mine = await call("GET", "/api/investments", { auth: true, expect: 200 });
  check("investments scoped to the actor", mine?.every((item) => item.userId === createdUserId));

  // ---------------------------------------------------------- transactions
  log("\ntransactions");
  const transactions = await call("GET", "/api/transactions", {
    auth: true,
    expect: 200,
  });
  check("investment transaction recorded", transactions?.some((txn) => txn.type === "investment"));
  check(
    "transaction amount is negative for a purchase",
    transactions?.[0]?.amount === -500000,
  );

  const txDetail = await call("GET", `/api/transactions/${transactions[0].id}`, {
    expect: 200,
  });
  check("transaction detail fetchable", txDetail?.id === transactions[0].id);

  // ------------------------------------------------------ property history
  log("\nproperty history");
  const history = await call("GET", `/api/property-history/${createdPropertyId}`, {
    expect: 200,
  });
  check("history returns entries array", Array.isArray(history?.entries));

  const globalHistory = await call(
    "GET",
    "/api/property-history?userId=investor-001",
    { expect: 200 },
  );
  check("history filters by user", globalHistory?.length >= 3);

  // ----------------------------------------------------------------- resale
  log("\nresale");
  const listings = await call("GET", "/api/resale?status=active", { expect: 200 });
  check("active resale listings returned", listings?.length === 2);

  const listing = await call("POST", "/api/resale", {
    auth: true,
    body: { propertyId: "LAND-2026-001", units: 5, pricePerUnit: 56_000 },
    expect: 201,
  });
  createdResaleId = listing?.id;
  check("resale listing created", Boolean(createdResaleId));
  check("resale total value computed", listing?.totalValue === 280000);

  const overListed = await call("POST", "/api/resale", {
    auth: true,
    body: { propertyId: "LAND-2026-001", units: 9999, pricePerUnit: 56_000 },
    expect: 422,
  });
  check("cannot list more than held", overListed?.code === "VALIDATION_ERROR");

  const cancelled = await call("DELETE", `/api/resale/${createdResaleId}`, {
    auth: true,
    expect: 200,
  });
  check("listing cancelled", cancelled?.status === "cancelled");

  const buy = await call("POST", "/api/resale/RSL-2026-001/buy", {
    role: "buyer",
    expect: 200,
  });
  check("resale purchase completes", buy?.status === "sold");
  check("resale purchase reports the amount", buy?.amount === 550000);

  const resaleTx = await call("GET", "/api/transactions?type=resale_purchase", {
    role: "buyer",
    expect: 200,
  });
  check("resale purchase transaction recorded", resaleTx?.length === 1);

  // ------------------------------------------------------------------ admin
  log("\nadmin");
  const stats = await call("GET", "/api/admin/stats", { expect: 200 });
  check("admin stats count properties", stats?.totalProperties >= 7);
  check("admin stats include monthly volume", stats?.monthlyVolume?.length === 6);

  const settings = await call("GET", "/api/admin/settings", { expect: 200 });
  check("settings readable", settings?.tokenSymbol === "LANDT");

  const updatedSettings = await call("PATCH", "/api/admin/settings", {
    body: { verificationSlaHours: 36 },
    expect: 200,
  });
  check("settings update persists", updatedSettings?.verificationSlaHours === 36);

  const backups = await call("GET", "/api/admin/backups", { expect: 200 });
  check("backups were taken", Array.isArray(backups) && backups.length > 0);

  const unknownRoute = await call("GET", "/api/does-not-exist", { expect: 404 });
  check("unknown route is 404", unknownRoute?.code === "ROUTE_NOT_FOUND");

  // ---------------------------------------------------------------- summary
  log(`\n${passed} check(s) passed, ${failures.length} failed`);
  if (failures.length) {
    log("\nFailures:");
    for (const failure of failures) log(` - ${failure}`);
    process.exitCode = 1;
  } else {
    log("\nAll API groups responded as expected.\n");
  }
}

run().catch((error) => {
  console.error("\nSmoke test crashed:", error);
  process.exitCode = 1;
});
