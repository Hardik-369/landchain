"use client";

import * as React from "react";
import {
  getHydratedSnapshot,
  getServerHydratedSnapshot,
  getServerSessionSnapshot,
  getSessionSnapshot,
  setSession,
  subscribeToSession,
  updateSessionUser,
} from "@/lib/session-store";
import type { AuthSession, User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signIn: (session: AuthSession) => void;
  signOut: () => void;
  updateUser: (patch: Partial<User>) => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = React.useSyncExternalStore(
    subscribeToSession,
    getSessionSnapshot,
    getServerSessionSnapshot,
  );
  const hydrated = React.useSyncExternalStore(
    subscribeToSession,
    getHydratedSnapshot,
    getServerHydratedSnapshot,
  );

  const signIn = React.useCallback((next: AuthSession) => setSession(next), []);
  const signOut = React.useCallback(() => setSession(null), []);
  const updateUser = React.useCallback(
    (patch: Partial<User>) => updateSessionUser(patch),
    [],
  );

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      loading: !hydrated,
      signIn,
      signOut,
      updateUser,
    }),
    [session, hydrated, signIn, signOut, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
