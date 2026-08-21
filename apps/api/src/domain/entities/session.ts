import { v4 as uuidv4 } from 'uuid';

export class Session {
  public id: string;
  public userId: string;
  public jti: string;
  public expiresAt: Date;
  public ipAddress?: string;
  public userAgent?: string;
  public createdAt: Date;
  public revokedAt?: Date;

  constructor(props: {
    id?: string;
    userId: string;
    jti: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
    createdAt?: Date;
    revokedAt?: Date;
  }) {
    this.id = props.id ?? uuidv4();
    this.userId = props.userId;
    this.jti = props.jti;
    this.expiresAt = props.expiresAt;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.createdAt = props.createdAt ?? new Date();
    this.revokedAt = props.revokedAt;
  }

  /**
   * Check if session is valid (not expired and not revoked)
   */
  isValid(): boolean {
    const now = new Date();
    return !this.revokedAt && this.expiresAt > now;
  }

  /**
   * Check if session is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if session is revoked
   */
  isRevoked(): boolean {
    return !!this.revokedAt;
  }

  /**
   * Revoke the session
   */
  revoke(): void {
    this.revokedAt = new Date();
  }
}