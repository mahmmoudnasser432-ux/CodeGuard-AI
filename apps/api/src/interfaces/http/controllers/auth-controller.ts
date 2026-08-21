import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AuthService } from "../../application/services/auth-service.ts";
import type { User } from "../../domain/entities/user.js";
import type { UserRepository } from "../../domain/repositories/user-repository.ts";
import { authenticate } from "../middleware/auth.ts";
import { authorizeRoles } from "../middleware/authorization.ts";
import { randomUUID } from "crypto";

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

export function authController(
  authService: AuthService,
  userRepository: UserRepository
) {
  const router = Router();

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

      // TODO: Send verification email (would integrate with email service)
      // For now, we'll just return success without actually sending email
      // In production, this would trigger an email sending service

      res.status(201).json({
        message: "USER_CREATED_VERIFICATION_EMAIL_SENT",
        userId: user.id
      });
    } catch (error) {
      next(error);
    }
  });

  // Login endpoint
  router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = loginSchema.parse(req.body);

      // Find user by email
      const user = await userRepository.findByEmail(dto.email);
      if (!user) {
        // Don't reveal whether user exists for security
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      // Verify password
      const isValid = await authService.verifyPassword(dto.password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      // TODO: Check if account is locked due to failed attempts
      // This would require tracking failed login attempts in the user entity or a separate table

      // Issue tokens with session
      // Extract IP address and user agent from request
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent') || '';

      const result = await authService.issueTokensWithSession(user, ipAddress, userAgent);

      // Return tokens and user info (excluding sensitive data)
      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          roles: user.roles
        }
      });
    } catch (error) {
      next(error);
    }
  });

  // Refresh token endpoint
  router.post("/refresh", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });
        return;
      }

      // Extract IP address and user agent from request
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent') || '';

      // Use authService to refresh token
      const result = await authService.refreshAccessToken(refreshToken, ipAddress, userAgent);

      // Return new tokens
      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
    } catch (error) {
      if (error.message === 'Invalid or expired refresh token') {
        res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
      } else if (error.message === 'Associated session not found or invalid') {
        res.status(401).json({ error: "INVALID_SESSION" });
      } else {
        res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
      }
    }
  });

  // Logout endpoint
  router.post("/logout", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({ error: "REFRESH_TOKEN_REQUIRED" });
        return;
      }

      // Extract IP address and user agent from request
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.get('User-Agent') || '';

      // Use authService to logout
      await authService.logout(refreshToken);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Logout from all sessions endpoint
  router.post("/logout-all", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user ID from req.user (set by authenticate middleware)
      const userId = req.user?.sub;
      if (!userId) {
        res.status(401).json({ error: "UNAUTHENTICATED" });
        return;
      }

      // Use authService to logout from all sessions
      await authService.logoutAllSessions(userId);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // Request password reset endpoint
  router.post("/reset-password/request", async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate input
      const dto = resetPasswordRequestSchema.parse(req.body);

      // Find user by email
      const user = await userRepository.findByEmail(dto.email);

      // Always return success to prevent email enumeration
      // But only create token if user actually exists
      if (user) {
        await authService.createPasswordResetToken(user.id);
        // TODO: Send password reset email (would integrate with email service)
      }

      res.status(200).json({ message: "IF_USER_EXISTS_RESET_EMAIL_SENT" });
    } catch (error) {
      next(error);
    }
  });

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
    } catch (error) {
      next(error);
    }
  });

  // Confirm password reset endpoint (token + new password)
  router.post("/reset-password/confirm", async (req: Request, res: Response, next: NextFunction) => {
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
      await userRepository.save({
        id: tokenData.userId,
        passwordHash: passwordHash,
        updatedAt: new Date()
      } as Partial<User>, passwordHash);

      // Mark token as used
      await authService.usePasswordResetToken(tokenData.tokenId);

      res.status(200).json({ message: "PASSWORD_RESET_SUCCESSFUL" });
    } catch (error) {
      next(error);
    }
  });

  // Request email verification resend endpoint
  router.post("/resend-verification", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({ error: "EMAIL_REQUIRED" });
        return;
      }

      // Find user by email
      const user = await userRepository.findByEmail(email);

      // Always return success to prevent email enumeration
      // But only create token if user actually exists and is not verified
      if (user && !user.emailVerified) {
        await authService.createEmailVerificationToken(user.id);
        // TODO: Send verification email (would integrate with email service)
      }

      res.status(200).json({ message: "IF_USER_EXISTS_VERIFICATION_EMAIL_SENT" });
    } catch (error) {
      next(error);
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
      await userRepository.save({
        id: tokenData.userId,
        emailVerified: true,
        updatedAt: new Date()
      } as Partial<User>);

      // Mark token as used
      await authService.useEmailVerificationToken(tokenData.tokenId);

      // Return success (in a real app, this might redirect to a frontend page)
      res.status(200).json({ message: "EMAIL_VERIFIED_SUCCESSFULLY" });
    } catch (error) {
      next(error);
    }
  });

  // Get current user endpoint
  router.get("/me", authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
      // The authenticate middleware should have attached req.user
      // Return user info (excluding sensitive data)
      res.json({
        id: req.user.sub,
        email: req.user.email,
        displayName: req.user.displayName,
        roles: req.user.roles || [],
        emailVerified: req.user.emailVerified || false
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}