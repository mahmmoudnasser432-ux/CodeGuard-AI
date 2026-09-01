/**
 * Parses raw Cookie header string into a key-value dictionary.
 * Handles URL decoding and malformed cookie components safely.
 */
export function parseCookiesFromHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== "string") return {};
  const cookies: Record<string, string> = {};
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx !== -1) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (!key) continue;
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}
