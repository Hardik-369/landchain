import { withMock } from "@/lib/api/client";
import { getProperties, getPropertyById } from "@/lib/api/properties";
import { verificationHistory } from "@/lib/mock/data";
import type { Property, VerificationRecord } from "@/lib/types";

export interface RegistryEntry {
  id: string;
  title: string;
  city: string;
  propertyHash: string;
  registryTxId: string;
  documentsCount: number;
  verificationsCount: number;
  status: Property["status"];
  verifiedAt?: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  status: "verified" | "pending" | "flagged" | "info";
  hash?: string;
}

export interface RegistryRecord {
  property: Property;
  verifications: VerificationRecord[];
  timeline: TimelineEvent[];
}

export async function getRegistryEntries(): Promise<RegistryEntry[]> {
  const propertyList = await getProperties();
  return withMock<RegistryEntry[]>(
    "/api/registry",
    { method: "GET" },
    () =>
      propertyList.map((property) => {
        const records = verificationHistory.filter(
          (record) => record.propertyId === property.id,
        );
        const latest = records[records.length - 1];
        return {
          id: property.id,
          title: property.title,
          city: property.city,
          propertyHash: property.propertyHash,
          registryTxId: property.registryTxId,
          documentsCount: property.documents.length,
          verificationsCount: records.filter((r) => r.status === "verified").length,
          status: property.status,
          verifiedAt: property.verifiedAt,
          updatedAt: latest?.timestamp ?? property.createdAt,
        };
      }),
    340,
  );
}

export async function getRegistryRecord(id: string): Promise<RegistryRecord | null> {
  const property = await getPropertyById(id);
  if (!property) return null;

  const verifications = verificationHistory
    .filter((record) => record.propertyId === id)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const timeline: TimelineEvent[] = [
    {
      id: `${id}-listed`,
      title: "Property listed",
      description: `${property.sellerName} submitted the asset for fractional investment.`,
      timestamp: property.createdAt,
      status: "info",
      hash: property.propertyHash,
    },
    ...verifications.map<TimelineEvent>((record) => ({
      id: record.id,
      title: record.action,
      description: record.note ?? `Recorded by ${record.actor}.`,
      timestamp: record.timestamp,
      status: record.status,
      hash: record.hash,
    })),
    {
      id: `${id}-funding`,
      title: "Investment window opened",
      description: `${property.unitsSold.toLocaleString("en-IN")} of ${property.totalUnits.toLocaleString("en-IN")} units subscribed.`,
      timestamp: property.verifiedAt ?? property.createdAt,
      status: "info",
    },
  ];

  timeline.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  return withMock<RegistryRecord | null>(
    `/api/registry/${encodeURIComponent(id)}`,
    { method: "GET" },
    () => ({ property, verifications, timeline }),
    300,
  );
}
