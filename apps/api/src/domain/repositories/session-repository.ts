import { Session } from "../entities/session.js";

export interface SessionRepository {
  /**
   * Create a new session
   */
  create(session: Session): Promise<Session>;

  /**
   * Find a session by its ID
   */
  findById(id: string): Promise<Session | null>;

  /**
   * Find a session by its JWT ID (jti)
   */
  findByJti(jti: string): Promise<Session | null>;

  /**
   * Find all active sessions for a user
   */
  findByUserId(userId: string): Promise<Session[]>;

  /**
   * Update a session (e.g., to revoke it)
   */
  update(session: Session): Promise<void>;

  /**
   * Delete a session by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Delete all sessions for a user (e.g., on logout everywhere)
   */
  deleteByUserId(userId: string): Promise<void>;

  /**
   * Clean up expired sessions
   */
  cleanupExpired(): Promise<void>;
}