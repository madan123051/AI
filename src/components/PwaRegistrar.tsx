"use client";

import { useEffect } from "react";

export function PwaRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const isLocalDev =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "::1";

    if (process.env.NODE_ENV !== "production" || isLocalDev) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => void registration.unregister());
      });

      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => void caches.delete(key));
        });
      }

      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA registration is a progressive enhancement.
    });
  }, []);

  return null;
}
