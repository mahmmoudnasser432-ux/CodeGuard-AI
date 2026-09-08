import pg from "pg";
import { RefreshToken } from "../../../domain/entities/refresh-token.js";
import { RefreshTokenRepository } from "../../../domain/repositories/refresh-token-repository.js";

export class PostgresRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgresRefreshTokenRepository requires an explicit, shared pg.Pool instance.");
    }
  }

  async create(token: RefreshToken): Promise<RefreshToken> {
    await this.pool.query(
      `
      INSERT INTO "RefreshTokens" ("Id", "UserId", "TokenHash", "Jti", "UserAgentHash", "IpHash", "ExpiresAt", "CreatedAt", "RevokedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `,
      [
        token.id,
        token.userId,
        token.tokenHash,
        token.jti,
        token.userAgentHash ?? null,
        token.ipHash ?? null,
        token.expiresAt,
        token.createdAt,
        token.revokedAt ?? null,
      ]
    );

    return token;
  }

  async findById(id: string): Promise<RefreshToken | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "Jti", "UserAgentHash", "IpHash", "ExpiresAt", "CreatedAt", "RevokedAt"
      FROM "RefreshTokens"
      WHERE "Id" = $1;
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash ?? undefined,
      ipHash: record.IpHash ?? undefined,
      expiresAt: new Date(record.ExpiresAt),
      createdAt: new Date(record.CreatedAt),
      revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "Jti", "UserAgentHash", "IpHash", "ExpiresAt", "CreatedAt", "RevokedAt"
      FROM "RefreshTokens"
      WHERE "TokenHash" = $1;
      `,
      [tokenHash]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash ?? undefined,
      ipHash: record.IpHash ?? undefined,
      expiresAt: new Date(record.ExpiresAt),
      createdAt: new Date(record.CreatedAt),
      revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
    });
  }

  async findByUserId(userId: string): Promise<RefreshToken[]> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "Jti", "UserAgentHash", "IpHash", "ExpiresAt", "CreatedAt", "RevokedAt"
      FROM "RefreshTokens"
      WHERE "UserId" = $1
      ORDER BY "CreatedAt" DESC;
      `,
      [userId]
    );

    return result.rows.map(
      (record) =>
        new RefreshToken({
          id: record.Id,
          userId: record.UserId,
          tokenHash: record.TokenHash,
          jti: record.Jti,
          userAgentHash: record.UserAgentHash ?? undefined,
          ipHash: record.IpHash ?? undefined,
          expiresAt: new Date(record.ExpiresAt),
          createdAt: new Date(record.CreatedAt),
          revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
        })
    );
  }

  async findByJti(jti: string): Promise<RefreshToken | null> {
    const result = await this.pool.query(
      `
      SELECT "Id", "UserId", "TokenHash", "Jti", "UserAgentHash", "IpHash", "ExpiresAt", "CreatedAt", "RevokedAt"
      FROM "RefreshTokens"
      WHERE "Jti" = $1;
      `,
      [jti]
    );

    const record = result.rows[0];
    if (!record) return null;

    return new RefreshToken({
      id: record.Id,
      userId: record.UserId,
      tokenHash: record.TokenHash,
      jti: record.Jti,
      userAgentHash: record.UserAgentHash ?? undefined,
      ipHash: record.IpHash ?? undefined,
      expiresAt: new Date(record.ExpiresAt),
      createdAt: new Date(record.CreatedAt),
      revokedAt: record.RevokedAt ? new Date(record.RevokedAt) : undefined,
    });
  }

  async update(token: RefreshToken): Promise<void> {
    await this.pool.query(
      `
      UPDATE "RefreshTokens"
      SET "RevokedAt" = $2
      WHERE "Id" = $1;
      `,
      [token.id, token.revokedAt ?? null]
    );
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM "RefreshTokens" WHERE "Id" = $1;`, [id]);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.pool.query(`DELETE FROM "RefreshTokens" WHERE "UserId" = $1;`, [userId]);
  }

  async deleteByJti(jti: string): Promise<void> {
    await this.pool.query(`DELETE FROM "RefreshTokens" WHERE "Jti" = $1;`, [jti]);
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.query(`DELETE FROM "RefreshTokens" WHERE "ExpiresAt" < CURRENT_TIMESTAMP;`);
  }
}
