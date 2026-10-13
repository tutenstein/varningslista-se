export const DEFAULT_USER_AGENT = "VarningslistaSE/0.1 (+https://varningslista.se)";

export function userAgent(): string {
  return process.env.INGEST_USER_AGENT || DEFAULT_USER_AGENT;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(`HTTP ${status} for ${url}: ${body.slice(0, 200)}`);
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface FetchOptions {
  method?: "GET" | "POST";
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Total attempts including the first one. */
  attempts?: number;
}

/**
 * Fetch JSON with timeout and a small backoff. 4xx responses (except 429) are
 * not retried — retrying would only add load on the source.
 */
export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: {
          "User-Agent": userAgent(),
          Accept: "application/json",
          ...opts.headers,
        },
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
      });
      const text = await res.text();
      if (!res.ok) {
        const err = new HttpError(res.status, url, text);
        if (res.status !== 429 && res.status < 500) throw err;
        lastError = err;
      } else {
        return JSON.parse(text) as T;
      }
    } catch (err) {
      if (err instanceof HttpError && err.status !== 429 && err.status < 500) throw err;
      lastError = err;
    }
    if (attempt < attempts) await sleep(2_000 * 2 ** (attempt - 1));
  }
  throw lastError;
}
