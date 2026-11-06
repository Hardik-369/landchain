import type { PropertyCategory, PropertyStatus, UserRole } from "@/lib/types";

export const SITE = {
  name: "LANDCHAIN",
  tagline: "Fractional real estate, settled on-chain.",
  description:
    "LANDCHAIN tokenises verified Indian real estate so investors can own institutional-grade property from ₹25,000, with every title hash anchored on Hedera.",
  email: "hello@landchain.in",
  phone: "+91 22 4890 2200",
  address: "Level 9, One BKC, Bandra East, Mumbai 400051",
};

export const PUBLIC_NAV = [
  { label: "Marketplace", href: "/buyer" },
  { label: "Property registry", href: "/registry" },
  { label: "Resale", href: "/resale" },
  { label: "How it works", href: "/#how-it-works" },
];

export const ROLE_HOME: Record<UserRole, string> = {
  buyer: "/buyer",
  seller: "/seller",
  investor: "/investor",
  admin: "/admin",
};

export const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  residential: "Residential",
  commercial: "Commercial",
  land: "Land parcel",
  industrial: "Industrial",
};

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  open: "Open for investment",
  funded: "Fully funded",
  active: "Active",
  pending_verification: "Pending verification",
  rejected: "Rejected",
};

export const CITIES = [
  "Mumbai",
  "Bengaluru",
  "Pune",
  "Hyderabad",
  "Gurugram",
  "Chennai",
  "Ahmedabad",
  "Jaipur",
  "Kochi",
  "Indore",
  "Noida",
  "Kolkata",
  "Surat",
  "Chandigarh",
  "Goa",
];
