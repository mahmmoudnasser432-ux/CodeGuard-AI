import { sqlPool } from "../database/sqlserver.js";
import { Project } from "../../domain/entities/project.js";
import { ProjectRepository } from "../../domain/repositories/project-repository.js";

export class SqlProjectRepository implements ProjectRepository {
  async save(project: Project): Promise<Project> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', project.id)
      .input('ownerUserId', project.ownerUserId)
      .input('name', project.name)
      .input('description', project.description ?? null)
      .input('createdAt', project.createdAt ?? new Date())
      .input('updatedAt', project.updatedAt ?? new Date())
      .query(`
        MERGE dbo.Projects AS target
        USING (SELECT @id as Id, @ownerUserId as OwnerUserId, @name as Name,
                  @description as Description, @createdAt as CreatedAt, @updatedAt as UpdatedAt) AS source
        ON target.Id = source.Id
        WHEN MATCHED THEN
          UPDATE SET
            OwnerUserId = source.OwnerUserId,
            Name = source.Name,
            Description = source.Description,
            UpdatedAt = source.UpdatedAt
        WHEN NOT MATCHED THEN
          INSERT INTO dbo.Projects (Id, OwnerUserId, Name, Description, CreatedAt, UpdatedAt) VALUES (source.Id, source.OwnerUserId, source.Name, source.Description, source.CreatedAt, source.UpdatedAt);
      `);

    return project;
  }

  async findById(id: string): Promise<Project | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, OwnerUserId, Name, Description, CreatedAt, UpdatedAt
        FROM dbo.Projects
        WHERE Id = @id
      `);

    const record = result.recordset[0];
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
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('ownerUserId', ownerUserId)
      .query(`
        SELECT Id, OwnerUserId, Name, Description, CreatedAt, UpdatedAt
        FROM dbo.Projects
        WHERE OwnerUserId = @ownerUserId
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => ({
      id: record.Id,
      ownerUserId: record.OwnerUserId,
      name: record.Name,
      description: record.Description ?? undefined,
      createdAt: record.CreatedAt,
      updatedAt: record.UpdatedAt
    }));
  }
}