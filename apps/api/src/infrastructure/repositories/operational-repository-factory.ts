import pg from "pg";
import { InterviewRepository } from "../../domain/repositories/interview-repository.js";
import { NotificationRepository } from "../../domain/repositories/notification-repository.js";
import { AuditLogRepository } from "../../domain/repositories/audit-log-repository.js";
import { SqlInterviewRepository } from "./sql-interview-repository.js";
import { SqlNotificationRepository } from "./sql-notification-repository.js";
import { SqlAuditLogRepository } from "./sql-audit-log-repository.js";
import {
  PostgresInterviewRepository,
  PostgresNotificationRepository,
  PostgresAuditLogRepository,
} from "./postgres/index.js";

export interface OperationalRepositories {
  interviewRepository: InterviewRepository;
  notificationRepository: NotificationRepository;
  auditLogRepository: AuditLogRepository;
}

/**
 * Creates Interview, Notification, and AuditLog repositories based on the specified dialect.
 *
 * PostgreSQL requirements:
 * - When dialect is "postgres", a single shared pg.Pool instance MUST be explicitly provided.
 * - Silent or independent pool creation is strictly prohibited to prevent connection pool exhaustion.
 * - All repositories share the exact same pool instance.
 */
export function createOperationalRepositories(
  dialect: "sqlserver" | "postgres" = "sqlserver",
  postgresPool?: pg.Pool
): OperationalRepositories {
  if (dialect === "postgres") {
    if (!postgresPool) {
      throw new Error(
        "A shared pg.Pool instance is required when creating PostgreSQL operational repositories. " +
        "Expected an infrastructure-managed pool to prevent uncoordinated connection pools."
      );
    }
    return {
      interviewRepository: new PostgresInterviewRepository(postgresPool),
      notificationRepository: new PostgresNotificationRepository(postgresPool),
      auditLogRepository: new PostgresAuditLogRepository(postgresPool),
    };
  }

  if (dialect === "sqlserver") {
    return {
      interviewRepository: new SqlInterviewRepository(),
      notificationRepository: new SqlNotificationRepository(),
      auditLogRepository: new SqlAuditLogRepository(),
    };
  }

  throw new Error(`Unsupported database dialect: "${String(dialect)}"`);
}
