import pg from "pg";
import { Session } from "../../../domain/entities/session.js";
import { SessionRepository } from "../../../domain/repositories/session-repository.js";

export class PostgresSessionRepository implements SessionRepository {
  constructor(private readonly pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgresSessionRepository requires an explicit, shared pg.Pool instance.");
    }
  }

  async create(session: Session): Promise<Session> {
    await this.pool.query(
      `
      INSERT INTO "Sessions" ("Id", "UserId", "Jti", "ExpiresAt", "RefreshTokenHash", "IpAddress", "UserAgent", "CreatedAt", "RevokedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      [
        session.id,
        session.userId,
        session.jti,
        session.expiresAt,
        session.refreshTokenHash ?? "",
        session.ipAddress ?? null,
        session.userAgent ?? null,
        session.createdAt,
        session.revokedAt ?? null,
      ]
    );

    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "Jti", "ExpiresAt", "RefreshTokenHash", "IpAddress", "UserAgent", "CreatedAt", "RevokedAt"
      FROM "Sessions"
      WHERE "Id" = $1;
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new Session({
      id: record.Id,
      userId: record.UserId,
      jti: record.Jti,
      expiresAt: new Date(record.ExpiresAt),
      refreshTokenHash: record.RefreshTokenHash ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      createdAt: new Date(record.CreatedAt),
      revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
    });
  }

  async findByJti(jti: string): Promise<Session | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "Jti", "ExpiresAt", "RefreshTokenHash", "IpAddress", "UserAgent", "CreatedAt", "RevokedAt"
      FROM "Sessions"
      WHERE "Jti" = $1;
      `,
      [jti]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new Session({
      id: record.Id,
      userId: record.UserId,
      jti: record.Jti,
      expiresAt: new Date(record.ExpiresAt),
      refreshTokenHash: record.RefreshTokenHash ?? undefined,
      ipAddress: record.IpAddress ?? undefined,
      userAgent: record.UserAgent ?? undefined,
      createdAt: new Date(record.CreatedAt),
      revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
    });
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "Jti", "ExpiresAt", "RefreshTokenHash", "IpAddress", "UserAgent", "CreatedAt", "RevokedAt"
      FROM "Sessions"
      WHERE "UserId" = $1
      ORDER BY "CreatedAt" DESC;
      `,
      [userId]
    );

    return result.rows.map(
      (record) =>
        new Session({
          id: record.Id,
          userId: record.UserId,
          jti: record.Jti,
          expiresAt: new Date(record.ExpiresAt),
          refreshTokenHash: record.RefreshTokenHash ?? undefined,
          ipAddress: record.IpAddress ?? undefined,
          userAgent: record.UserAgent ?? undefined,
          createdAt: new Date(record.CreatedAt),
          revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
        })
    );
  }

  async update(session: Session): Promise<void> {
    await this.pool.query(
      `
      UPDATE "Sessions"
      SET "Jti" = $2,
          "RefreshTokenHash" = $3,
          "ExpiresAt" = $4,
          "RevokedAt" = $5
      WHERE "Id" = $1;
      `,
      [session.id, session.jti, session.refreshTokenHash ?? "", session.expiresAt, session.revokedAt ?? null]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "Sessions" WHERE "Id" = $1;`, [id]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "Sessions" WHERE "UserId" = $1;`, [userId]);
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM "Sessions" WHERE "ExpiresAt" < CURRENT_TIMESTAMP;`);
  }
}
