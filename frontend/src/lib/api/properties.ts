import { withMock } from "@/lib/api/client";
import { properties as seedProperties } from "@/lib/mock/data";
import { readMock } from "@/lib/mock/store";
import type { Property, PropertyCategory, PropertyStatus } from "@/lib/types";

export const userPropertiesKey = "properties";

export interface PropertyFilters {
  search?: string;
  city?: string;
  category?: PropertyCategory | "all";
  status?: PropertyStatus | "all";
  minInvestment?: number;
  sort?: "funding" | "value_asc" | "value_desc" | "yield" | "newest";
}

function allProperties(): Property[] {
  const created = readMock<Property[]>(userPropertiesKey, []);
  return [...created, ...seedProperties];
}

function matchesFilters(property: Property, filters: PropertyFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = `${property.title} ${property.city} ${property.state} ${property.id} ${property.address}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.city && filters.city !== "all" && property.city !== filters.city) {
    return false;
  }
  if (filters.category && filters.category !== "all" && property.category !== filters.category) {
    return false;
  }
  if (filters.status && filters.status !== "all" && property.status !== filters.status) {
    return false;
  }
  if (filters.minInvestment && property.minInvestment > filters.minInvestment) {
    return false;
  }
  return true;
}

function sortProperties(list: Property[], sort: PropertyFilters["sort"]): Property[] {
  const sorted = [...list];
  switch (sort) {
    case "value_asc":
      return sorted.sort((a, b) => a.totalValue - b.totalValue);
    case "value_desc":
      return sorted.sort((a, b) => b.totalValue - a.totalValue);
    case "yield":
      return sorted.sort((a, b) => b.expectedYield - a.expectedYield);
    case "newest":
      return sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case "funding":
    default:
      return sorted.sort(
        (a, b) => b.unitsSold / b.totalUnits - a.unitsSold / a.totalUnits,
      );
  }
}

export async function getProperties(filters: PropertyFilters = {}): Promise<Property[]> {
  return withMock<Property[]>(
    "/api/properties",
    { method: "GET" },
    () => sortProperties(allProperties().filter((p) => matchesFilters(p, filters)), filters.sort),
    300,
  );
}

export async function getPropertyById(id: string): Promise<Property | null> {
  return withMock<Property | null>(
    `/api/properties/${encodeURIComponent(id)}`,
    { method: "GET" },
    () => allProperties().find((property) => property.id === id) ?? null,
    260,
  );
}

export async function getFeaturedProperties(limit = 3): Promise<Property[]> {
  return withMock<Property[]>(
    "/api/properties?featured=true",
    { method: "GET" },
    () =>
      [...allProperties()]
        .sort((a, b) => b.expectedYield - a.expectedYield)
        .slice(0, limit),
    280,
  );
}

export function propertyFundingPercent(property: Property): number {
  if (!property.totalUnits) return 0;
  return Math.min(100, (property.unitsSold / property.totalUnits) * 100);
}
