import { v4 as uuidv4 } from 'uuid';
import bcrypt from "bcryptjs";

export class RefreshToken {
  public id: string;
  public userId: string;
  public tokenHash: string; // bcrypt hash of the refresh token
  public jti: string; // JWT ID of the associated access token
  public userAgentHash?: string; // SHA-256 hash of user agent
  public ipHash?: string; // SHA-256 hash of IP address
  public expiresAt: Date;
  public createdAt: Date;
  public revokedAt?: Date;

  constructor(props: {
    id?: string;
    userId: string;
    tokenHash: string;
    jti: string;
    userAgentHash?: string;
    ipHash?: string;
    expiresAt: Date;
    createdAt?: Date;
    revokedAt?: Date;
  }) {
    this.id = props.id ?? uuidv4();
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.jti = props.jti;
    this.userAgentHash = props.userAgentHash;
    this.ipHash = props.ipHash;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt ?? new Date();
    this.revokedAt = props.revokedAt;
  }

  /**
   * Check if refresh token is valid (not expired and not revoked)
   */
  isValid(): boolean {
    const now = new Date();
    return !this.revokedAt && this.expiresAt > now;
  }

  /**
   * Check if refresh token is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if refresh token is revoked
   */
  isRevoked(): boolean {
    return !!this.revokedAt;
  }

  /**
   * Revoke the refresh token
   */
  revoke(): void {
    this.revokedAt = new Date();
  }

  /**
   * Compare a plain token with the stored hash
   */
  async compareToken(plainToken: string): Promise<boolean> {
    return bcrypt.compare(plainToken, this.tokenHash);
  }
}