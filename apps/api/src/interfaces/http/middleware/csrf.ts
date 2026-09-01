import { randomBytes, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { CookieOptions } from "express";
import { env } from "../../../config/env.js";
import { isAllowedOrigin } from "./security.js";
import { parseCookiesFromHeader } from "../utils/cookies.js";

/**
 * Generates a cryptographically secure, random 32-byte hexadecimal CSRF token.
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Cookie options for CSRF token.
 * Note: httpOnly is intentionally FALSE so that legitimate frontend client JavaScript
 * can read the token from document.cookie and attach it to the X-CSRF-Token header.
 */
export function getCsrfCookieOptions(customEnv = env): CookieOptions {
  return {
    httpOnly: false,
    secure: customEnv.AUTH_COOKIE_SECURE,
    sameSite: customEnv.AUTH_COOKIE_SAME_SITE,
    path: customEnv.CSRF_COOKIE_PATH,
    domain: customEnv.AUTH_COOKIE_DOMAIN || undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };
}

/**
 * Compares two token strings in constant time to prevent timing attacks.
 */
export function safeCompareTokens(a?: string, b?: string): boolean {
  if (!a || !b || typeof a !== "string" || typeof b !== "string") {
    return false;
  }
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Extracts origin from a URL string (e.g. Referer header).
 */
export function extractOriginFromUrl(urlStr?: string): string | undefined {
  if (!urlStr) return undefined;
  try {
    const parsed = new URL(urlStr);
    return parsed.origin;
  } catch {
    return undefined;
  }
}

/**
 * Robust CSRF Protection Middleware.
 * 
 * 1. Safe HTTP methods (GET, HEAD, OPTIONS) are exempt.
 * 2. Origin / Referer validation for state-changing requests.
 * 3. Double-Submit Cookie verification strictly enforced for ambient cookie-authenticated
 *    requests (e.g. refresh, logout) while exempting pure Bearer-authenticated API calls.
 * 4. Constant-time token comparison with generic error response.
 */
export function csrfProtection(options: { requireToken?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 1. Safe methods are exempt
    const method = req.method.toUpperCase();
    if (["GET", "HEAD", "OPTIONS"].includes(method)) {
      return next();
    }

    // 2. Origin / Referer validation
    const originHeader = req.header("origin");
    const refererHeader = req.header("referer");
    const effectiveOrigin = originHeader || extractOriginFromUrl(refererHeader);

    if (effectiveOrigin) {
      if (!isAllowedOrigin(effectiveOrigin, env)) {
        res.status(403).json({
          error: "CSRF_VALIDATION_FAILED",
          message: "Request origin is not allowed.",
        });
        return;
      }
    } else if (env.NODE_ENV === "production") {
      // In production, browser requests sending cookies must provide an allowed Origin or Referer
      const rawCookieHeader = req.header("cookie");
      if (rawCookieHeader && (rawCookieHeader.includes(env.AUTH_COOKIE_NAME) || rawCookieHeader.includes(env.CSRF_COOKIE_NAME))) {
        res.status(403).json({
          error: "CSRF_VALIDATION_FAILED",
          message: "Origin or Referer header is required for cookie-authenticated browser requests in production.",
        });
        return;
      }
    }

    // 3. Extract CSRF token from Cookie
    let cookieCsrfToken: string | undefined;
    if ((req as any).cookies && (req as any).cookies[env.CSRF_COOKIE_NAME]) {
      cookieCsrfToken = (req as any).cookies[env.CSRF_COOKIE_NAME];
    } else {
      const rawCookies = req.header("cookie");
      if (rawCookies) {
        const parsed = parseCookiesFromHeader(rawCookies);
        cookieCsrfToken = parsed[env.CSRF_COOKIE_NAME];
      }
    }

    // 4. Distinguish Cookie Authentication vs Explicit Bearer-Only Authentication
    const rawCookies = req.header("cookie") || "";
    const hasAuthCookie = Boolean(
      ((req as any).cookies && (req as any).cookies[env.AUTH_COOKIE_NAME]) ||
      rawCookies.includes(env.AUTH_COOKIE_NAME)
    );

    const authHeader = req.header("authorization");
    const hasBearerAuth = Boolean(authHeader && /^Bearer\s+\S+/i.test(authHeader));

    // Determine whether double-submit CSRF validation is required:
    // - Always required if options.requireToken is true
    // - Required if request relies on ambient auth/refresh cookie (e.g. /refresh, /logout)
    // - Required for browser mutation requests with CSRF cookie when NOT authenticating via Bearer token
    // - Exempt for machine / non-browser clients authenticating strictly via Authorization: Bearer with no auth cookie
    const isCookieAuth = hasAuthCookie;
    const requiresCsrfValidation = options.requireToken || isCookieAuth || (!hasBearerAuth && Boolean(cookieCsrfToken));

    if (requiresCsrfValidation) {
      const headerCsrfToken = req.header("X-CSRF-Token") || req.header("x-csrf-token");

      if (!cookieCsrfToken || !headerCsrfToken) {
        res.status(403).json({
          error: "CSRF_VALIDATION_FAILED",
          message: "CSRF token missing from cookie or request header.",
        });
        return;
      }

      if (!safeCompareTokens(cookieCsrfToken, headerCsrfToken)) {
        res.status(403).json({
          error: "CSRF_VALIDATION_FAILED",
          message: "CSRF token validation failed.",
        });
        return;
      }
    }

    next();
  };
}

