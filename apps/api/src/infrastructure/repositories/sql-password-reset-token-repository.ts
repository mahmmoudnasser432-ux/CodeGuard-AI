import { sqlPool } from "../database/sqlserver.js";
import { PasswordResetToken } from "../../domain/entities/password-reset-token.js";
import { PasswordResetTokenRepository } from "../../domain/repositories/password-reset-token-repository.js";

export class SqlPasswordResetTokenRepository implements PasswordResetTokenRepository {
  async create(token: PasswordResetToken): Promise<PasswordResetToken> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', token.id)
      .input('userId', token.userId)
      .input('tokenHash', token.tokenHash)
      .input('expiresAt', token.expiresAt)
      .input('createdAt', token.createdAt)
      .input('usedAt', token.usedAt ?? null)
      .query(`
        INSERT INTO dbo.PasswordResetTokens (Id, UserId, TokenHash, ExpiresAt, CreatedAt, UsedAt)
        VALUES (@id, @userId, @tokenHash, @expiresAt, @createdAt, @usedAt)
      `);

    return token;
  }

  async findById(id: string): Promise<PasswordResetToken | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, UserId, TokenHash, ExpiresAt, CreatedAt, UsedAt
        FROM dbo.PasswordResetTokens
        WHERE Id = @id
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new PasswordResetToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      usedAt: record.UsedAt
    });
  }

  async findByUserId(userId: string): Promise<PasswordResetToken | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT TOP 1 Id, UserId, TokenHash, ExpiresAt, CreatedAt, UsedAt
        FROM dbo.PasswordResetTokens
        WHERE UserId = @userId AND UsedAt IS NULL
        ORDER BY CreatedAt DESC
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new PasswordResetToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      usedAt: record.UsedAt
    });
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('tokenHash', tokenHash)
      .query(`
        SELECT TOP 1 Id, UserId, TokenHash, ExpiresAt, CreatedAt, UsedAt
        FROM dbo.PasswordResetTokens
        WHERE TokenHash = @tokenHash
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new PasswordResetToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      usedAt: record.UsedAt
    });
  }

  async update(token: PasswordResetToken): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', token.id)
      .input('usedAt', token.usedAt ?? null)
      .query(`
        UPDATE dbo.PasswordResetTokens
        SET UsedAt = @usedAt
        WHERE Id = @id
      `);
  }

  async delete(id: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', id)
      .query(`
        DELETE FROM dbo.PasswordResetTokens
        WHERE Id = @id
      `);
  }

  async deleteUsedByUserId(userId: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('userId', userId)
      .query(`
        DELETE FROM dbo.PasswordResetTokens
        WHERE UserId = @userId AND UsedAt IS NOT NULL
      `);
  }

  async cleanupExpired(): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .query(`
        DELETE FROM dbo.PasswordResetTokens
        WHERE ExpiresAt < SYSUTCDATETIME()
      `);
  }
}