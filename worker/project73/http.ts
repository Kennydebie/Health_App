import type { ZodType } from 'zod';

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

/** Rejects cross-site state-changing requests. */
export function isSameSite(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin') return false;
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

const MAX_BODY = 512 * 1024;

export async function readBody<T>(request: Request, schema: ZodType<T>): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY) return { ok: false, response: json({ code: 'payload_too_large' }, 413) };
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return { ok: false, response: json({ code: 'payload_too_large' }, 413) };
    raw = text ? JSON.parse(text) : {};
  } catch {
    return { ok: false, response: json({ code: 'invalid_request' }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: json({ code: 'invalid_request', fields: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')) }, 400) };
  return { ok: true, value: parsed.data };
}

interface Window { count: number; resetAt: number }
const windows = new Map<string, Window>();

/** Simple per-isolate fixed-window rate limiter. */
export function rateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (current.count >= limit) return true;
  current.count += 1;
  return false;
}

export function resetRateLimits() {
  windows.clear();
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
