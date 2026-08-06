"use client";

import { createContext, useCallback, useContext, useState } from "react";

/**
 * Bridges /register (name/phone/password/18+/referral, sends the SMS code)
 * to /register/confirmar (code only, actually creates the account) —
 * React state on this shared layout, NOT sessionStorage/localStorage.
 * Client-side navigation between sibling routes under the same layout
 * (router.push, which both pages use) doesn't remount it, so state
 * survives the hop; a hard refresh or opening /register/confirmar directly
 * does lose it, which is the point — a password has no business persisting
 * to disk even briefly, and confirmar's own effect bounces back to
 * /register when pending is null, so that case degrades safely instead of
 * silently breaking.
 */
export type RegisterPendingData = {
  displayName: string;
  phone: string;
  password: string;
  ageConfirmed: boolean;
  referralCode?: string;
};

type RegisterPendingContextValue = {
  pending: RegisterPendingData | null;
  setPending: (data: RegisterPendingData) => void;
  clearPending: () => void;
};

const RegisterPendingContext = createContext<RegisterPendingContextValue | null>(null);

export function useRegisterPending(): RegisterPendingContextValue {
  const ctx = useContext(RegisterPendingContext);
  if (!ctx) throw new Error("useRegisterPending must be used within app/(auth)/register's layout");
  return ctx;
}

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  const [pending, setPendingState] = useState<RegisterPendingData | null>(null);
  const setPending = useCallback((data: RegisterPendingData) => setPendingState(data), []);
  const clearPending = useCallback(() => setPendingState(null), []);

  return (
    <RegisterPendingContext.Provider value={{ pending, setPending, clearPending }}>
      {children}
    </RegisterPendingContext.Provider>
  );
}
