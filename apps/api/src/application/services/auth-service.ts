import bcrypt from "bcryptjs";
import { env } from "../../config/env.js";
import type { User, UserRole } from "../../domain/entities/user.js";
import { TokenService } from "./token-service.ts";
import type { Session } from "../../domain/entities/session.ts";
import type { RefreshToken } from "../../domain/entities/refresh-token.ts";
import { PasswordResetToken } from "../../domain/entities/password-reset-token.ts";
import { EmailVerificationToken } from "../../domain/entities/email-verification-token.ts";
import type { SessionRepository } from "../../domain/repositories/session-repository.ts";
import type { RefreshTokenRepository } from "../../domain/repositories/refresh-token-repository.ts";
import type { PasswordResetTokenRepository } from "../../domain/repositories/password-reset-token-repository.ts";
import type { EmailVerificationTokenRepository } from "../../domain/repositories/email-verification-token-repository.ts";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  constructor(
    private sessionRepository: SessionRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private passwordResetTokenRepository: PasswordResetTokenRepository,
    private emailVerificationTokenRepository: EmailVerificationTokenRepository
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

    // Create refresh token (plain)
    const plainRefreshToken = await TokenService.createRefreshToken();

    // Create session
    const session = TokenService.createSessionFromAccessToken(user, accessToken, ipAddress, userAgent);

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
    // Hash the incoming refresh token to find it in database
    const tokenHash = await bcrypt.hash(refreshToken, 12); // Same salt rounds as used in storage

    // Find the refresh token by hash
    const storedToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (!storedToken || !storedToken.isValid()) {
      throw new Error('Invalid or expired refresh token');
    }

    // Get the user ID from the refresh token
    const userId = storedToken.userId;

    // Find the associated session by JTI
    const session = await this.sessionRepository.findByJti(storedToken.jti);
    if (!session || !session.isValid()) {
      throw new Error('Associated session not found or invalid');
    }

    // Generate new JTI for new access token
    const newJti = TokenService.generateJti();

    // Create new access token
    const accessToken = TokenService.createAccessToken(
      { id: userId, email: '', roles: ['USER' as UserRole] } as User, // We don't have full user object here, but JWT only needs id for sub
      newJti
    );

    // Create new refresh token
    const newPlainRefreshToken = await TokenService.createRefreshToken();

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
    // Hash the incoming refresh token to find it in database
    const tokenHash = await bcrypt.hash(refreshToken, 12); // Same salt rounds as used in storage

    // Find the refresh token by hash
    const storedToken = await this.refreshTokenRepository.findByTokenHash(tokenHash);
    if (!storedToken) {
      return; // Token not found, nothing to revoke
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

    // Hash the token for storage
    const tokenHash = await bcrypt.hash(plainToken, 12);

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

    // Return plain token to be sent to user
    return plainToken;
  }

  async validatePasswordResetToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
    // Hash the incoming token to find it in database
    const tokenHash = await bcrypt.hash(token, 12); // Same salt rounds as used in storage

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

    // Hash the token for storage
    const tokenHash = await bcrypt.hash(plainToken, 12);

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

    // Return plain token to be sent to user
    return plainToken;
  }

  async validateEmailVerificationToken(token: string): Promise<{ userId: string; tokenId: string } | null> {
    // Hash the incoming token to find it in database
    const tokenHash = await bcrypt.hash(token, 12); // Same salt rounds as used in storage

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
