import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AuthService } from "../../../application/services/auth-service.js";
import type { User, UserRole } from "../../../domain/entities/user.js";
import type { UserRepository } from "../../../domain/repositories/user-repository.js";
import { authenticate } from "../middleware/auth.js";
import { authorizeRoles } from "../middleware/authorization.js";
import { randomUUID } from "crypto";
import { EmailService } from "../../../application/services/email-service.js";
import { env } from "../../../config/env.js";

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
  const emailService = new EmailService();

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
      if (env.NODE_ENV !== "test") { // Don't send emails during tests
        await emailService.sendVerificationEmail(user.email, verificationToken);
      }

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

      // Find user by email and verify password
      const user = await userRepository.findByCredentials(dto.email, dto.password);
      if (!user) {
        // Don't reveal whether user exists or password is invalid
        res.status(401).json({ error: "INVALID_CREDENTIALS" });
        return;
      }

      // TODO: Check if account is locked due to failed attempts
      // This would require tracking failed login attempts in the user entity or a separate table

      // Issue tokens with session
      // Extract IP address and user agent from request
      const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || '';
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
    } catch (err: any) {
      console.error('Login error:', err);
      next(err);
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
      const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || '';
      const userAgent = req.get('User-Agent') || '';

      // Use authService to refresh token
      const result = await authService.refreshAccessToken(refreshToken, ipAddress, userAgent);

      // Return new tokens
      res.json({
        accessToken: result.accessToken,
        refreshToken: result.newRefreshToken
      });
    } catch (err: any) {
      console.error('Refresh error:', err);
      if (err.message === 'Invalid or expired refresh token') {
        res.status(401).json({ error: "INVALID_REFRESH_TOKEN" });
      } else if (err.message === 'Associated session not found or invalid') {
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
      const ipAddress = req.ip || (req.connection && req.connection.remoteAddress) || '';
      const userAgent = req.get('User-Agent') || '';

      // Use authService to logout
      await authService.logout(refreshToken);

      res.status(204).send();
    } catch (err: any) {
      next(err);
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
    } catch (err: any) {
      next(err);
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
    } catch (err: any) {
      next(err);
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