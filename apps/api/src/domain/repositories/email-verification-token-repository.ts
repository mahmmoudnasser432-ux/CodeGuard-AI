import { EmailVerificationToken } from "../entities/email-verification-token.js";

export interface EmailVerificationTokenRepository {
  /**
   * Create a new email verification token
   */
  create(token: EmailVerificationToken): Promise<EmailVerificationToken>;

  /**
   * Find an email verification token by its ID
   */
  findById(id: string): Promise<EmailVerificationToken | null>;

  /**
   * Find an email verification token by user ID (most recent unused)
   */
  findByUserId(userId: string): Promise<EmailVerificationToken | null>;

  /**
   * Find an email verification token by token hash
   */
  findByTokenHash(tokenHash: string): Promise<EmailVerificationToken | null>;

  /**
   * Update an email verification token (e.g., to mark as used)
   */
  update(token: EmailVerificationToken): Promise<void>;

  /**
   * Delete an email verification token by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete used email verification tokens for a user
   */
  deleteUsedByUserId(userId: string): Promise<void>;

  /**
   * Clean up expired email verification tokens
   */
  cleanupExpired(): Promise<void>;
}