import { ApiError, DEMO_NOW, mockId, withMock } from "@/lib/api/client";
import { getProperties, propertyFundingPercent } from "@/lib/api/properties";
import { properties as seedProperties, seedInvestments, transactions } from "@/lib/mock/data";
import { readMock, writeMock } from "@/lib/mock/store";
import type {
  Investment,
  PortfolioSummary,
  Property,
  Transaction,
} from "@/lib/types";

const createdKey = "investments";

function allInvestments(): Investment[] {
  const created = readMock<Investment[]>(createdKey, []);
  return [...created, ...seedInvestments];
}

function propertyFor(propertyId: string, pool: Property[] = seedProperties): Property | undefined {
  return pool.find((property) => property.id === propertyId);
}

function monthsSince(iso: string): number {
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(
    0,
    (DEMO_NOW.getTime() - start) / (1000 * 60 * 60 * 24 * 30.44),
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  residential: "#10b981",
  commercial: "#38bdf8",
  land: "#a78bfa",
  industrial: "#fbbf24",
};

function buildPortfolio(investments: Investment[], pool: Property[]): PortfolioSummary {
  let invested = 0;
  let currentValue = 0;
  let units = 0;
  let returns = 0;
  let rentalIncome = 0;
  const allocationMap = new Map<string, number>();
  let ownershipSum = 0;

  for (const investment of investments) {
    const property = propertyFor(investment.propertyId, pool);
    invested += investment.amount;
    units += investment.units;
    ownershipSum += investment.ownershipPercent;

    if (property) {
      const held = monthsSince(investment.purchasedAt);
      const growth = 1 + (property.expectedAppreciation / 100) * (held / 60);
      const value = investment.amount * growth;
      currentValue += value;
      returns += value - investment.amount;
      rentalIncome += (investment.amount * (property.expectedYield / 100)) / 12;
      const category = property.category;
      allocationMap.set(category, (allocationMap.get(category) ?? 0) + investment.amount);
    } else {
      currentValue += investment.amount;
    }
  }

  const allocation = [...allocationMap.entries()].map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
    color: CATEGORY_COLORS[name] ?? "#10b981",
  }));

  const performance = Array.from({ length: 6 }).map((_, index) => {
    const progress = (index + 1) / 6;
    return {
      month: new Date(2026, 5 + index, 1).toLocaleString("en-IN", { month: "short" }),
      invested: Math.round(invested * (0.55 + progress * 0.45)),
      value: Math.round(currentValue * (0.6 + progress * 0.4) + returns * 0.02 * index),
    };
  });

  return {
    totalInvested: Math.round(invested),
    currentValue: Math.round(currentValue),
    totalUnits: units,
    propertiesCount: new Set(investments.map((i) => i.propertyId)).size,
    avgOwnershipPercent: investments.length
      ? Number((ownershipSum / investments.length).toFixed(2))
      : 0,
    totalReturns: Math.round(returns),
    monthlyRentalIncome: Math.round(rentalIncome),
    allocation,
    performance,
  };
}

export async function getInvestments(): Promise<Investment[]> {
  return withMock<Investment[]>(
    "/api/investments",
    { method: "GET" },
    () =>
      [...allInvestments()].sort(
        (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
      ),
    300,
  );
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const pool = await getProperties();
  return withMock<PortfolioSummary>(
    "/api/investments/summary",
    { method: "GET" },
    () => buildPortfolio(allInvestments(), pool),
    360,
  );
}

export async function getTransactions(): Promise<Transaction[]> {
  const local = readMock<Investment[]>(createdKey, []);
  return withMock<Transaction[]>(
    "/api/transactions",
    { method: "GET" },
    () => {
      const derived: Transaction[] = local.map((investment) => ({
        id: `TXN-${investment.id.replace(/^INV-/, "")}`,
        type: "investment",
        description: `${investment.propertyTitle} · ${investment.units} units`,
        amount: -investment.amount,
        date: investment.purchasedAt,
        status: "completed",
        reference: investment.txHash,
      }));
      return [...derived, ...transactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
    },
    320,
  );
}

export interface InvestmentQuote {
  propertyId: string;
  units: number;
  unitPrice: number;
  amount: number;
  ownershipPercent: number;
  annualRentalIncome: number;
  projectedValue5Years: number;
  projectedGain5Years: number;
  minUnits: number;
  maxUnits: number;
}

/** Server-side projection used by the investment calculator. */
export async function quoteInvestment(
  propertyId: string,
  units: number,
): Promise<InvestmentQuote> {
  const property = propertyFor(propertyId);
  if (!property) throw new ApiError("Property not found.", 404);

  const minUnits = Math.ceil(property.minInvestment / property.unitPrice);
  const maxUnits = property.totalUnits - property.unitsSold;
  const safeUnits = Math.min(Math.max(Math.round(units), 0), maxUnits);
  const amount = safeUnits * property.unitPrice;
  const annualRentalIncome = (amount * property.expectedYield) / 100;
  const projectedValue5Years =
    amount * (1 + property.expectedAppreciation / 100);

  return withMock<InvestmentQuote>(
    `/api/properties/${encodeURIComponent(propertyId)}/quote?units=${safeUnits}`,
    { method: "GET" },
    () => ({
      propertyId: property.id,
      units: safeUnits,
      unitPrice: property.unitPrice,
      amount,
      ownershipPercent: Number(
        ((safeUnits / property.totalUnits) * 100).toFixed(4),
      ),
      annualRentalIncome: Math.round(annualRentalIncome),
      projectedValue5Years: Math.round(projectedValue5Years),
      projectedGain5Years: Math.round(projectedValue5Years - amount),
      minUnits,
      maxUnits,
    }),
    140,
  );
}

export interface CreateInvestmentInput {
  propertyId: string;
  units: number;
}

export async function createInvestment(
  input: CreateInvestmentInput,
): Promise<Investment> {
  const pool = await getProperties();
  const property = propertyFor(input.propertyId, pool);

  if (!property) throw new ApiError("Property not found.", 404);
  if (input.units <= 0) throw new ApiError("Select at least one unit.", 422);

  const minUnits = Math.ceil(property.minInvestment / property.unitPrice);
  if (input.units < minUnits) {
    throw new ApiError(`Minimum investment is ${minUnits} units.`, 422);
  }

  const availableUnits = property.totalUnits - property.unitsSold;
  if (input.units > availableUnits) {
    throw new ApiError(`Only ${availableUnits} units are available for this property.`, 409);
  }

  return withMock<Investment>(
    "/api/investments",
    { method: "POST", body: JSON.stringify(input) },
    () => {
      const investment: Investment = {
        id: mockId("INV"),
        propertyId: property.id,
        propertyTitle: property.title,
        units: input.units,
        pricePerUnit: property.unitPrice,
        amount: input.units * property.unitPrice,
        ownershipPercent: Number(
          ((input.units / property.totalUnits) * 100).toFixed(4),
        ),
        purchasedAt: new Date().toISOString(),
        status: "confirmed",
        txHash: `0x${mockId("tx").replace(/-/g, "").toLowerCase().padEnd(40, "0")}`,
      };
      writeMock(createdKey, [investment, ...readMock<Investment[]>(createdKey, [])]);
      return investment;
    },
    800,
  );
}

export { propertyFundingPercent };
