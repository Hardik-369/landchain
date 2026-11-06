import { ApiError, mockId, withMock } from "@/lib/api/client";
import { getProperties } from "@/lib/api/properties";
import { seedResaleListings } from "@/lib/mock/data";
import { readMock, writeMock } from "@/lib/mock/store";
import type { ResaleListing } from "@/lib/types";

const listingsKey = "resale:listings";
const overridesKey = "resale:overrides";

type StatusOverride = Record<string, ResaleListing["status"]>;

function mergedListings(): ResaleListing[] {
  const created = readMock<ResaleListing[]>(listingsKey, []);
  const overrides = readMock<StatusOverride>(overridesKey, {});
  return [...created, ...seedResaleListings].map((listing) =>
    overrides[listing.id] ? { ...listing, status: overrides[listing.id] } : listing,
  );
}

export async function getResaleListings(
  status: ResaleListing["status"] | "all" = "all",
): Promise<ResaleListing[]> {
  return withMock<ResaleListing[]>(
    "/api/resale",
    { method: "GET" },
    () =>
      mergedListings()
        .filter((listing) => status === "all" || listing.status === status)
        .sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime()),
    320,
  );
}

export interface CreateResaleListingInput {
  propertyId: string;
  units: number;
  pricePerUnit: number;
  sellerName?: string;
}

export async function createResaleListing(
  input: CreateResaleListingInput,
): Promise<ResaleListing> {
  const propertyList = await getProperties();
  const property = propertyList.find((item) => item.id === input.propertyId);

  if (!property) throw new ApiError("Select a property you own units in.", 404);
  if (input.units <= 0) throw new ApiError("Units must be greater than zero.", 422);
  if (input.pricePerUnit <= 0) {
    throw new ApiError("Enter a valid asking price per unit.", 422);
  }
  if (input.units > property.unitsSold) {
    throw new ApiError(
      `You can list at most ${property.unitsSold} units for this property.`,
      422,
    );
  }

  return withMock<ResaleListing>(
    "/api/resale",
    { method: "POST", body: JSON.stringify(input) },
    () => {
      const listing: ResaleListing = {
        id: mockId("RSL"),
        propertyId: property.id,
        propertyTitle: property.title,
        city: property.city,
        sellerName: input.sellerName ?? "You",
        units: input.units,
        pricePerUnit: input.pricePerUnit,
        originalPricePerUnit: property.unitPrice,
        totalValue: input.units * input.pricePerUnit,
        listedAt: new Date().toISOString(),
        status: "active",
        imageSeed: property.imageSeed,
      };
      writeMock(listingsKey, [listing, ...readMock<ResaleListing[]>(listingsKey, [])]);
      return listing;
    },
    700,
  );
}

export async function cancelResaleListing(id: string): Promise<ResaleListing> {
  const listing = mergedListings().find((item) => item.id === id);
  if (!listing) throw new ApiError("Listing not found.", 404);
  if (listing.status !== "active") {
    throw new ApiError("Only active listings can be cancelled.", 409);
  }

  return withMock<ResaleListing>(
    `/api/resale/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    () => {
      const overrides = readMock<StatusOverride>(overridesKey, {});
      writeMock(overridesKey, { ...overrides, [id]: "cancelled" });
      return { ...listing, status: "cancelled" };
    },
    550,
  );
}

export async function buyResaleListing(id: string): Promise<ResaleListing> {
  const listing = mergedListings().find((item) => item.id === id);
  if (!listing) throw new ApiError("Listing not found.", 404);
  if (listing.status !== "active") {
    throw new ApiError("This listing is no longer available.", 409);
  }

  return withMock<ResaleListing>(
    `/api/resale/${encodeURIComponent(id)}/buy`,
    { method: "POST" },
    () => {
      const overrides = readMock<StatusOverride>(overridesKey, {});
      writeMock(overridesKey, { ...overrides, [id]: "sold" });
      return { ...listing, status: "sold" };
    },
    900,
  );
}
