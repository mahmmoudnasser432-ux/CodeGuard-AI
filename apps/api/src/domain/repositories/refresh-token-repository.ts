import { RefreshToken } from "../entities/refresh-token.js";

export interface RefreshTokenRepository {
  /**
   * Create a new refresh token
   */
  create(token: RefreshToken): Promise<RefreshToken>;

  /**
   * Find a refresh token by its ID
   */
  findById(id: string): Promise<RefreshToken | null>;

  /**
   * Find a refresh token by token hash
   */
  findByTokenHash(tokenHash: string): Promise<RefreshToken | null>;

  /**
   * Find refresh tokens by user ID
   */
  findByUserId(userId: string): Promise<RefreshToken[]>;

  /**
   * Find a refresh token by JTI (JWT ID)
   */
  findByJti(jti: string): Promise<RefreshToken | null>;

  /**
   * Update a refresh token (e.g., to revoke it)
   */
  update(token: RefreshToken): Promise<void>;

  /**
   * Delete a refresh token by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete refresh tokens by user ID
   */
  deleteByUserId(userId: string): Promise<void>;

  /**
   * Delete refresh tokens by JTI
   */
  deleteByJti(jti: string): Promise<void>;

  /**
   * Clean up expired refresh tokens
   */
  cleanupExpired(): Promise<void>;
}