import { User } from "../entities/user.js";

export interface UserAuthDetails {
  user: User;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export interface UserRepository {
  save(user: User, passwordHash?: string | null): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByCredentials(email: string, password: string): Promise<User | null>;
  findByRole(role: string): Promise<User[]>;
  findAuthDetailsByEmail(email: string): Promise<UserAuthDetails | null>;
  incrementFailedLogins(
    userId: string,
    maxAttempts: number,
    lockoutDurationMs: number
  ): Promise<{ failedLoginCount: number; lockedUntil: Date | null }>;
  resetFailedLogins(userId: string): Promise<void>;
}
