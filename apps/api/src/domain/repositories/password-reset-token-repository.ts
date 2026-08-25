import { PasswordResetToken } from "../entities/password-reset-token.js";

export interface PasswordResetTokenRepository {
  /**
   * Create a new password reset token
   */
  create(token: PasswordResetToken): Promise<PasswordResetToken>;

  /**
   * Find a password reset token by its ID
   */
  findById(id: string): Promise<PasswordResetToken | null>;

  /**
   * Find a password reset token by user ID (most recent unused)
   */
  findByUserId(userId: string): Promise<PasswordResetToken | null>;

  /**
   * Find a password reset token by token hash
   */
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;

  /**
   * Update a password reset token (e.g., to mark as used)
   */
  update(token: PasswordResetToken): Promise<void>;

  /**
   * Delete a password reset token by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete used password reset tokens for a user
   */
  deleteUsedByUserId(userId: string): Promise<void>;

  /**
   * Clean up expired password reset tokens
   */
  cleanupExpired(): Promise<void>;
}