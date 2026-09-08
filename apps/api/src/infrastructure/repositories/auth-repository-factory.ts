import pg from "pg";
import { UserRepository } from "../../domain/repositories/user-repository.js";
import { SessionRepository } from "../../domain/repositories/session-repository.js";
import { RefreshTokenRepository } from "../../domain/repositories/refresh-token-repository.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/password-reset-token-repository.js";
import { EmailVerificationTokenRepository } from "../../domain/repositories/email-verification-token-repository.js";
import { SqlUserRepository } from "./sql-user-repository.js";
import { SqlSessionRepository } from "./sql-session-repository.js";
import { SqlRefreshTokenRepository } from "./sql-refresh-token-repository.js";
import { SqlPasswordResetTokenRepository } from "./sql-password-reset-token-repository.js";
import { SqlEmailVerificationTokenRepository } from "./sql-email-verification-token-repository.js";
import {
  PostgresUserRepository,
  PostgresSessionRepository,
  PostgresRefreshTokenRepository,
  PostgresPasswordResetTokenRepository,
  PostgresEmailVerificationTokenRepository,
} from "./postgres/index.js";

export interface AuthRepositories {
  userRepository: UserRepository;
  sessionRepository: SessionRepository;
  refreshTokenRepository: RefreshTokenRepository;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
}

/**
 * Creates authentication repositories based on the specified dialect.
 *
 * PostgreSQL requirements:
 * - When dialect is "postgres", a single shared pg.Pool instance MUST be explicitly provided.
 * - Silent or independent pool creation is strictly prohibited to prevent connection pool exhaustion.
 * - All five repositories share the exact same pool instance.
 */
export function createAuthRepositories(
  dialect: "sqlserver" | "postgres" = "sqlserver",
  postgresPool?: pg.Pool
): AuthRepositories {
  if (dialect === "postgres") {
    if (!postgresPool) {
      throw new Error(
        "A shared pg.Pool instance is required when creating PostgreSQL auth repositories. " +
        "Expected an infrastructure-managed pool to prevent uncoordinated connection pools."
      );
    }
    return {
      userRepository: new PostgresUserRepository(postgresPool),
      sessionRepository: new PostgresSessionRepository(postgresPool),
      refreshTokenRepository: new PostgresRefreshTokenRepository(postgresPool),
      passwordResetTokenRepository: new PostgresPasswordResetTokenRepository(postgresPool),
      emailVerificationTokenRepository: new PostgresEmailVerificationTokenRepository(postgresPool),
    };
  }

  if (dialect === "sqlserver") {
    return {
      userRepository: new SqlUserRepository(),
      sessionRepository: new SqlSessionRepository(),
      refreshTokenRepository: new SqlRefreshTokenRepository(),
      passwordResetTokenRepository: new SqlPasswordResetTokenRepository(),
      emailVerificationTokenRepository: new SqlEmailVerificationTokenRepository(),
    };
  }

  throw new Error(`Unsupported database dialect: "${String(dialect)}"`);
}
