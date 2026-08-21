export interface AuditLog {
  id: string;
  actorUserId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: string | null;
  createdAt?: Date;
}