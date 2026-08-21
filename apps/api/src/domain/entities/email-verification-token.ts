import { v4 as uuidv4 } from 'uuid';

export class EmailVerificationToken {
  public id: string;
  public userId: string;
  public tokenHash: string;
  public expiresAt: Date;
  public createdAt: Date;
  public usedAt?: Date;

  constructor(props: {
    id?: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    createdAt?: Date;
    usedAt?: Date;
  }) {
    this.id = props.id ?? uuidv4();
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt ?? new Date();
    this.usedAt = props.usedAt;
  }

  /**
   * Check if token is valid (not expired and not used)
   */
  isValid(): boolean {
    const now = new Date();
    return !this.usedAt && this.expiresAt > now;
  }

  /**
   * Check if token is expired
   */
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if token has been used
   */
  isUsed(): boolean {
    return !!this.usedAt;
  }

  /**
   * Mark token as used
   */
  markAsUsed(): void {
    this.usedAt = new Date();
  }
}