import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import { env } from "../../config/env.js";
import { User } from "../../domain/entities/user.js";
import { Session } from "../../domain/entities/session.js";
import { RefreshToken } from "../../domain/entities/refresh-token.js";

export class TokenService {
  /**
   * Generate a unique JWT ID (JTI)
   */
  static generateJti(): string {
    return randomUUID();
  }

  /**
   * Create an access token with JTI
   */
  static createAccessToken(user: User, jti: string): string {
    const payload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      jti: jti,
      displayName: user.displayName,
      isEmailVerified: user.isEmailVerified
    };

    const secret = env.JWT_ACCESS_SECRET || "fallback-secret-for-development";
    const expiresIn = env.JWT_ACCESS_EXPIRES_IN || "15m";

    const options = {
      issuer: "codeguard-ai",
      ...(expiresIn && { expiresIn: expiresIn as unknown as jwt.SignOptions['expiresIn'] })
    } as jwt.SignOptions;

    return jwt.sign(payload, secret, options);
  }

  /**
   * Create a refresh token (JWT that will be hashed before storage)
   */
  static async createRefreshToken(userId: string, jti: string): Promise<string> {
    // Create a JWT containing userId and jti for the refresh token
    const payload = {
      sub: userId,
      jti: jti,
      // Add timestamp to prevent replay attacks (optional, since we hash and store)
      iat: Math.floor(Date.now() / 1000)
    };

    const secret = env.JWT_REFRESH_SECRET || "fallback-refresh-secret-for-development";
    const expiresIn = env.JWT_REFRESH_EXPIRES_IN || "7d";

    const options = {
      issuer: "codeguard-ai",
      ...(expiresIn && { expiresIn: expiresIn as unknown as jwt.SignOptions['expiresIn'] })
    } as jwt.SignOptions;

    return jwt.sign(payload, secret, options);
  }

  /**
   * Hash a refresh token for storage
   */
  static async hashRefreshToken(token: string): Promise<string> {
    const saltRounds = 12;
    return bcrypt.hash(token, saltRounds);
  }

  /**
   * Verify an access token and extract its payload
   */
  static verifyAccessToken(token: string): any {
    const secret = env.JWT_ACCESS_SECRET || "fallback-secret-for-development";
    return jwt.verify(token, secret);
  }

  /**
   * Create a session entity from user and access token JTI
   */
  static createSessionFromAccessToken(user: User, accessToken: string, refreshTokenHash?: string, ipAddress?: string, userAgent?: string): Session {
    // Decode the access token to get the JTI
    const decoded = jwt.decode(accessToken) as { jti?: string };
    if (!decoded?.jti) {
      throw new Error('Invalid access token: missing JTI');
    }

    // Calculate expiration from token (or use default)
    const accessTokenExpiresIn = env.JWT_ACCESS_EXPIRES_IN ?? "15m";
    const expiresInMs = this.parseTimeString(accessTokenExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInMs);

    return new Session({
      userId: user.id,
      jti: decoded.jti,
      expiresAt: expiresAt,
      refreshTokenHash: refreshTokenHash,
      ipAddress: ipAddress,
      userAgent: userAgent
    });
  }

  /**
   * Create a refresh token entity from plain token and associated data
   */
  static async createRefreshTokenEntity(
    plainToken: string,
    userId: string,
    jti: string,
    userAgent?: string,
    ipAddress?: string
  ): Promise<RefreshToken> {
    // Hash the refresh token for storage
    const tokenHash = await this.hashRefreshToken(plainToken);

    // Create hashes for user agent and IP (for security)
    const userAgentHash = userAgent ? createHash('sha256').update(userAgent).digest('hex') : undefined;
    const ipHash = ipAddress ? createHash('sha256').update(ipAddress).digest('hex') : undefined;

    // Calculate expiration from config
    const refreshTokenExpiresIn = env.JWT_REFRESH_EXPIRES_IN ?? "7d";
    const expiresInMs = this.parseTimeString(refreshTokenExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInMs);

    return new RefreshToken({
      userId: userId,
      tokenHash: tokenHash,
      jti: jti,
      userAgentHash: userAgentHash,
      ipHash: ipHash,
      expiresAt: expiresAt
    });
  }

  /**
   * Create a session entity from user and tokens (legacy method - kept for compatibility)
   */
  static createSession(user: User, accessToken: string, refreshToken: string, ipAddress?: string, userAgent?: string): Session {
    // Decode the access token to get the JTI
    const decoded = jwt.decode(accessToken) as { jti?: string };
    if (!decoded?.jti) {
      throw new Error('Invalid access token: missing JTI');
    }

    // Calculate expiration from token (or use default)
    const accessTokenExpiresIn = env.JWT_ACCESS_EXPIRES_IN ?? "15m";
    const expiresInMs = this.parseTimeString(accessTokenExpiresIn);
    const expiresAt = new Date(Date.now() + expiresInMs);

    return new Session({
      userId: user.id,
      jti: decoded.jti,
      expiresAt: expiresAt,
      ipAddress: ipAddress,
      userAgent: userAgent
    });
  }

  /**
   * Parse time string like "15m", "7d", "24h" to milliseconds
   */
  private static parseTimeString(timeStr: string): number {
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