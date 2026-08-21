import { AuditLog } from "../entities/audit-log.ts";

export interface AuditLogRepository {
  save(auditLog: AuditLog): Promise<AuditLog>;
  listByActor(userId: string, limit?: number): Promise<AuditLog[]>;
  listByEntity(entityType: string, entityId: string): Promise<AuditLog[]>;
}