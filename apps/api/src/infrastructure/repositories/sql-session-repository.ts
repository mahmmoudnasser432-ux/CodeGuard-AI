import { sqlPool } from "../database/sqlserver.js";
import { Session } from "../../domain/entities/session.js";
import { SessionRepository } from "../../domain/repositories/session-repository.js";

export class SqlSessionRepository implements SessionRepository {
  async create(session: Session): Promise<Session> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', session.id)
      .input('userId', session.userId)
      .input('jti', session.jti)
      .input('expiresAt', session.expiresAt)
      .input('refreshTokenHash', session.refreshTokenHash ?? null)
      .input('ipAddress', session.ipAddress ?? null)
      .input('userAgent', session.userAgent ?? null)
      .input('createdAt', session.createdAt)
      .input('revokedAt', session.revokedAt ?? null)
      .query(`
        INSERT INTO dbo.Sessions (Id, UserId, Jti, ExpiresAt, RefreshTokenHash, IpAddress, UserAgent, CreatedAt, RevokedAt)
        VALUES (@id, @userId, @jti, @expiresAt, @refreshTokenHash, @ipAddress, @userAgent, @createdAt, @revokedAt)
      `);

    return session;
  }

  async findById(id: string): Promise<Session | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT Id, UserId, Jti, ExpiresAt, RefreshTokenHash, IpAddress, UserAgent, CreatedAt, RevokedAt
        FROM dbo.Sessions
        WHERE Id = @id
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new Session({
      id: record.Id,
      userId: record.UserId,
      jti: record.Jti,
      expiresAt: record.ExpiresAt,
      refreshTokenHash: record.RefreshTokenHash,
      ipAddress: record.IpAddress,
      userAgent: record.UserAgent,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    });
  }

  async findByJti(jti: string): Promise<Session | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('jti', jti)
      .query(`
        SELECT Id, UserId, Jti, ExpiresAt, RefreshTokenHash, IpAddress, UserAgent, CreatedAt, RevokedAt
        FROM dbo.Sessions
        WHERE Jti = @jti
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return new Session({
      id: record.Id,
      userId: record.UserId,
      jti: record.Jti,
      expiresAt: record.ExpiresAt,
      refreshTokenHash: record.RefreshTokenHash,
      ipAddress: record.IpAddress,
      userAgent: record.UserAgent,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    });
  }

  async findByUserId(userId: string): Promise<Session[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('userId', userId)
      .query(`
        SELECT Id, UserId, Jti, ExpiresAt, RefreshTokenHash, IpAddress, UserAgent, CreatedAt, RevokedAt
        FROM dbo.Sessions
        WHERE UserId = @userId
        ORDER BY CreatedAt DESC
      `);

    return result.recordset.map(record => new Session({
      id: record.Id,
      userId: record.UserId,
      jti: record.Jti,
      expiresAt: record.ExpiresAt,
      refreshTokenHash: record.RefreshTokenHash,
      ipAddress: record.IpAddress,
      userAgent: record.UserAgent,
      createdAt: record.CreatedAt,
      revokedAt: record.RevokedAt
    }));
  }

  async update(session: Session): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', session.id)
      .input('jti', session.jti)
      .input('refreshTokenHash', session.refreshTokenHash ?? null)
      .input('expiresAt', session.expiresAt)
      .input('revokedAt', session.revokedAt ?? null)
      .query(`
        UPDATE dbo.Sessions
        SET Jti = @jti,
            RefreshTokenHash = @refreshTokenHash,
            ExpiresAt = @expiresAt,
            RevokedAt = @revokedAt
        WHERE Id = @id
      `);
  }

  async delete(id: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('id', id)
      .query(`
        DELETE FROM dbo.Sessions
        WHERE Id = @id
      `);
  }

  async deleteByUserId(userId: string): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .input('userId', userId)
      .query(`
        DELETE FROM dbo.Sessions
        WHERE UserId = @userId
      `);
  }

  async cleanupExpired(): Promise<void> {
    const pool = await sqlPool.connect();
    await pool.request()
      .query(`
        DELETE FROM dbo.Sessions
        WHERE ExpiresAt < SYSUTCDATETIME()
      `);
  }
}