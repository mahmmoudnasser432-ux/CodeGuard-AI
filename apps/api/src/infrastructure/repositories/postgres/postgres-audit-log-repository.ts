import pg from "pg";
import { AuditLog } from "../../../domain/entities/audit-log.js";
import { AuditLogRepository } from "../../../domain/repositories/audit-log-repository.js";

export class PostgresAuditLogRepository implements AuditLogRepository {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgreSQL pool is required");
    }

    this.pool = pool;
  }

  async save(auditLog: AuditLog): Promise<AuditLog> {
    const createdAt = auditLog.createdAt ?? new Date();

    await this.pool.query(
      `
      INSERT INTO "AuditLogs" ("Id", "ActorUserId", "EventType", "EntityType", "EntityId", "IpAddress", "UserAgent", "Metadata", "CreatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      [
        auditLog.id,
        auditLog.actorUserId ?? null,
        auditLog.eventType,
        auditLog.entityType ?? null,
        auditLog.entityId ?? null,
        auditLog.ipAddress ?? null,
        auditLog.userAgent ?? null,
        auditLog.metadata ?? null,
        createdAt,
      ]
    );

    return auditLog;
  }

  async listByActor(userId: string, limit = 100): Promise<AuditLog[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "ActorUserId", "EventType", "EntityType", "EntityId", "IpAddress", "UserAgent", "Metadata", "CreatedAt"
      FROM "AuditLogs"
      WHERE "ActorUserId" = $1
      ORDER BY "CreatedAt" DESC
      LIMIT $2;
      `,
      [userId, limit]
    );

    return result.rows.map((record) => ({
      id: record.Id,
      actorUserId: record.ActorUserId ?? undefined,
      eventType: record.EventType,
      entityType: record.EntityType ?? undefined,
      entityId: record.EntityId ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      metadata: record.Metadata ?? undefined,
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
    }));
  }

  async listByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "ActorUserId", "EventType", "EntityType", "EntityId", "IpAddress", "UserAgent", "Metadata", "CreatedAt"
      FROM "AuditLogs"
      WHERE "EntityType" = $1 AND "EntityId" = $2
      ORDER BY "CreatedAt" DESC;
      `,
      [entityType, entityId]
    );

    return result.rows.map((record) => ({
      id: record.Id,
      actorUserId: record.ActorUserId ?? undefined,
      eventType: record.EventType,
      entityType: record.EntityType ?? undefined,
      entityId: record.EntityId ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      metadata: record.Metadata ?? undefined,
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
    }));
  }

  async findById(id: string): Promise<AuditLog | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "ActorUserId", "EventType", "EntityType", "EntityId", "IpAddress", "UserAgent", "Metadata", "CreatedAt"
      FROM "AuditLogs"
      WHERE "Id" = $1;
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      actorUserId: record.ActorUserId ?? undefined,
      eventType: record.EventType,
      entityType: record.EntityType ?? undefined,
      entityId: record.EntityId ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      metadata: record.Metadata ?? undefined,
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
    };
  }
}
