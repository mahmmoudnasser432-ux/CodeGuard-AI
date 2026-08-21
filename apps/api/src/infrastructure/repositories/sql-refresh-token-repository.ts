import { sqlPool } from "../database/sqlserver.ts";
import { RefreshToken } from "../../domain/entities/refresh-token.ts";
import { RefreshTokenRepository } from "../../domain/repositories/refresh-token-repository.ts";

export class SqlRefreshTokenRepository implements RefreshTokenRepository {
  async create(token: RefreshToken): Promise<RefreshToken> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', token.id)
      .input('userId', token.userId)
      .input('tokenHash', token.tokenHash)
      .input('jti', token.jti)
      .input('userAgentHash', token.userAgentHash ?? null)
      .input('ipHash', token.ipHash ?? null)
      .input('expiresAt', token.expiresAt)
      .input('createdAt', token.createdAt)
      .input('revokedAt', token.revokedAt ?? null)
      .query(`
        INSERT INTO dbo.RefreshTokens (Id, UserId, TokenHash, Jti, UserAgentHash, IpHash, ExpiresAt, CreatedAt, RevokedAt)
        VALUES (@id, @userId, @tokenHash, @jti, @userAgentHash, @ipHash, @expiresAt, @createdAt, @revokedAt)
      `);

    return token;
  }

  async findById(id: string): Promise<RefreshToken | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, UserId, TokenHash, Jti, UserAgentHash, IpHash, ExpiresAt, CreatedAt, RevokedAt
        FROM dbo.RefreshTokens
        WHERE Id = @id
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash,
      ipHash: record.IpHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('tokenHash', tokenHash)
      .query(`
        SELECT Id, UserId, TokenHash, Jti, UserAgentHash, IpHash, ExpiresAt, CreatedAt, RevokedAt
        FROM dbo.RefreshTokens
        WHERE TokenHash = @tokenHash
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash,
      ipHash: record.IpHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    });
  }

  async findByUserId(userId: string): Promise<RefreshToken[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT Id, UserId, TokenHash, Jti, UserAgentHash, IpHash, ExpiresAt, CreatedAt, RevokedAt
        FROM dbo.RefreshTokens
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash,
      ipHash: record.IpHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    }));
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('jti', jti)
      .query(`
        SELECT Id, UserId, TokenHash, Jti, UserAgentHash, IpHash, ExpiresAt, CreatedAt, RevokedAt
        FROM dbo.RefreshTokens
        WHERE Jti = @jti
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash,
      ipHash: record.IpHash,
      expiresAt: record.ExpiresAt,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    });
  }

  async update(token: RefreshToken): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', token.id)
      .input('revokedAt', token.revokedAt ?? null)
      .query(`
        UPDATE dbo.RefreshTokens
        SET RevokedAt = @revokedAt
        WHERE Id = @id
      `);
  }

  async delete(id: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', id)
      .query(`
        DELETE FROM dbo.RefreshTokens
        WHERE Id = @id
      `);
  }

  async deleteByUserId(userId: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('userId', userId)
      .query(`
        DELETE FROM dbo.RefreshTokens
        WHERE UserId = @userId
      `);
  }

  async deleteByJti(jti: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('jti', jti)
      .query(`
        DELETE FROM dbo.RefreshTokens
        WHERE Jti = @jti
      `);
  }

  async cleanupExpired(): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .query(`
        DELETE FROM dbo.RefreshTokens
        WHERE ExpiresAt < SYSUTCDATETIME()
      `);
  }
}