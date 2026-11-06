export type PropertyCategory = "residential" | "commercial" | "land" | "industrial";

export type PropertyStatus =
  | "open"
  | "funded"
  | "active"
  | "pending_verification"
  | "rejected";

export type KycStatus = "verified" | "pending" | "not_started" | "rejected";

export type UserRole = "buyer" | "seller" | "investor" | "admin";

export interface PropertyDocument {
  id: string;
  name: string;
  type: string;
  hash: string;
  size: string;
  uploadedAt: string;
}

export interface Property {
  id: string;
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  category: PropertyCategory;
  status: PropertyStatus;
  totalValue: number;
  unitPrice: number;
  totalUnits: number;
  unitsSold: number;
  minInvestment: number;
  expectedYield: number;
  expectedAppreciation: number;
  areaSqft: number;
  sellerId: string;
  sellerName: string;
  propertyHash: string;
  registryTxId: string;
  imageSeed: number;
  highlights: string[];
  documents: PropertyDocument[];
  verifiedAt?: string;
  createdAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: UserRole;
  walletAddress?: string;
  kycStatus: KycStatus;
  panMasked?: string;
  joinedAt: string;
  propertiesOwned?: number;
  totalInvested?: number;
}

export interface Investment {
  id: string;
  propertyId: string;
  propertyTitle: string;
  units: number;
  pricePerUnit: number;
  amount: number;
  ownershipPercent: number;
  purchasedAt: string;
  status: "confirmed" | "pending" | "failed";
  txHash: string;
}

export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalUnits: number;
  propertiesCount: number;
  avgOwnershipPercent: number;
  totalReturns: number;
  monthlyRentalIncome: number;
  allocation: { name: string; value: number; color: string }[];
  performance: { month: string; invested: number; value: number }[];
}

export interface Transaction {
  id: string;
  type: "investment" | "payout" | "resale_purchase" | "resale_sale" | "refund";
  description: string;
  amount: number;
  date: string;
  status: "completed" | "pending" | "failed";
  reference: string;
}

export interface ResaleListing {
  id: string;
  propertyId: string;
  propertyTitle: string;
  city: string;
  sellerName: string;
  units: number;
  pricePerUnit: number;
  originalPricePerUnit: number;
  totalValue: number;
  listedAt: string;
  status: "active" | "sold" | "cancelled";
  imageSeed: number;
}

export interface VerificationRecord {
  id: string;
  propertyId: string;
  action: string;
  actor: string;
  role: string;
  hash: string;
  timestamp: string;
  status: "verified" | "pending" | "flagged";
  note?: string;
}

export interface MonthlyFundingPoint {
  month: string;
  funded: number;
  target: number;
}

export interface SellerProperty {
  id: string;
  title: string;
  city: string;
  status: PropertyStatus;
  totalValue: number;
  unitsSold: number;
  totalUnits: number;
  minInvestment: number;
  listedAt: string;
  imageSeed: number;
  investors: number;
}

export interface AdminStats {
  totalProperties: number;
  pendingVerification: number;
  totalUsers: number;
  totalInvestment: number;
  monthlyVolume: { month: string; value: number }[];
  categorySplit: { name: string; value: number; color: string }[];
}

export interface NewPropertyInput {
  title: string;
  description: string;
  address: string;
  city: string;
  state: string;
  category: PropertyCategory;
  totalValue: number;
  areaSqft: number;
  minInvestment: number;
  expectedYield: number;
  documents: { name: string; size: string; type: string }[];
}

export interface AuthSession {
  token: string;
  user: User;
}
