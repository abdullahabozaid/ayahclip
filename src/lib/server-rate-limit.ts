export interface RateLimitPolicy {
  namespace: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, Bucket>();

// How many trusted reverse-proxy hops sit in front of the app. Caddy APPENDS the
// real peer IP to the RIGHT of any client-supplied X-Forwarded-For, so the
// trustworthy client entry is counted from the right (default: the last entry).
const TRUSTED_PROXY_HOPS = Math.max(0, Number(process.env.AYAHCLIP_TRUSTED_PROXY_HOPS ?? "1") || 0);

function clientAddress(request: Request): string {
  // Take the client from the RIGHT, past the trusted hops. Taking the leftmost
  // value (the old behavior) let a client prefix junk and mint unlimited buckets,
  // bypassing every limit. With 1 hop: `[junk, real-ip]` → real-ip (append), and a
  // bare `[real-ip]` (overwrite) → real-ip. No header → "local" (dev, one bucket).
  const chain = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fromRight = chain.length - TRUSTED_PROXY_HOPS;
  return (chain[fromRight >= 0 ? fromRight : 0] ?? "local").slice(0, 80) || "local";
}

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
}

/**
 * Bounded warm-instance limiter. This prevents accidental loops and small
 * bursts from consuming paid APIs, while the VPS reverse-proxy/firewall layer
 * remains the authoritative distributed control for launch traffic.
 */
export function checkRateLimit(
  request: Request,
  policy: RateLimitPolicy,
  now = Date.now()
): RateLimitResult {
  if (
    !policy.namespace ||
    !Number.isInteger(policy.limit) ||
    policy.limit < 1 ||
    !Number.isFinite(policy.windowMs) ||
    policy.windowMs < 1
  ) {
    throw new Error("Invalid rate-limit policy");
  }

  const key = `${policy.namespace}:${clientAddress(request)}`;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (!bucket && buckets.size >= MAX_BUCKETS) prune(now);
    bucket = { count: 0, resetAt: now + policy.windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, policy.limit - bucket.count);
  return {
    allowed: bucket.count <= policy.limit,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "cache-control": "no-store",
    "retry-after": String(result.retryAfterSeconds),
    "x-ratelimit-remaining": String(result.remaining),
  };
}

/**
 * Stable bucket key for a client + policy, for callers that must release a
 * slot later from a different request (e.g. a background job's failure path).
 */
export function rateLimitClientKey(request: Request, policy: RateLimitPolicy): string {
  return `${policy.namespace}:${clientAddress(request)}`;
}

/** Release a reserved slot when the protected operation fails before success. */
export function releaseRateLimit(request: Request, policy: RateLimitPolicy): void {
  releaseRateLimitByKey(rateLimitClientKey(request, policy));
}

/** Key-based variant of {@link releaseRateLimit}. */
export function releaseRateLimitByKey(key: string): void {
  const bucket = buckets.get(key);
  if (!bucket) return;
  bucket.count = Math.max(0, bucket.count - 1);
  if (bucket.count === 0) buckets.delete(key);
}

/** Test-only reset so suites do not share warm-instance state. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
