import { User } from "../entities/user.js";

export interface UserRepository {
  save(user: User, passwordHash?: string | null): Promise<User>;
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findByCredentials(email: string, password: string): Promise<User | null>;
  findByRole(role: string): Promise<User[]>;
}
