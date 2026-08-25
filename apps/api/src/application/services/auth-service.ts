import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
import type { User, UserRole } from "../../domain/entities/user.js";
import { TokenService } from "./token-service.js";
import type { Session } from "../../domain/entities/session.js";
import type { RefreshToken } from "../../domain/entities/refresh-token.js";
import { PasswordResetToken } from "../../domain/entities/password-reset-token.js";
import { EmailVerificationToken } from "../../domain/entities/email-verification-token.js";
import type { SessionRepository } from "../../domain/repositories/session-repository.js";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token-repository.js";
import type { PasswordResetTokenRepository } from "../../domain/repositories/password-reset-token-repository.js";
import type { EmailVerificationTokenRepository } from "../../domain/repositories/email-verification-token-repository.js";
import type { UserRepository } from "../../domain/repositories/user-repository.js";
import { EmailService } from "./email-service.js";
import jwt from "jsonwebtoken";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private sessionRepository: SessionRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private passwordResetTokenRepository: PasswordResetTokenRepository,
    private emailVerificationTokenRepository: EmailVerificationTokenRepository,
    private userRepository: UserRepository,
    private emailService: EmailService = new EmailService()
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async issueTokensWithSession(
    user: User,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string; session: Session; refreshTokenEntity: RefreshToken }> {
    // Generate JTI for access token
    const jti = TokenService.generateJti();

    // Create access token
    const accessToken = TokenService.createAccessToken(user, jti);

    // Create refresh token (JWT)
    const plainRefreshToken = await TokenService.createRefreshToken(user.id, jti);

    // Create session
    const session = TokenService.createSessionFromAccessToken(user, accessToken, await TokenService.hashRefreshToken(plainRefreshToken), ipAddress, userAgent);

    // Create refresh token entity
    const refreshTokenEntity = await TokenService.createRefreshTokenEntity(
      plainRefreshToken,
      user.id,
      jti,
      userAgent,
      ipAddress
    );

    // Save session and refresh token to database
    await this.sessionRepository.create(session);
    await this.refreshTokenRepository.create(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: plainRefreshToken, // Return the plain token to the client
      session,
      refreshTokenEntity
    };
  }

  async refreshAccessToken(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; newRefreshToken: string; session: Session; newRefreshTokenEntity: RefreshToken }> {
    // Decode the refresh token to get JTI (without verification)
    let decodedToken: any;
    try {
      decodedToken = jwt.decode(refreshToken);
      if (!decodedToken?.jti) {
        throw new Error('Invalid refresh token: missing JTI');
      }
    } catch (err) {
      console.log('Failed to decode refresh token:', err);
      throw new Error('Invalid refresh token');
    }

    // Find the refresh token by JTI
    const storedToken = await this.refreshTokenRepository.findByJti(decodedToken.jti);
    console.log('Refresh token lookup by JTI: storedToken=', storedToken ? { id: storedToken.id, userId: storedToken.userId, jti: storedToken.jti, expiresAt: storedToken.expiresAt, revokedAt: storedToken.revokedAt } : null);
    if (!storedToken || !storedToken.isValid()) {
      console.log('Stored token invalid or missing');
      throw new Error('Invalid or expired refresh token');
    }

    // Verify the refresh token JWT signature
    try {
      const secret = env.JWT_REFRESH_SECRET || "fallback-refresh-secret-for-development";
      jwt.verify(refreshToken, secret, { issuer: "codeguard-ai" });
    } catch (err) {
      console.log('Refresh token JWT verification failed:', err);
      throw new Error('Invalid refresh token signature');
    }

    // Verify the refresh token matches the stored hash
    const isTokenValid = await storedToken.compareToken(refreshToken);
    if (!isTokenValid) {
      console.log('Refresh token does not match stored hash');
      throw new Error('Invalid refresh token');
    }

    // Get the user ID from the refresh token
    const userId = storedToken.userId;

    // Find the associated session by JTI
    const session = await this.sessionRepository.findByJti(storedToken.jti);
    console.log('Session lookup: session=', session ? { id: session.id, userId: session.userId, jti: session.jti, expiresAt: session.expiresAt, revokedAt: session.revokedAt } : null);
    if (!session || !session.isValid()) {
      console.log('Session invalid or missing');
      throw new Error('Associated session not found or invalid');
    }

    // Generate new JTI for new access token
    const newJti = TokenService.generateJti();

    // Retrieve the full user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Create new access token
    const accessToken = TokenService.createAccessToken(user, newJti);

    // Create new refresh token (JWT)
    const newPlainRefreshToken = await TokenService.createRefreshToken(userId, newJti);

    // Create new refresh token entity
    const newRefreshTokenEntity = await TokenService.createRefreshTokenEntity(
      newPlainRefreshToken,
      userId,
      newJti,
      userAgent,
      ipAddress
    );

    // Update existing session with new JTI (granting new access token)
    session.jti = newJti;
    await this.sessionRepository.update(session);

    // Revoke old refresh token
    storedToken.revoke();
    await this.refreshTokenRepository.update(storedToken);

    // Save new refresh token
    await this.refreshTokenRepository.create(newRefreshTokenEntity);

    return {
      accessToken,
      newRefreshToken: newPlainRefreshToken, // Return new plain token to client
      session,
      newRefreshTokenEntity
    };
  }

  async logout(refreshToken: string): Promise<void> {
    // Decode the refresh token to get JTI (without verification)
    let decodedToken: any;
    try {
      decodedToken = jwt.decode(refreshToken);
      if (!decodedToken?.jti) {
        // Invalid token, nothing to revoke
        return;
      }
    } catch (err) {
      // Invalid token, nothing to revoke
      return;
    }

    // Find the refresh token by JTI
    const storedToken = await this.refreshTokenRepository.findByJti(decodedToken.jti);
    if (!storedToken) {
      return; // Token not found, nothing to revoke
    }

    // Verify the refresh token JWT signature
    try {
      const secret = env.JWT_REFRESH_SECRET || "fallback-refresh-secret-for-development";
      jwt.verify(refreshToken, secret, { issuer: "codeguard-ai" });
    } catch (err) {
      // Invalid signature, nothing to revoke
      return;
    }

    // Verify the refresh token matches the stored hash
    const isTokenValid = await storedToken.compareToken(refreshToken);
    if (!isTokenValid) {
      return; // Token does not match, nothing to revoke
    }

    // Revoke the refresh token
    storedToken.revoke();
    await this.refreshTokenRepository.update(storedToken);

    // Find and revoke the associated session
    const session = await this.sessionRepository.findByJti(storedToken.jti);
    if (session) {
      session.revoke();
      await this.sessionRepository.update(session);
    }
  }

  async logoutAllSessions(userId: string): Promise<void> {
    // Revoke all refresh tokens for user
    await this.refreshTokenRepository.deleteByUserId(userId);

    // Revoke all sessions for user
    await this.sessionRepository.deleteByUserId(userId);
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    // Generate a random token
    const buffer = require('crypto').randomBytes(32);
    const plainToken = buffer.toString('hex');

    // Hash the token for storage using SHA-256 (deterministic)
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(plainToken)
      .digest('hex');

    // Calculate expiration
    const expiresInMs = this.parseTimeString(env.PASSWORD_RESET_EXPIRES_IN ?? "1h");
    const expiresAt = new Date(Date.now() + expiresInMs);

    // Create password reset token entity
    const passwordResetToken = new PasswordResetToken({
      userId: userId,
      tokenHash: tokenHash,
      expiresAt: expiresAt
    });

    // Save to database
    await this.passwordResetTokenRepository.create(passwordResetToken);

    // Send password reset email
    if (env.NODE_ENV !== "test") { // Don't send emails during tests
      const user = await this.passwordResetTokenRepository.findById(passwordResetToken.id);
      if (user?.userId) {
        // We would need to get the user's email from the user repository
        // For now, we'll skip sending the email in this method and handle it in the controller
        // In a real implementation, we'd inject the user repository or have a way to get the email
      }
    }

    // Return plain token to be sent to user
    return plainToken;
  }

  async validatePasswordResetToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
    // Hash the incoming token to find it in database using SHA-256 (deterministic)
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find the password reset token by hash
    const storedToken = await this.passwordResetTokenRepository.findByTokenHash(tokenHash);
    if (!storedToken || !storedToken.isValid()) {
      return null; // Token not found, invalid, or used
    }

    return {
      userId: storedToken.userId,
      tokenId: storedToken.id
    };
  }

  async usePasswordResetToken(tokenId: string): Promise<void> {
    // Find the token by ID
    const storedToken = await this.passwordResetTokenRepository.findById(tokenId);
    if (!storedToken) {
      return; // Token not found
    }

    // Mark as used
    storedToken.markAsUsed();
    await this.passwordResetTokenRepository.update(storedToken);
  }

  async createEmailVerificationToken(userId: string): Promise<string> {
    // Generate a random token
    const buffer = require('crypto').randomBytes(32);
    const plainToken = buffer.toString('hex');

    // Hash the token for storage using SHA-256 (deterministic)
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(plainToken)
      .digest('hex');

    // Calculate expiration
    const expiresInMs = this.parseTimeString(env.EMAIL_VERIFICATION_EXPIRES_IN ?? "24h");
    const expiresAt = new Date(Date.now() + expiresInMs);

    // Create email verification token entity
    const emailVerificationToken = new EmailVerificationToken({
      userId: userId,
      tokenHash: tokenHash,
      expiresAt: expiresAt
    });

    // Save to database
    await this.emailVerificationTokenRepository.create(emailVerificationToken);

    // Send verification email
    if (env.NODE_ENV !== "test") { // Don't send emails during tests
      // We would need to get the user's email from the user repository
      // For now, we'll skip sending the email in this method and handle it in the controller
      // In a real implementation, we'd inject the user repository or have a way to get the email
    }

    // Return plain token to be sent to user
    return plainToken;
  }

  async validateEmailVerificationToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
    // Hash the incoming token to find it in database using SHA-256 (deterministic)
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find the email verification token by hash
    const storedToken = await this.emailVerificationTokenRepository.findByTokenHash(tokenHash);
    if (!storedToken || !storedToken.isValid()) {
      return null; // Token not found, invalid, or used
    }

    return {
      userId: storedToken.userId,
      tokenId: storedToken.id
    };
  }

  async useEmailVerificationToken(tokenId: string): Promise<void> {
    // Find the token by ID
    const storedToken = await this.emailVerificationTokenRepository.findById(tokenId);
    if (!storedToken) {
      return; // Token not found
    }

    // Mark as used
    storedToken.markAsUsed();
    await this.emailVerificationTokenRepository.update(storedToken);
  }

  canAccess(userRoles: UserRole[], allowedRoles: UserRole[]): boolean {
    return userRoles.some((role) => allowedRoles.includes(role));
  }

  /**
   * Parse time string like "15m", "7d", "24h" to milliseconds
   */
  private parseTimeString(timeStr: string): number {
    const num = parseInt(timeStr);
    const unit = timeStr.slice(-1);

    switch (unit) {
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      case 'd': return num * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unsupported time unit: ${unit}`);
    }
  }
}