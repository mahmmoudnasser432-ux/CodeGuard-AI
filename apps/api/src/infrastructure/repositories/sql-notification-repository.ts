import { sqlPool } from "../database/sqlserver.js";
import { Notification } from "../../domain/entities/notification.js";
import { NotificationRepository } from "../../domain/repositories/notification-repository.js";

export class SqlNotificationRepository implements NotificationRepository {
  async save(notification: Notification): Promise<Notification> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', notification.id)
      .input('userId', notification.userId)
      .input('type', notification.type)
      .input('title', notification.title)
      .input('body', notification.body)
      .input('readAt', notification.readAt ?? null)
      .input('createdAt', notification.createdAt ?? new Date())
      .query(`
        MERGE dbo.Notifications AS target
        USING (SELECT @id as Id, @userId as UserId, @type as Type,
                  @title as Title, @body as Body, @readAt as ReadAt, @createdAt as CreatedAt) AS source
        ON target.Id = source.Id
        WHEN MATCHED THEN
          UPDATE SET
            UserId = source.UserId,
            Type = source.Type,
            Title = source.Title,
            Body = source.Body,
            ReadAt = source.ReadAt,
            CreatedAt = source.CreatedAt
        WHEN NOT MATCHED THEN
          INSERT INTO dbo.Notifications (Id, UserId, Type, Title, Body, ReadAt, CreatedAt)
          VALUES (source.Id, source.UserId, source.Type, source.Title,
                  source.Body, source.ReadAt, source.CreatedAt);
      `);

    return notification;
  }

  async findById(id: string): Promise<Notification | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, UserId, Type, Title, Body, ReadAt, CreatedAt
        FROM dbo.Notifications
        WHERE Id = @id
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return {
      id: record.Id,
      userId: record.UserId,
      type: record.Type,
      title: record.Title,
      body: record.Body,
      readAt: record.ReadAt ?? undefined,
      createdAt: record.CreatedAt
    };
  }

  async listByUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('userId', userId)
      .input('unreadOnly', unreadOnly ? 1 : 0)
      .query(`
        SELECT Id, UserId, Type, Title, Body, ReadAt, CreatedAt
        FROM dbo.Notifications
        WHERE UserId = @userId
          AND (@unreadOnly = 0 OR ReadAt IS NULL)
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => ({
      id: record.Id,
      userId: record.UserId,
      type: record.Type,
      title: record.Title,
      body: record.Body,
      readAt: record.ReadAt ?? undefined,
      createdAt: record.CreatedAt
    }));
  }

  async markAsRead(id: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', id)
      .query(`
        UPDATE dbo.Notifications
        SET ReadAt = SYSUTCDATETIME()
        WHERE Id = @id
      `);
  }
}