"use client";

import { useEffect } from "react";
import { telemetryErrorCode, trackProductEvent } from "@/lib/telemetry";

export function ClientOperations() {
  useEffect(() => {
    const reported = new Set<string>();
    const report = (value: unknown) => {
      const errorCode = telemetryErrorCode(value);
      if (reported.has(errorCode)) return;
      reported.add(errorCode);
      trackProductEvent("client_error", { errorCode });
    };
    const onError = (event: ErrorEvent) => report(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => report(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
