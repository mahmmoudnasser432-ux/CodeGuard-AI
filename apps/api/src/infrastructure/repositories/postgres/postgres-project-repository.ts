import pg from "pg";
import { Project } from "../../../domain/entities/project.js";
import { ProjectRepository } from "../../../domain/repositories/project-repository.js";

export class PostgresProjectRepository implements ProjectRepository {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgreSQL pool is required");
    }

    this.pool = pool;
  }

  async save(project: Project): Promise<Project> {
    const createdAt = project.createdAt ?? new Date();
    const updatedAt = project.updatedAt ?? new Date();

    await this.pool.query(
      `
      INSERT INTO "Projects" ("Id", "OwnerUserId", "Name", "Description", "CreatedAt", "UpdatedAt")
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT ("Id") DO UPDATE SET
        "OwnerUserId" = EXCLUDED."OwnerUserId",
        "Name" = EXCLUDED."Name",
        "Description" = EXCLUDED."Description",
        "UpdatedAt" = EXCLUDED."UpdatedAt"
      `,
      [
        project.id,
        project.ownerUserId,
        project.name,
        project.description ?? null,
        createdAt,
        updatedAt
      ]
    );

    return project;
  }

  async findById(id: string): Promise<Project | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "OwnerUserId", "Name", "Description", "CreatedAt", "UpdatedAt"
      FROM "Projects"
      WHERE "Id" = $1
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      ownerUserId: record.OwnerUserId,
      name: record.Name,
      description: record.Description ?? undefined,
      createdAt: record.CreatedAt,
      updatedAt: record.UpdatedAt
    };
  }

  async listByOwner(ownerUserId: string): Promise<Project[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "OwnerUserId", "Name", "Description", "CreatedAt", "UpdatedAt"
      FROM "Projects"
      WHERE "OwnerUserId" = $1
      ORDER BY "CreatedAt" DESC
      `,
      [ownerUserId]
    );

    return result.rows.map((record) => ({
      id: record.Id,
      ownerUserId: record.OwnerUserId,
      name: record.Name,
      description: record.Description ?? undefined,
      createdAt: record.CreatedAt,
      updatedAt: record.UpdatedAt
    }));
  }
}
