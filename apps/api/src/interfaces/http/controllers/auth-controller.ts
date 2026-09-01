import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AuthService, DUMMY_BCRYPT_HASH } from "../../../application/services/auth-service.js";
import type { User, UserRole } from "../../../domain/entities/user.js";
import type { UserRepository } from "../../../domain/repositories/user-repository.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorization.js";
import { randomUUID } from "crypto";
import { EmailService } from "../../../application/services/email-service.js";
import { env } from "../../../config/env.js";
import { generateCsrfToken, getCsrfCookieOptions, csrfProtection } from "../middleware/csrf.js";
import { parseCookiesFromHeader } from "../utils/cookies.js";

export { parseCookiesFromHeader };

import type { CookieOptions } from "express";

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const resetPasswordRequestSchema = z.object({
  email: z.string().email()
});

const resetPasswordValidateSchema = z.object({
  token: z.string(),
  password: z.string().min(8)
});

export function getRefreshCookieOptions(customEnv = env): CookieOptions {
  return {
    httpOnly: true,
    secure: customEnv.AUTH_COOKIE_SECURE,
    sameSite: customEnv.AUTH_COOKIE_SAME_SITE,
    path: customEnv.AUTH_COOKIE_PATH,
    domain: customEnv.AUTH_COOKIE_DOMAIN || undefined,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  };
}

export function getClearRefreshCookieOptions(customEnv = env): CookieOptions {
  return {
    httpOnly: true,
    secure: customEnv.AUTH_COOKIE_SECURE,
    sameSite: customEnv.AUTH_COOKIE_SAME_SITE,
    path: customEnv.AUTH_COOKIE_PATH,
    domain: customEnv.AUTH_COOKIE_DOMAIN || undefined,
  };
}

export function getRefreshTokenFromRequest(req: Request, cookieName = env.AUTH_COOKIE_NAME): string | undefined {
  if ((req as any).cookies && (req as any).cookies[cookieName]) {
    return (req as any).cookies[cookieName];
  }
  const rawCookieHeader = req.header("cookie");
  if (rawCookieHeader) {
    const parsed = parseCookiesFromHeader(rawCookieHeader);
    if (parsed[cookieName]) {
      return parsed[cookieName];
    }
  }
  if (req.body && typeof req.body.refreshToken === "string" && req.body.refreshToken.trim()) {
    return req.body.refreshToken.trim();
  }
  return undefined;
}

