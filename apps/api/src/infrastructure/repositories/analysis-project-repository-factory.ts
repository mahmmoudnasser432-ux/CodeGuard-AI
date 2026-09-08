import pg from "pg";
import { ProjectRepository } from "../../domain/repositories/project-repository.js";
import { AnalysisRepository } from "../../domain/repositories/analysis-repository.js";
import { ReportRepository } from "../../domain/repositories/report-repository.js";
import { SqlProjectRepository } from "./sql-project-repository.js";
import { SqlAnalysisRepository } from "./sql-analysis-repository.js";
import { SqlReportRepository } from "./sql-report-repository.js";
import {
  PostgresProjectRepository,
  PostgresAnalysisRepository,
  PostgresReportRepository,
} from "./postgres/index.js";

export interface AnalysisProjectRepositories {
  projectRepository: ProjectRepository;
  analysisRepository: AnalysisRepository;
  reportRepository: ReportRepository;
}

/**
 * Creates Project, Analysis, and Report repositories based on the specified dialect.
 *
 * PostgreSQL requirements:
 * - When dialect is "postgres", a single shared pg.Pool instance MUST be explicitly provided.
 * - Silent or independent pool creation is strictly prohibited to prevent connection pool exhaustion.
 * - All repositories share the exact same pool instance.
 */
export function createAnalysisProjectRepositories(
  dialect: "sqlserver" | "postgres" = "sqlserver",
  postgresPool?: pg.Pool
): AnalysisProjectRepositories {
  if (dialect === "postgres") {
    if (!postgresPool) {
      throw new Error(
        "A shared pg.Pool instance is required when creating PostgreSQL analysis and project repositories. " +
        "Expected an infrastructure-managed pool to prevent uncoordinated connection pools."
      );
    }
    return {
      projectRepository: new PostgresProjectRepository(postgresPool),
      analysisRepository: new PostgresAnalysisRepository(postgresPool),
      reportRepository: new PostgresReportRepository(postgresPool),
    };
  }

  if (dialect === "sqlserver") {
    return {
      projectRepository: new SqlProjectRepository(),
      analysisRepository: new SqlAnalysisRepository(),
      reportRepository: new SqlReportRepository(),
    };
  }

  throw new Error(`Unsupported database dialect: "${String(dialect)}"`);
}
