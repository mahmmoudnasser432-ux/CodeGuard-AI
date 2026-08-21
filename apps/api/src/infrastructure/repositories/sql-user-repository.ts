import { sqlPool } from "../database/sqlserver.ts";
import { User } from "../../domain/entities/user.ts";
import { UserRepository } from "../../domain/repositories/user-repository.ts";

export class SqlUserRepository implements UserRepository {
  async save(user: User, passwordHash?: string | null): Promise<User> {
    const pool = await sqlPool.connect();
    const request = pool.request()
      .input('id', user.id)
      .input('email', user.email)
      .input('passwordHash', passwordHash ?? null)
      .input('displayName', user.displayName)
      .input('roles', user.roles.join(','))
      .input('isEmailVerified', user.isEmailVerified ? 1 : 0)
      .input('mfaEnabled', user.mfaEnabled ? 1 : 0)
      .input('createdAt', user.createdAt ?? new Date())
      .input('updatedAt', user.updatedAt ?? new Date());

    if (user.id === '00000000-0000-0000-0000-000000000001') {
      // System user - only update if exists
      const result = await request.query(`
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE Id = @id)
        BEGIN
          UPDATE dbo.Users SET
            Email = @email,
            PasswordHash = @passwordHash,
            DisplayName = @displayName,
            IsEmailVerified = @isEmailVerified,
            MfaEnabled = @mfaEnabled,
            UpdatedAt = @updatedAt
          WHERE Id = @id;

          -- Update user roles
          DELETE FROM dbo.UserRoles WHERE UserId = @id;
          INSERT INTO dbo.UserRoles (UserId, RoleId)
          SELECT @id, value FROM STRING_SPLIT(@roles, ',');
        END
        ELSE
        BEGIN
          INSERT INTO dbo.Users (Id, Email, PasswordHash, DisplayName, IsEmailVerified, MfaEnabled, CreatedAt, UpdatedAt)
          VALUES (@id, @email, @passwordHash, @displayName, @isEmailVerified, @mfaEnabled, @createdAt, @updatedAt);

          -- Insert user roles
          INSERT INTO dbo.UserRoles (UserId, RoleId)
          SELECT @id, value FROM STRING_SPLIT(@roles, ',');
        END
      `);
    } else {
      // Regular user - use upsert pattern
      await request.query(`
        MERGE dbo.Users AS target
        USING (SELECT @id as Id, @email as Email, @passwordHash as PasswordHash,
                  @displayName as DisplayName, @isEmailVerified as IsEmailVerified,
                  @mfaEnabled as MfaEnabled, @createdAt as CreatedAt, @updatedAt as UpdatedAt) AS source
        ON target.Id = source.Id
        WHEN MATCHED THEN
          UPDATE SET
            Email = source.Email,
            PasswordHash = source.PasswordHash,
            DisplayName = source.DisplayName,
            IsEmailVerified = source.IsEmailVerified,
            MfaEnabled = source.MfaEnabled,
            UpdatedAt = source.UpdatedAt
        WHEN NOT MATCHED THEN
          INSERT (Id, Email, PasswordHash, DisplayName, IsEmailVerified, MfaEnabled, CreatedAt, UpdatedAt)
          VALUES (source.Id, source.Email, source.PasswordHash, source.DisplayName,
                  source.IsEmailVerified, source.MfaEnabled, source.CreatedAt, source.UpdatedAt);

        -- Handle user roles
        DELETE FROM dbo.UserRoles WHERE UserId = @id;
        INSERT INTO dbo.UserRoles (UserId, RoleId)
        SELECT @id, value FROM STRING_SPLIT(@roles, ',');
      `);
    }

    return user;
  }

  async findById(id: string): Promise<User | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled,
               STRING_AGG(CONVERT(VARCHAR(36), r.Id), ',') AS Roles
        FROM dbo.Users u
        LEFT JOIN dbo.UserRoles ur ON u.Id = ur.UserId
        LEFT JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE u.Id = @id
        GROUP BY u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return {
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? record.Roles.split(',').filter(Boolean) : [],
      isEmailVerified: !!record.IsEmailVerified,
      mfaEnabled: !!record.MfaEnabled
    };
  }

  async findByEmail(email: string): Promise<User | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('email', email)
      .query(`
        SELECT u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled,
               STRING_AGG(CONVERT(VARCHAR(36), r.Id), ',') AS Roles
        FROM dbo.Users u
        LEFT JOIN dbo.UserRoles ur ON u.Id = ur.UserId
        LEFT JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE u.Email = @email
        GROUP BY u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled
      `);

    const record = result.recordset[0];
    if (!record) return null;

    return {
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? record.Roles.split(',').filter(Boolean) : [],
      isEmailVerified: !!record.IsEmailVerified,
      mfaEnabled: !!record.MfaEnabled
    };
  }

  async findByRole(role: string): Promise<User[]> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('role', role)
      .query(`
        SELECT u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled,
               STRING_AGG(CONVERT(VARCHAR(36), r.Id), ',') AS Roles
        FROM dbo.Users u
        INNER JOIN dbo.UserRoles ur ON u.Id = ur.UserId
        INNER JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE r.Name = @role
        GROUP BY u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled
      `);

    return result.recordset.map(record => ({
      id: record.Id,
      email: record.Email,
      displayName: record.DisplayName,
      roles: record.Roles ? record.Roles.split(',').filter(Boolean) : [],
      isEmailVerified: !!record.IsEmailVerified,
      mfaEnabled: !!record.MfaEnabled
    }));
  }
}