export function authController(
  authService: AuthService,
  userRepository: UserRepository
) {
  const router = Router();
  const emailService = new EmailService();

  // Get CSRF Token endpoint (for browser clients to obtain/refresh CSRF token)
  router.get("/csrf", (_req: Request, res: Response) => {
    const token = generateCsrfToken();
    res.cookie(env.CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
    res.json({ csrfToken: token });
  });

  // Register endpoint
  router.post("/register", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = registerSchema.parse(req.body);

      // Check if user already exists
      const existingUser = await userRepository.findByEmail(dto.email);
      if (existingUser) {
        res.status(409).json({ error: "USER_ALREADY_EXISTS" });
        return;
      }

      // Hash password
      const passwordHash = await authService.hashPassword(dto.password);

      // Create user entity according to User interface
      const userData = {
        id: randomUUID(), // Generate a UUID
        email: dto.email,
        displayName: dto.displayName || dto.email.split('@')[0], // Use part of email as display name
        roles: ["developer" as UserRole], // Default role - using first valid role from UserRole type
        isEmailVerified: false,
        mfaEnabled: false
      };

      // Save user
      const user = await userRepository.save(userData, passwordHash);

      // Create email verification token
      const verificationToken = await authService.createEmailVerificationToken(user.id);

      // Send verification email
      if (env.NODE_ENV !== "test") {
        await emailService.sendVerificationEmail(user.email, verificationToken);
      }

      // Issue CSRF cookie for subsequent authenticated browser requests
      const csrfToken = generateCsrfToken();
      res.cookie(env.CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

      res.status(201).json({
        message: "USER_CREATED_VERIFICATION_EMAIL_SENT",
        userId: user.id
      });
    } catch (err: any) {
      console.error('Registration error:', err);
      next(err);
    }
  });

  // Login endpoint
  router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = loginSchema.parse(req.body);

      const lockoutDurationMs = authService.parseTimeString(env.ACCOUNT_LOCKOUT_DURATION ?? "15m");
      const maxAttempts = env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5;

      // 1. Look up account by email, including login security state and password hash
      const authDetails = await userRepository.findAuthDetailsByEmail(dto.email);

      // 2. If account does not exist -> dummy verify and return generic 401 INVALID_CREDENTIALS
      if (!authDetails) {
        await authService.verifyPassword(dto.password, DUMMY_BCRYPT_HASH);
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      const { user, passwordHash, lockedUntil } = authDetails;

      // 3. If account exists and LockedUntil is in the future -> 403 ACCOUNT_LOCKED (do not run bcrypt)
      const now = Date.now();
      if (lockedUntil && lockedUntil.getTime() > now) {
        res.status(403).json({ error: "ACCOUNT_LOCKED" });
        return;
      }

      // 4. Verify the supplied password against the stored hash
      const isPasswordValid = passwordHash
        ? await authService.verifyPassword(dto.password, passwordHash)
        : false;

      // 5. If password is wrong -> atomically increment failed logins and return 401 INVALID_CREDENTIALS
      if (!isPasswordValid) {
        await userRepository.incrementFailedLogins(user.id, maxAttempts, lockoutDurationMs);
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      // 6. If password is correct -> reset failed-login state
      await userRepository.resetFailedLogins(user.id);

      // 7. Enforce existing email-verification check
      if (!user.isEmailVerified) {
        res.status(403).json({ error: "EMAIL_NOT_VERIFIED" });
        return;
      }

      // 8. Issue tokens with session
      const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || '';
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.issueTokensWithSession(user, ipAddress, userAgent);

      // Set HttpOnly refresh token cookie
      res.cookie(env.AUTH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());

      // Set JavaScript-accessible CSRF cookie for subsequent state-changing requests
      const csrfToken = generateCsrfToken();
      res.cookie(env.CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

      // Return access token and user info (refresh token is sent exclusively via HttpOnly cookie)
      res.json({
        accessToken: result.accessToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: user.roles
        }
      });
    } catch (err: any) {
      console.error('Login error:', err);
      next(err);
    }
  });

  // Refresh token endpoint
  router.post("/refresh", csrfProtection(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);

      if (!refreshToken) {
        res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });
        return;
      }

      // Extract IP address and user agent from request
      const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || '';
      const userAgent = req.get('User-Agent') || '';

      // Use authService to refresh token
      const result = await authService.refreshAccessToken(refreshToken, ipAddress, userAgent);

      // Rotate HttpOnly cookie
      res.cookie(env.AUTH_COOKIE_NAME, result.newRefreshToken, getRefreshCookieOptions());

      // Maintain/rotate CSRF cookie
      const csrfToken = generateCsrfToken();
      res.cookie(env.CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

      // Return new access token (refresh token rotated exclusively via HttpOnly cookie)
      res.json({
        accessToken: result.accessToken
      });
    } catch (err: any) {
      console.error('Refresh error:', err);
      if (
        err.message === 'Invalid or expired refresh token' ||
        err.message === 'Invalid refresh token' ||
        err.message === 'Invalid refresh token: missing JTI' ||
        err.message === 'Invalid refresh token signature' ||
        err.message?.toLowerCase().includes('refresh token')
      ) {
        res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
      } else if (err.message === 'Associated session not found or invalid') {
        res.status(401).json({ error: "INVALID_SESSION" });
      } else {
        res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
      }
    }
  });

  // Logout endpoint
  router.post("/logout", csrfProtection(), authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);

      if (!refreshToken) {
        res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });
        return;
      }

      // Use authService to logout
      await authService.logout(refreshToken);

      // Clear refresh cookie
      res.clearCookie(env.AUTH_COOKIE_NAME, getClearRefreshCookieOptions());

      res.status(204).send();
    } catch (err: any) {
      next(err);
    }
  });

  // Logout from all sessions endpoint
  router.post("/logout-all", csrfProtection(), authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user ID from req.user (set by authenticate middleware)
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }

      // Use authService to logout from all sessions
      await authService.logoutAllSessions(userId);

      // Clear refresh cookie
      res.clearCookie(env.AUTH_COOKIE_NAME, getClearRefreshCookieOptions());

      res.status(204).send();
    } catch (err: any) {
      next(err);
    }
  });

  // Request password reset endpoint (supports both /reset-password/request and /request-password-reset)
  const handlePasswordResetRequest = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = resetPasswordRequestSchema.parse(req.body);

      // Find user by email
      const user = await userRepository.findByEmail(dto.email);

      // Always return success to prevent email enumeration
      // But only create token if user actually exists
      if (user) {
        const resetToken = await authService.createPasswordResetToken(user.id);
        // Send password reset email
        if (env.NODE_ENV !== "test") { // Don't send emails during tests
          await emailService.sendPasswordResetEmail(user.email, resetToken);
        }
      }

      res.status(200).json({ message: "IF_USER_EXISTS_RESET_EMAIL_SENT" });
    } catch (err: any) {
      next(err);
    }
  };

  router.post("/reset-password/request", csrfProtection(), handlePasswordResetRequest);
  router.post("/request-password-reset", csrfProtection(), handlePasswordResetRequest);

  // Validate password reset token endpoint
  router.post("/reset-password/validate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = resetPasswordValidateSchema.parse(req.body);

      // Validate password reset token
      const tokenData = await authService.validatePasswordResetToken(dto.token);

      if (tokenData) {
        res.status(200).json({ valid: true, userId: tokenData.userId });
      } else {
        res.status(400).json({ valid: false, error: "INVALID_OR_EXPIRED_TOKEN" });
      }
    } catch (err: any) {
      next(err);
    }
  });

  // Confirm password reset endpoint (supports both /reset-password/confirm and /reset-password)
  const handlePasswordResetConfirm = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = resetPasswordValidateSchema.parse(req.body);

      // Validate password reset token
      const tokenData = await authService.validatePasswordResetToken(dto.token);
      if (!tokenData) {
        res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
        return;
      }

      // Hash new password
      const passwordHash = await authService.hashPassword(dto.password);

      // Update user's password
      const user = await userRepository.findById(tokenData.userId);
      if (!user) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }
      await userRepository.save({
        ...user,
        updatedAt: new Date()
      } as User, passwordHash);

      // Mark token as used
      await authService.usePasswordResetToken(tokenData.tokenId);

      res.status(200).json({ message: "PASSWORD_RESET_SUCCESSFUL" });
    } catch (err: any) {
      next(err);
    }
  };

  router.post("/reset-password/confirm", csrfProtection(), handlePasswordResetConfirm);
  router.post("/reset-password", csrfProtection(), handlePasswordResetConfirm);

  // Request email verification resend endpoint
  router.post("/resend-verification", csrfProtection(), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "EMAIL_REQUIRED" });
        return;
      }

      // Find user by email
      const user = await userRepository.findByEmail(email);

      if (user && user.isEmailVerified) {
        res.status(400).json({ error: "EMAIL_ALREADY_VERIFIED" });
        return;
      }

      // Always return success to prevent email enumeration
      // But only create token if user actually exists and is not verified
      if (user && !user.isEmailVerified) {
        const verificationToken = await authService.createEmailVerificationToken(user.id);
        // Send verification email
        if (env.NODE_ENV !== "test") { // Don't send emails during tests
          await emailService.sendVerificationEmail(user.email, verificationToken);
        }
      }

      res.status(200).json({ message: "IF_USER_EXISTS_VERIFICATION_EMAIL_SENT" });
    } catch (err: any) {
      next(err);
    }
  });

  // Verify email endpoint (token in URL)
  router.get("/verify-email/:token", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { token } = req.params;

      if (!token) {
        res.status(400).json({ error: "TOKEN_REQUIRED" });
        return;
      }

      // Validate email verification token
      const tokenData = await authService.validateEmailVerificationToken(token);
      if (!tokenData) {
        res.status(400).json({ error: "INVALID_OR_EXPIRED_TOKEN" });
        return;
      }

      // Mark user's email as verified
      const user = await userRepository.findById(tokenData.userId);
      if (!user) {
        res.status(404).json({ error: "USER_NOT_FOUND" });
        return;
      }
      await userRepository.save({
        ...user,
        isEmailVerified: true,
        updatedAt: new Date()
      } as User, null);

      // Mark token as used
      await authService.useEmailVerificationToken(tokenData.tokenId);

      // Return success (in a real app, this might redirect to a frontend page)
      res.status(200).json({ message: "EMAIL_VERIFIED_SUCCESSFULLY" });
    } catch (err: any) {
      next(err);
    }
  });

  // Get current user endpoint
  router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The authenticate middleware should have attached req.user
      // Return user info (excluding sensitive data)
      res.json({
        id: req.user!.sub,
        email: req.user!.email,
        displayName: req.user!.displayName,
        roles: req.user!.roles || [],
        isEmailVerified: req.user!.isEmailVerified || false
      });
    } catch (err: any) {
      next(err);
    }
  });

  return router;
}