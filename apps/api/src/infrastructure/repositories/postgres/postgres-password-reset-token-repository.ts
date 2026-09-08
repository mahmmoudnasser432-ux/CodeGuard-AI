import pg from "pg";
import { PasswordResetToken } from "../../../domain/entities/password-reset-token.js";
import { PasswordResetTokenRepository } from "../../../domain/repositories/password-reset-token-repository.js";

export class PostgresPasswordResetTokenRepository implements PasswordResetTokenRepository {
  constructor(private readonly pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgresPasswordResetTokenRepository requires an explicit, shared pg.Pool instance.");
    }
  }

  async create(token: PasswordResetToken): Promise<PasswordResetToken> {
    await this.pool.query(
      `
      INSERT INTO "PasswordResetTokens" ("Id", "UserId", "TokenHash", "ExpiresAt", "CreatedAt", "UsedAt")
      VALUES ($1, $2, $3, $4, $5, $6);
      `,
      [
        token.id,
        token.userId,
        token.tokenHash,
        token.expiresAt,
        token.createdAt,
        token.usedAt ?? null,
      ]
    );

    return token;
  }

  async findById(id: string): Promise<PasswordResetToken | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "ExpiresAt", "CreatedAt", "UsedAt"
      FROM "PasswordResetTokens"
      WHERE "Id" = $1;
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new PasswordResetToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      expiresAt: new Date(record.ExpiresAt),
      createdAt: new Date(record.CreatedAt),
      usedAt: record.UsedAt ? new Date(record.UsedAt) : undefined,
    });
  }

  async findByUserId(userId: string): Promise<PasswordResetToken | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "ExpiresAt", "CreatedAt", "UsedAt"
      FROM "PasswordResetTokens"
      WHERE "UserId" = $1 AND "UsedAt" IS NULL
      ORDER BY "CreatedAt" DESC
      LIMIT 1;
      `,
      [userId]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new PasswordResetToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      expiresAt: new Date(record.ExpiresAt),
      createdAt: new Date(record.CreatedAt),
      usedAt: record.UsedAt ? new Date(record.UsedAt) : undefined,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "ExpiresAt", "CreatedAt", "UsedAt"
      FROM "PasswordResetTokens"
      WHERE "TokenHash" = $1
      LIMIT 1;
      `,
      [tokenHash]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new PasswordResetToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      expiresAt: new Date(record.ExpiresAt),
      createdAt: new Date(record.CreatedAt),
      usedAt: record.UsedAt ? new Date(record.UsedAt) : undefined,
    });
  }

  async update(token: PasswordResetToken): Promise<void> {
    await this.pool.query(
      `
      UPDATE "PasswordResetTokens"
      SET "UsedAt" = $2
      WHERE "Id" = $1;
      `,
      [token.id, token.usedAt ?? null]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "PasswordResetTokens" WHERE "Id" = $1;`, [id]);
  }

  async deleteUsedByUserId(userId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM "PasswordResetTokens" WHERE "UserId" = $1 AND "UsedAt" IS NOT NULL;`,
      [userId]
    );
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM "PasswordResetTokens" WHERE "ExpiresAt" < CURRENT_TIMESTAMP;`);
  }
}
