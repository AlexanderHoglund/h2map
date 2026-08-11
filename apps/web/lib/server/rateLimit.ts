/**
 * In-memory token-bucket rate limiter, keyed by client IP. Per-instance only
 * (resets on redeploy, not shared across serverless instances) — good enough
 * for polite fair-use enforcement in front of the free upstream providers;
 * swap for a shared store if the app ever scales horizontally.
 */

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_IPS = 10_000;

export interface RateLimitPolicy {
  /** Bucket capacity (burst size). */
  capacity: number;
  /** Tokens refilled per minute (sustained rate). */
  refillPerMinute: number;
}

/**
 * Test relaxation: the e2e suite drives many parallel workers through ONE
 * localhost IP and sits right at the general bucket's edge, turning real
 * UX flows into intermittent 429s. RATE_LIMIT_SCALE (a plain multiplier,
 * set only by the Playwright web server) widens the buckets; production
 * never sets it, so deployed limits are unchanged.
 */
const SCALE = Math.max(1, Number(process.env.RATE_LIMIT_SCALE) || 1);

/** Expensive: may trigger ~10–20 upstream provider calls on a cache miss. */
export const PROFILE_POLICY: RateLimitPolicy = { capacity: 10, refillPerMinute: 6 };
/** Cheap-to-moderate endpoints. */
export const GENERAL_POLICY: RateLimitPolicy = {
  capacity: 30 * SCALE,
  refillPerMinute: 30 * SCALE,
};

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "local";
}

export function checkRateLimit(
  key: string,
  policy: RateLimitPolicy,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_TRACKED_IPS) buckets.clear();
    bucket = { tokens: policy.capacity, lastRefillMs: now };
    buckets.set(key, bucket);
  }
  const refill = ((now - bucket.lastRefillMs) / 60_000) * policy.refillPerMinute;
  bucket.tokens = Math.min(policy.capacity, bucket.tokens + refill);
  bucket.lastRefillMs = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
  const deficit = 1 - bucket.tokens;
  return {
    allowed: false,
    retryAfterSeconds: Math.ceil((deficit / policy.refillPerMinute) * 60),
  };
}
