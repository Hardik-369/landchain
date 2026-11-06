import { ApiError, mockId, withMock } from "@/lib/api/client";
import { demoUsers } from "@/lib/mock/data";
import type { AuthSession, User, UserRole } from "@/lib/types";

/** Demo OTP shown in the UI while the backend OTP service is unavailable. */
export const DEMO_OTP = "123456";

export interface OtpRequestResult {
  requestId: string;
  mobile: string;
  expiresInSeconds: number;
  /** Only present while running on mock responses. */
  devOtp?: string;
}

export function normalizeMobile(mobile: string): string {
  return mobile.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "").slice(-10);
}

function assertMobile(mobile: string) {
  if (!/^[6-9]\d{9}$/.test(normalizeMobile(mobile))) {
    throw new ApiError("Enter a valid 10-digit Indian mobile number.", 422);
  }
}

function demoUserForRole(role: UserRole): User {
  const match = demoUsers.find((user) => user.role === role);
  const fallback = demoUsers[0];
  const user = match ?? fallback;
  return {
    ...user,
    name: role === "admin" ? user.name : user.name,
    role,
  };
}

export async function requestOtp(mobile: string): Promise<OtpRequestResult> {
  assertMobile(mobile);

  return withMock<OtpRequestResult>(
    "/api/auth/otp",
    { method: "POST", body: JSON.stringify({ mobile: normalizeMobile(mobile) }) },
    () => ({
      requestId: mockId("otp"),
      mobile: normalizeMobile(mobile),
      expiresInSeconds: 300,
      devOtp: DEMO_OTP,
    }),
    420,
  );
}

export interface VerifyOtpInput {
  requestId: string;
  mobile: string;
  code: string;
  role: UserRole;
}

export async function verifyOtp(input: VerifyOtpInput): Promise<AuthSession> {
  if (!/^\d{6}$/.test(input.code)) {
    throw new ApiError("Enter the 6-digit OTP sent to your mobile.", 422);
  }

  return withMock<AuthSession>(
    "/api/auth/verify-otp",
    {
      method: "POST",
      body: JSON.stringify({
        requestId: input.requestId,
        mobile: normalizeMobile(input.mobile),
        otp: input.code,
      }),
    },
    () => {
      if (input.code !== DEMO_OTP) {
        throw new ApiError("Incorrect OTP. Please try again.", 401);
      }
      const user = demoUserForRole(input.role);
      return {
        token: `mock_${user.id}_${Date.now().toString(36)}`,
        user: {
          ...user,
          mobile: `+91 ${normalizeMobile(input.mobile).slice(0, 5)} ${normalizeMobile(input.mobile).slice(5)}`,
        },
      };
    },
    500,
  );
}

export interface WalletResult {
  address: string;
  network: string;
}

export async function connectWallet(address: string): Promise<WalletResult> {
  const clean = address.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    throw new ApiError("Enter a valid EVM wallet address (0x + 40 hex characters).", 422);
  }

  return withMock<WalletResult>(
    "/api/auth/wallet",
    { method: "POST", body: JSON.stringify({ address: clean }) },
    () => ({ address: clean, network: "Hedera Testnet" }),
    700,
  );
}

export interface PanResult {
  panMasked: string;
  status: "verified" | "pending";
}

export async function verifyPan(pan: string): Promise<PanResult> {
  const clean = pan.trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(clean)) {
    throw new ApiError("PAN must look like ABCDE1234F.", 422);
  }

  return withMock<PanResult>(
    "/api/auth/pan",
    { method: "POST", body: JSON.stringify({ pan: clean }) },
    () => ({
      panMasked: `${clean.slice(0, 5)}****${clean.slice(9)}`,
      status: "verified",
    }),
    900,
  );
}
