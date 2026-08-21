import { sqlPool } from "../database/sqlserver.ts";
import { AuditLog } from "../../domain/entities/audit-log.ts";
import { AuditLogRepository } from "../../domain/repositories/audit-log-repository.ts";

export class SqlAuditLogRepository implements AuditLogRepository {
  async save(auditLog: AuditLog): Promise<AuditLog> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', auditLog.id)
      .input('actorUserId', auditLog.actorUserId ?? null)
      .input('eventType', auditLog.eventType)
      .input('entityType', auditLog.entityType ?? null)
      .input('entityId', auditLog.entityId ?? null)
      .input('ipAddress', auditLog.ipAddress ?? null)
      .input('userAgent', auditLog.userAgent ?? null)
      .input('metadata', auditLog.metadata ?? null)
      .input('createdAt', auditLog.createdAt ?? new Date())
      .query(`
        INSERT INTO dbo.AuditLogs (Id, ActorUserId, EventType, EntityType, EntityId,
                                   IpAddress, UserAgent, Metadata, CreatedAt)
        VALUES (@id, @actorUserId, @eventType, @entityType, @entityId,
                @ipAddress, @userAgent, @metadata, @createdAt);
      `);

    return auditLog;
  }

  async listByActor(userId: string, limit = 100): Promise<AuditLog[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('userId', userId)
      .input('limit', limit)
      .query(`
        SELECT TOP (@limit) Id, ActorUserId, EventType, EntityType, EntityId,
                   IpAddress, UserAgent, Metadata, CreatedAt
        FROM dbo.AuditLogs
        WHERE ActorUserId = @userId
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => ({
      id: record.Id,
      actorUserId: record.ActorUserId ?? undefined,
      eventType: record.EventType,
      entityType: record.EntityType ?? undefined,
      entityId: record.EntityId ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      metadata: record.Metadata ?? undefined,
      createdAt: record.CreatedAt
    }));
  }

  async listByEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('entityType', entityType)
      .input('entityId', entityId)
      .query(`
        SELECT Id, ActorUserId, EventType, EntityType, EntityId,
               IpAddress, UserAgent, Metadata, CreatedAt
        FROM dbo.AuditLogs
        WHERE EntityType = @entityType AND EntityId = @entityId
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => ({
      id: record.Id,
      actorUserId: record.ActorUserId ?? undefined,
      eventType: record.EventType,
      entityType: record.EntityType ?? undefined,
      entityId: record.EntityId ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      metadata: record.Metadata ?? undefined,
      createdAt: record.CreatedAt
    }));
  }

  async findById(id: string): Promise<AuditLog | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, ActorUserId, EventType, EntityType, EntityId,
               IpAddress, UserAgent, Metadata, CreatedAt
        FROM dbo.AuditLogs
        WHERE Id = @id
      `);

    const record = result.recordset[0];
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
      createdAt: record.CreatedAt
    };
  }
}