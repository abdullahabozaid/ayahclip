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

function clientAddress(request: Request): string {
  // Vercel overwrites X-Forwarded-For with the public client IP, preventing a
  // caller from choosing another bucket. Local development falls back to one
  // shared bucket because there is no trusted proxy header.
  return (request.headers.get("x-forwarded-for") ?? "local")
    .split(",")[0]
    .trim()
    .slice(0, 80) || "local";
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
 * bursts from consuming paid APIs, while Vercel WAF remains the authoritative
 * distributed control for launch traffic.
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

/** Test-only reset so suites do not share warm-instance state. */
export function resetRateLimitsForTests(): void {
  buckets.clear();
}
