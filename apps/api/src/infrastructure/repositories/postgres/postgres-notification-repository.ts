import pg from "pg";
import { Notification } from "../../../domain/entities/notification.js";
import { NotificationRepository } from "../../../domain/repositories/notification-repository.js";

export class PostgresNotificationRepository implements NotificationRepository {
  private readonly pool: pg.Pool;

  constructor(pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgreSQL pool is required");
    }

    this.pool = pool;
  }

  async save(notification: Notification): Promise<Notification> {
    const createdAt = notification.createdAt ?? new Date();

    await this.pool.query(
      `
      INSERT INTO "Notifications" ("Id", "UserId", "Type", "Title", "Body", "ReadAt", "CreatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT ("Id") DO UPDATE SET
        "UserId" = EXCLUDED."UserId",
        "Type" = EXCLUDED."Type",
        "Title" = EXCLUDED."Title",
        "Body" = EXCLUDED."Body",
        "ReadAt" = EXCLUDED."ReadAt",
        "CreatedAt" = EXCLUDED."CreatedAt";
      `,
      [
        notification.id,
        notification.userId,
        notification.type,
        notification.title,
        notification.body,
        notification.readAt ?? null,
        createdAt,
      ]
    );

    return notification;
  }

  async findById(id: string): Promise<Notification | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "Type", "Title", "Body", "ReadAt", "CreatedAt"
      FROM "Notifications"
      WHERE "Id" = $1;
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      userId: record.UserId,
      type: record.Type,
      title: record.Title,
      body: record.Body,
      readAt: record.ReadAt ? new Date(record.ReadAt) : undefined,
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
    };
  }

  async listByUser(userId: string, unreadOnly = false): Promise<Notification[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "Type", "Title", "Body", "ReadAt", "CreatedAt"
      FROM "Notifications"
      WHERE "UserId" = $1
        AND ($2 = FALSE OR "ReadAt" IS NULL)
      ORDER BY "CreatedAt" DESC;
      `,
      [userId, unreadOnly]
    );

    return result.rows.map((record) => ({
      id: record.Id,
      userId: record.UserId,
      type: record.Type,
      title: record.Title,
      body: record.Body,
      readAt: record.ReadAt ? new Date(record.ReadAt) : undefined,
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
    }));
  }

  async markAsRead(id: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE "Notifications"
      SET "ReadAt" = CURRENT_TIMESTAMP
      WHERE "Id" = $1;
      `,
      [id]
    );
  }
}
