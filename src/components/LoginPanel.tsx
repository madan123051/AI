"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link as LinkIcon, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";
import { setAuthMarker, useAuth } from "@/components/AuthProvider";

function nextDestination() {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  const requested = new URLSearchParams(window.location.search).get("next") || "/dashboard";

  return requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
}

export function LoginPanel() {
  const router = useRouter();
  const { user, isConfigured, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const destination = useMemo(() => nextDestination(), []);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(destination);
    }
  }, [destination, isLoading, router, user]);

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!isConfigured) {
      setError("Supabase Auth is not configured.");
      return;
    }

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: loginError } = await getSupabaseClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (loginError) {
        throw loginError;
      }

      setAuthMarker(true);
      router.replace(destination);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleMagicLink() {
    setError("");
    setMessage("");

    if (!isConfigured) {
      setError("Supabase Auth is not configured.");
      return;
    }

    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setIsSubmitting(true);

    try {
      const redirectTo = typeof window !== "undefined"
        ? `${window.location.origin}/login?next=${encodeURIComponent(destination)}`
        : undefined;
      const { error: magicError } = await getSupabaseClient().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirectTo },
      });

      if (magicError) {
        throw magicError;
      }

      setMessage("Magic link sent. Check your email.");
    } catch (magicError) {
      setError(magicError instanceof Error ? magicError.message : "Magic link failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-zinc-100">
      <section className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl shadow-black/40 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-400">Private Control Center</p>
            <h1 className="text-xl font-semibold text-zinc-50">AI Wildsaura Control</h1>
          </div>
        </div>

        <form className="mt-6 grid gap-4" onSubmit={handlePasswordLogin}>
          <label className="grid gap-2 text-sm font-medium text-zinc-300" htmlFor="login-email">
            Email
            <span className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                className="min-h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-10 pr-3 text-base text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="owner@wildsaura.com"
              />
            </span>
          </label>

          <label className="grid gap-2 text-sm font-medium text-zinc-300" htmlFor="login-password">
            Password
            <span className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                className="min-h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 pl-10 pr-3 text-base text-zinc-50 outline-none transition placeholder:text-zinc-600 focus:border-emerald-300"
                placeholder="Password"
              />
            </span>
          </label>

          {error ? (
            <div className="rounded-lg border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100" role="alert">
              {error}
            </div>
          ) : null}

          {message ? (
            <div className="rounded-lg border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-sm text-emerald-100" role="status">
              {message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-base font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Login
          </button>

          <button
            type="button"
            onClick={() => void handleMagicLink()}
            disabled={isSubmitting || isLoading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 text-base font-semibold text-zinc-100 transition hover:border-sky-300 hover:text-sky-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <LinkIcon className="h-4 w-4" aria-hidden="true" />
            Send Magic Link
          </button>
        </form>
      </section>
    </main>
  );
}
