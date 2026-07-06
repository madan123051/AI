"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";
import { authCookieName, isPrivateAppPath } from "@/lib/authRoutes";

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isConfigured: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function secureCookiePart() {
  return typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
}

export function setAuthMarker(hasSession: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  if (hasSession) {
    document.cookie = `${authCookieName}=1; Path=/; Max-Age=604800; SameSite=Lax${secureCookiePart()}`;
  } else {
    document.cookie = `${authCookieName}=; Path=/; Max-Age=0; SameSite=Lax${secureCookiePart()}`;
  }
}

function nextUrl(pathname: string) {
  if (typeof window === "undefined") {
    return pathname;
  }

  return `${pathname}${window.location.search}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const isConfigured = hasSupabaseConfig();
  const [isLoading, setIsLoading] = useState(() => isConfigured);
  const isPrivatePage = isPrivateAppPath(pathname);

  useEffect(() => {
    if (!isConfigured) {
      setAuthMarker(false);

      if (isPrivatePage) {
        router.replace(`/login?next=${encodeURIComponent(nextUrl(pathname))}`);
      }

      return;
    }

    const supabase = getSupabaseClient();
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      const activeSession = data.session ?? null;
      setSession(activeSession);
      setAuthMarker(Boolean(activeSession));
      setIsLoading(false);

      if (!activeSession && isPrivatePage) {
        router.replace(`/login?next=${encodeURIComponent(nextUrl(pathname))}`);
      }

    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setAuthMarker(Boolean(nextSession));
      setIsLoading(false);

      if (!nextSession && isPrivatePage) {
        router.replace(`/login?next=${encodeURIComponent(nextUrl(pathname))}`);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [isConfigured, isPrivatePage, pathname, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      isLoading,
      isConfigured,
      async signOut() {
        setAuthMarker(false);

        if (isConfigured) {
          await getSupabaseClient().auth.signOut();
        }

        setSession(null);
        router.replace("/login");
      },
    }),
    [isConfigured, isLoading, router, session],
  );

  if (isPrivatePage && isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-zinc-100">
        <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950/80 p-5 text-center shadow-2xl shadow-black/30">
          <div className="mx-auto mb-4 h-10 w-10 rounded-lg bg-emerald-400" />
          <p className="text-sm font-medium text-zinc-300">Checking secure session</p>
        </div>
      </div>
    );
  }

  if (isPrivatePage && !isLoading && !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-zinc-100">
        <div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950/80 p-5 text-center shadow-2xl shadow-black/30">
          <p className="text-sm font-medium text-zinc-300">Redirecting to login</p>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return value;
}
