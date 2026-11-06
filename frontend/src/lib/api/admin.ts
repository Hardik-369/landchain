import { ApiError, withMock } from "@/lib/api/client";
import { getProperties } from "@/lib/api/properties";
import { adminStats, users } from "@/lib/mock/data";
import type { AdminStats, Property, User } from "@/lib/types";

export async function getAdminStats(): Promise<AdminStats> {
  const propertyList = await getProperties();
  return withMock<AdminStats>(
    "/api/admin/stats",
    { method: "GET" },
    () => ({
      ...adminStats,
      totalProperties: propertyList.length,
      pendingVerification: propertyList.filter(
        (property) => property.status === "pending_verification",
      ).length,
      totalInvestment: propertyList.reduce(
        (sum, property) => sum + property.unitsSold * property.unitPrice,
        0,
      ),
    }),
    320,
  );
}

export async function getAdminUsers(): Promise<User[]> {
  return withMock<User[]>(
    "/api/admin/users",
    { method: "GET" },
    () => users,
    300,
  );
}

export async function getPendingVerifications(): Promise<Property[]> {
  const propertyList = await getProperties();
  return withMock<Property[]>(
    "/api/admin/properties?status=pending_verification",
    { method: "GET" },
    () =>
      propertyList.filter(
        (property) =>
          property.status === "pending_verification" || property.status === "open",
      ),
    320,
  );
}

export interface VerificationDecision {
  propertyId: string;
  action: "approve" | "reject";
  note?: string;
}

export interface VerificationResult {
  propertyId: string;
  status: "verified" | "rejected";
  decidedAt: string;
  txHash: string;
}

export async function decideVerification(
  decision: VerificationDecision,
): Promise<VerificationResult> {
  if (!decision.propertyId) throw new ApiError("Property is required.", 422);

  return withMock<VerificationResult>(
    `/api/admin/properties/${encodeURIComponent(decision.propertyId)}/verify`,
    { method: "POST", body: JSON.stringify(decision) },
    () => ({
      propertyId: decision.propertyId,
      status: decision.action === "approve" ? "verified" : "rejected",
      decidedAt: new Date().toISOString(),
      txHash: `0x${decision.propertyId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().padEnd(40, "a")}`,
    }),
    750,
  );
}
