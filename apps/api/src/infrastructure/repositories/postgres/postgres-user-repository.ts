import pg from "pg";
import bcrypt from "bcryptjs";
import { User, UserRole } from "../../../domain/entities/user.js";
import { UserRepository, UserAuthDetails } from "../../../domain/repositories/user-repository.js";

export class PostgresUserRepository implements UserRepository {
  /**
   * Requires an infrastructure-managed shared pg.Pool.
   * Independent default pool creation is strictly prohibited to prevent connection pool proliferation.
   */
  constructor(private readonly pool: pg.Pool) {
    if (!pool) {
      throw new Error("PostgresUserRepository requires an explicit, shared pg.Pool instance.");
    }
  }

  async save(user: User, passwordHash?: string | null): Promise<User> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN;");

      const now = new Date();
      const createdAt = user.createdAt ?? now;
      const updatedAt = user.updatedAt ?? now;

      // 1. Upsert User record
      await client.query(
        `
        INSERT INTO "Users" ("Id", "Email", "PasswordHash", "DisplayName", "IsEmailVerified", "MfaEnabled", "CreatedAt", "UpdatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT ("Id") DO UPDATE SET
          "Email" = EXCLUDED."Email",
          "PasswordHash" = COALESCE(EXCLUDED."PasswordHash", "Users"."PasswordHash"),
          "DisplayName" = EXCLUDED."DisplayName",
          "IsEmailVerified" = EXCLUDED."IsEmailVerified",
          "MfaEnabled" = EXCLUDED."MfaEnabled",
          "UpdatedAt" = EXCLUDED."UpdatedAt";
        `,
        [
          user.id,
          user.email,
          passwordHash ?? null,
          user.displayName,
          user.isEmailVerified,
          user.mfaEnabled,
          createdAt,
          updatedAt,
        ]
      );

      // 2. Differential role synchronization inside active transaction
      // Direct comparison with SqlUserRepository.save():
      // - SqlUserRepository uses DELETE + INSERT in the same batch.
      // - Here in PostgreSQL, differential sync inside the transaction is strictly equivalent in outcome
      //   while avoiding deletion and re-insertion of unchanged existing roles.
      // - Atomic within the BEGIN...COMMIT block; readers never observe intermediate unassigned states.
      if (!user.roles || user.roles.length === 0) {
        await client.query(`DELETE FROM "UserRoles" WHERE "UserId" = $1;`, [user.id]);
      } else {
        // Delete roles that are no longer assigned
        await client.query(
          `
          DELETE FROM "UserRoles"
          WHERE "UserId" = $1
            AND "RoleId" NOT IN (
              SELECT r."Id"
              FROM unnest($2::text[]) AS s(role_name)
              INNER JOIN "Roles" r ON (s.role_name = r."Name" OR s.role_name = r."Id"::text)
            );
          `,
          [user.id, user.roles]
        );

        // Insert new roles (skipping already assigned roles)
        await client.query(
          `
          INSERT INTO "UserRoles" ("UserId", "RoleId")
          SELECT $1, r."Id"
          FROM unnest($2::text[]) AS s(role_name)
          INNER JOIN "Roles" r ON (s.role_name = r."Name" OR s.role_name = r."Id"::text)
          ON CONFLICT ("UserId", "RoleId") DO NOTHING;
          `,
          [user.id, user.roles]
        );
      }

