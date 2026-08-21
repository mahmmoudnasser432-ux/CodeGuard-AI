import { User } from "../entities/user.ts";

export interface UserRepository {
  save(user: User, passwordHash?: string | null): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByRole(role: string): Promise<User[]>;
}
