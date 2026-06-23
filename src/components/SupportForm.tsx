"use client";

import { useState } from "react";
import {
  PRESET_AMOUNTS,
  normalizeAmount,
  formatPence,
  CURRENCY_SYMBOL,
  type Frequency,
} from "@/lib/support";

export function SupportForm() {
  const [frequency, setFrequency] = useState<Frequency>("one-time");
  const [amount, setAmount] = useState<string>("5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = normalizeAmount(amount);
  const ready = parsed.ok && !loading;

  const cta = !parsed.ok
    ? "Choose an amount"
    : frequency === "monthly"
      ? `Support ${formatPence(parsed.pence)} / month`
      : `Support with ${formatPence(parsed.pence)}`;

  async function donate() {
    if (!parsed.ok) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, frequency }),
      });
      const data = (await res.json().catch(() => null)) as
        | { url?: string; error?: string }
        | null;
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return; // leaving the page; keep the spinner up
      }
      setError(data?.error || "Something went wrong. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="panel p-6 sm:p-8">
      {/* Frequency toggle */}
      <div
        role="radiogroup"
        aria-label="Donation frequency"
        className="panel-inset flex rounded-full p-1"
      >
        {(["one-time", "monthly"] as const).map((f) => {
          const active = frequency === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFrequency(f)}
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-gold text-ink-deep"
                  : "text-[var(--muted)] hover:text-parchment"
              }`}
            >
              {f === "one-time" ? "One-time" : "Monthly"}
            </button>
          );
        })}
      </div>

      {/* Preset chips */}
      <div className="mt-5 grid grid-cols-4 gap-2.5">
        {PRESET_AMOUNTS.map((p) => {
          const active = amount.trim() === String(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setAmount(String(p));
                setError(null);
              }}
              aria-pressed={active}
              className={`h-12 rounded-xl text-base font-medium transition-colors ${
                active
                  ? "border border-gold bg-[rgba(201,162,75,0.10)] text-gold-soft"
                  : "border border-[var(--hairline-soft)] text-parchment hover:border-[var(--hairline)]"
              }`}
            >
              {CURRENCY_SYMBOL}
              {p}
            </button>
          );
        })}
      </div>

      {/* Custom amount */}
      <label className="mt-3 block">
        <span className="sr-only">Custom amount in pounds</span>
        <div className="field flex items-center gap-2 px-4 py-3">
          <span className="text-lg text-[var(--muted)]">{CURRENCY_SYMBOL}</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            placeholder="Other amount"
            aria-label="Custom amount in pounds"
            className="w-full bg-transparent text-lg text-parchment outline-none placeholder:text-[var(--muted-deep)]"
          />
          {frequency === "monthly" && (
            <span className="shrink-0 text-sm text-[var(--muted)]">/ month</span>
          )}
        </div>
      </label>

      {/* Submit */}
      <button
        type="button"
        onClick={donate}
        disabled={!ready}
        className="btn-gold mt-5 flex w-full items-center justify-center rounded-full px-6 py-4 text-base disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Opening secure checkout…" : cta}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-[#e6a45c]">
          {error}
        </p>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[var(--muted-deep)]">
        <LockGlyph />
        Secure checkout powered by Stripe
      </p>
    </div>
  );
}

function LockGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
