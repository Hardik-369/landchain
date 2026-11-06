import { ApiError, mockId, withMock } from "@/lib/api/client";
import { mockHash, properties, sellerProperties } from "@/lib/mock/data";
import { readMock, writeMock } from "@/lib/mock/store";
import { userPropertiesKey } from "@/lib/api/properties";
import type { NewPropertyInput, Property, SellerProperty } from "@/lib/types";

export interface SellerStats {
  portfolioValue: number;
  totalRaised: number;
  activeListings: number;
  totalInvestors: number;
  monthlyFunding: { month: string; funded: number }[];
}

function createdProperties(): Property[] {
  return readMock<Property[]>(userPropertiesKey, []);
}

export async function getSellerProperties(): Promise<SellerProperty[]> {
  return withMock<SellerProperty[]>(
    "/api/seller/properties",
    { method: "GET" },
    () => {
      const created = createdProperties().map<SellerProperty>((property) => ({
        id: property.id,
        title: property.title,
        city: property.city,
        status: property.status,
        totalValue: property.totalValue,
        unitsSold: property.unitsSold,
        totalUnits: property.totalUnits,
        minInvestment: property.minInvestment,
        listedAt: property.createdAt,
        imageSeed: property.imageSeed,
        investors: Math.max(0, Math.round(property.unitsSold / 34)),
      }));
      return [...created, ...sellerProperties];
    },
    320,
  );
}

export async function getSellerStats(): Promise<SellerStats> {
  const list = await getSellerProperties();
  return withMock<SellerStats>(
    "/api/seller/stats",
    { method: "GET" },
    () => {
      const details = [...createdProperties(), ...properties];
      const raised = list.reduce((sum, property) => {
        const detail = details.find((item) => item.id === property.id);
        return sum + (detail ? detail.unitsSold * detail.unitPrice : 0);
      }, 0);
      return {
        portfolioValue: list.reduce((sum, property) => sum + property.totalValue, 0),
        totalRaised: raised,
        activeListings: list.filter((property) =>
          ["open", "active", "funded"].includes(property.status),
        ).length,
        totalInvestors: list.reduce((sum, property) => sum + property.investors, 0),
        monthlyFunding: ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"].map(
          (month, index) => ({
            month,
            funded: Math.round(raised * (0.09 + index * 0.035)),
          }),
        ),
      };
    },
    350,
  );
}

export async function createSellerProperty(
  input: NewPropertyInput,
): Promise<Property> {
  if (!input.title.trim()) throw new ApiError("Property title is required.", 422);
  if (!input.city.trim()) throw new ApiError("City is required.", 422);
  if (input.totalValue < 10_00_000) {
    throw new ApiError("Total property value must be at least ₹10,00,000.", 422);
  }
  if (input.areaSqft <= 0) throw new ApiError("Enter a valid built-up area.", 422);
  if (input.minInvestment < 10_000) {
    throw new ApiError("Minimum investment must be at least ₹10,000.", 422);
  }
  if (input.documents.length === 0) {
    throw new ApiError("Upload at least one ownership document.", 422);
  }

  return withMock<Property>(
    "/api/seller/properties",
    { method: "POST", body: JSON.stringify(input) },
    () => {
      const unitPrice = input.minInvestment;
      const totalUnits = Math.max(1, Math.round(input.totalValue / unitPrice));
      const id = `LAND-${new Date().getFullYear()}-${String(
        properties.length + createdProperties().length + 1,
      ).padStart(3, "0")}`;
      const createdAt = new Date().toISOString();

      const property: Property = {
        id,
        title: input.title.trim(),
        description:
          input.description.trim() ||
          `${input.title} is a ${input.category} asset in ${input.city}, tokenised for fractional ownership on LANDCHAIN.`,
        address: input.address.trim() || input.city,
        city: input.city.trim(),
        state: input.state.trim() || "—",
        category: input.category,
        status: "pending_verification",
        totalValue: input.totalValue,
        unitPrice,
        totalUnits,
        unitsSold: 0,
        minInvestment: input.minInvestment,
        expectedYield: input.expectedYield,
        expectedAppreciation: 12,
        areaSqft: input.areaSqft,
        sellerId: "seller-001",
        sellerName: "Arjun Mehta",
        propertyHash: mockHash(`${id}:${input.title}:${input.totalValue}`),
        registryTxId: `0x${mockHash(`${id}:registry`, 40)}`,
        imageSeed: (properties.length % 15) + 1,
        highlights: [
          `${input.category.charAt(0).toUpperCase() + input.category.slice(1)} asset`,
          `${input.city}`,
          "Pending registry verification",
        ],
        documents: input.documents.map((document, index) => ({
          id: `${id}-doc-${index + 1}`,
          name: document.name,
          type: document.type,
          hash: mockHash(`${id}:${document.name}`),
          size: document.size,
          uploadedAt: createdAt,
        })),
        createdAt,
      };

      writeMock(userPropertiesKey, [property, ...createdProperties()]);
      return property;
    },
    900,
  );
}

export { mockId };