      await client.query("COMMIT;");
      return user;
    } catch (error) {
      await client.query("ROLLBACK;").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      `
      SELECT u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
             u."CreatedAt", u."UpdatedAt",
             string_agg(r."Name", ',') AS "Roles"
      FROM "Users" u
      LEFT JOIN "UserRoles" ur ON u."Id" = ur."UserId"
      LEFT JOIN "Roles" r ON ur."RoleId" = r."Id"
      WHERE u."Id" = $1
      GROUP BY u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled", u."CreatedAt", u."UpdatedAt";
      `,
      [id]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? (record.Roles.split(",").filter(Boolean) as UserRole[]) : [],
      isEmailVerified: Boolean(record.IsEmailVerified),
      mfaEnabled: Boolean(record.MfaEnabled),
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
      updatedAt: record.UpdatedAt ? new Date(record.UpdatedAt) : undefined,
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      `
      SELECT u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
             u."CreatedAt", u."UpdatedAt",
             string_agg(r."Name", ',') AS "Roles"
      FROM "Users" u
      LEFT JOIN "UserRoles" ur ON u."Id" = ur."UserId"
      LEFT JOIN "Roles" r ON ur."RoleId" = r."Id"
      WHERE u."Email" = $1
      GROUP BY u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled", u."CreatedAt", u."UpdatedAt";
      `,
      [email]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? (record.Roles.split(",").filter(Boolean) as UserRole[]) : [],
      isEmailVerified: Boolean(record.IsEmailVerified),
      mfaEnabled: Boolean(record.MfaEnabled),
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
      updatedAt: record.UpdatedAt ? new Date(record.UpdatedAt) : undefined,
    };
  }

  async findByRole(role: string): Promise<User[]> {
    const result = await this.pool.query(
      `
      SELECT u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
             u."CreatedAt", u."UpdatedAt",
             string_agg(r."Name", ',') AS "Roles"
      FROM "Users" u
      LEFT JOIN "UserRoles" ur ON u."Id" = ur."UserId"
      LEFT JOIN "Roles" r ON ur."RoleId" = r."Id"
      WHERE u."Id" IN (
        SELECT ur_sub."UserId"
        FROM "UserRoles" ur_sub
        INNER JOIN "Roles" r_sub ON ur_sub."RoleId" = r_sub."Id"
        WHERE r_sub."Name" = $1 OR r_sub."Id"::text = $1
      )
      GROUP BY u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled", u."CreatedAt", u."UpdatedAt";
      `,
      [role]
    );

    return result.rows.map((record) => ({
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? (record.Roles.split(",").filter(Boolean) as UserRole[]) : [],
      isEmailVerified: Boolean(record.IsEmailVerified),
      mfaEnabled: Boolean(record.MfaEnabled),
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
      updatedAt: record.UpdatedAt ? new Date(record.UpdatedAt) : undefined,
    }));
  }

  async findAuthDetailsByEmail(email: string): Promise<UserAuthDetails | null> {
    const result = await this.pool.query(
      `
      SELECT u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
             u."CreatedAt", u."UpdatedAt",
             u."PasswordHash", u."FailedLoginCount", u."LockedUntil",
             string_agg(r."Name", ',') AS "Roles"
      FROM "Users" u
      LEFT JOIN "UserRoles" ur ON u."Id" = ur."UserId"
      LEFT JOIN "Roles" r ON ur."RoleId" = r."Id"
      WHERE u."Email" = $1
      GROUP BY u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
               u."CreatedAt", u."UpdatedAt", u."PasswordHash", u."FailedLoginCount", u."LockedUntil";
      `,
      [email]
    );

    const record = result.rows[0];
    if (!record) return null;

    return {
      user: {
        id: record.Id,
        email: record.Email,
        displayName: record.DisplayName,
        roles: record.Roles ? (record.Roles.split(",").filter(Boolean) as UserRole[]) : [],
        isEmailVerified: Boolean(record.IsEmailVerified),
        mfaEnabled: Boolean(record.MfaEnabled),
        createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
        updatedAt: record.UpdatedAt ? new Date(record.UpdatedAt) : undefined,
      },
      passwordHash: record.PasswordHash ?? null,
      failedLoginCount: typeof record.FailedLoginCount === "number" ? record.FailedLoginCount : 0,
      lockedUntil: record.LockedUntil ? new Date(record.LockedUntil) : null,
    };
  }

  async incrementFailedLogins(
    userId: string,
    maxAttempts: number,
    lockoutDurationMs: number
  ): Promise<{ failedLoginCount: number; lockedUntil: Date | null }> {
    const result = await this.pool.query(
      `
      UPDATE "Users"
      SET
        "FailedLoginCount" = CASE
          WHEN "LockedUntil" IS NOT NULL AND "LockedUntil" <= CURRENT_TIMESTAMP THEN 1
          ELSE "FailedLoginCount" + 1
        END,
        "LockedUntil" = CASE
          WHEN (CASE WHEN "LockedUntil" IS NOT NULL AND "LockedUntil" <= CURRENT_TIMESTAMP THEN 1 ELSE "FailedLoginCount" + 1 END) >= $2
            THEN CURRENT_TIMESTAMP + ($3 * INTERVAL '1 millisecond')
          ELSE NULL
        END,
        "UpdatedAt" = CURRENT_TIMESTAMP
      WHERE "Id" = $1
      RETURNING "FailedLoginCount", "LockedUntil";
      `,
      [userId, maxAttempts, lockoutDurationMs]
    );

    const updated = result.rows[0];
    if (!updated) {
      return { failedLoginCount: 0, lockedUntil: null };
    }

    return {
      failedLoginCount: updated.FailedLoginCount,
      lockedUntil: updated.LockedUntil ? new Date(updated.LockedUntil) : null,
    };
  }

  async resetFailedLogins(userId: string): Promise<void> {
    await this.pool.query(
      `
      UPDATE "Users"
      SET
        "FailedLoginCount" = 0,
        "LockedUntil" = NULL,
        "UpdatedAt" = CURRENT_TIMESTAMP
      WHERE "Id" = $1;
      `,
      [userId]
    );
  }

  async findByCredentials(email: string, password: string): Promise<User | null> {
    const result = await this.pool.query(
      `
      SELECT u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
             u."CreatedAt", u."UpdatedAt",
             string_agg(r."Name", ',') AS "Roles",
             u."PasswordHash"
      FROM "Users" u
      LEFT JOIN "UserRoles" ur ON u."Id" = ur."UserId"
      LEFT JOIN "Roles" r ON ur."RoleId" = r."Id"
      WHERE u."Email" = $1
      GROUP BY u."Id", u."Email", u."DisplayName", u."IsEmailVerified", u."MfaEnabled",
               u."CreatedAt", u."UpdatedAt", u."PasswordHash";
      `,
      [email]
    );

    const record = result.rows[0];
    if (!record) {
      // User not found - verify against dummy hash to prevent timing attacks
      await bcrypt.compare("dummy", "$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4h/4q/YvKe");
      return null;
    }

    const passwordHash = record.PasswordHash;
    if (passwordHash === null || passwordHash === undefined) {
      return null;
    }

    const isValid = await bcrypt.compare(password, String(passwordHash));
    if (!isValid) {
      return null;
    }

    return {
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? (record.Roles.split(",").filter(Boolean) as UserRole[]) : [],
      isEmailVerified: Boolean(record.IsEmailVerified),
      mfaEnabled: Boolean(record.MfaEnabled),
      createdAt: record.CreatedAt ? new Date(record.CreatedAt) : undefined,
      updatedAt: record.UpdatedAt ? new Date(record.UpdatedAt) : undefined,
    };
  }
}
