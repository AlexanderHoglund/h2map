/** Non-retryable upstream failure (4xx other than 429). */
class FatalHttpError extends Error {}

/**
 * JSON GET with retry/backoff for the resource-data providers (free tiers
 * with fair-use limits). 30 s per-attempt timeout; retries on network errors,
 * 429 and 5xx.
 */
export async function fetchJsonWithRetry(
  url: string,
  attempts = 3,
): Promise<unknown> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
        cache: "no-store",
      });
      if (!res.ok) {
        const message = `HTTP ${res.status} ${res.statusText} for ${url}`;
        if (res.status !== 429 && res.status < 500) {
          throw new FatalHttpError(message);
        }
        throw new Error(message);
      }
      return await res.json();
    } catch (err) {
      if (err instanceof FatalHttpError) throw err;
      lastError = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
  }
  throw lastError;
}
