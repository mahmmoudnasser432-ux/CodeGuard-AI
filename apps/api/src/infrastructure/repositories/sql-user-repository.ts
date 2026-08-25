import { sqlPool } from "../database/sqlserver.js";
import { User } from "../../domain/entities/user.js";
import { UserRepository } from "../../domain/repositories/user-repository.js";
import bcrypt from "bcryptjs";

export class SqlUserRepository implements UserRepository {
  async save(user: User, passwordHash?: string | null): Promise<User> {
    const pool = await sqlPool.connect();
    const request = pool.request()
      .input('id', user.id)
      .input('email', user.email)
      .input('passwordHash', passwordHash ?? null)
      .input('displayName', user.displayName)
      .input('isEmailVerified', user.isEmailVerified ? 1 : 0)
      .input('mfaEnabled', user.mfaEnabled ? 1 : 0)
      .input('createdAt', user.createdAt ?? new Date())
      .input('updatedAt', user.updatedAt ?? new Date())
      .input('roles', user.roles.join(','));

    if (user.id === '00000000-0000-0000-0000-000000000001') {
      // System user - only update if exists
      const result = await request.query(`
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE Id = @id)
        BEGIN
          UPDATE dbo.Users SET
            Email = @email,
            PasswordHash = COALESCE(@passwordHash, PasswordHash),
            DisplayName = @displayName,
            IsEmailVerified = @isEmailVerified,
            MfaEnabled = @mfaEnabled,
            UpdatedAt = @updatedAt
          WHERE Id = @id;

          -- Update user roles
          BEGIN
            DELETE FROM dbo.UserRoles WHERE UserId = @id;
            INSERT INTO dbo.UserRoles (UserId, RoleId)
            SELECT @id, r.Id
            FROM STRING_SPLIT(@roles, ',') AS s
            INNER JOIN dbo.Roles r ON s.value = r.Name;
          END
        END
        ELSE
        BEGIN
          INSERT INTO dbo.Users (Id, Email, PasswordHash, DisplayName, IsEmailVerified, MfaEnabled, CreatedAt, UpdatedAt)
          VALUES (@id, @email, @passwordHash, @displayName, @isEmailVerified, @mfaEnabled, @createdAt, @updatedAt);

          -- Insert user roles
          BEGIN
            INSERT INTO dbo.UserRoles (UserId, RoleId)
            SELECT @id, r.Id
            FROM STRING_SPLIT(@roles, ',') AS s
            INNER JOIN dbo.Roles r ON s.value = r.Name;
          END
        END
      `);
    } else {
      // Regular user - try update first, then insert if not found
      console.log('Saving user with roles:', user.roles);
      await request.query(`
        UPDATE dbo.Users SET
          Email = @email,
          PasswordHash = COALESCE(@passwordHash, PasswordHash),
          DisplayName = @displayName,
          IsEmailVerified = @isEmailVerified,
          MfaEnabled = @mfaEnabled,
          UpdatedAt = @updatedAt
        WHERE Id = @id;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO dbo.Users (Id, Email, PasswordHash, DisplayName, IsEmailVerified, MfaEnabled, CreatedAt, UpdatedAt)
          VALUES (@id, @email, @passwordHash, @displayName, @isEmailVerified, @mfaEnabled, @createdAt, @updatedAt);
        END

        -- Handle user roles
        BEGIN
          DELETE FROM dbo.UserRoles WHERE UserId = @id;
          INSERT INTO dbo.UserRoles (UserId, RoleId)
          SELECT @id, r.Id
          FROM STRING_SPLIT(@roles, ',') AS s
          INNER JOIN dbo.Roles r ON s.value = r.Name;
        END
      `);
      console.log('User saved.');

      // Verify roles were saved
      const verifyRequest = pool.request()
        .input('id', user.id)
        .query(`
          SELECT r.Name
          FROM dbo.UserRoles ur
          INNER JOIN dbo.Roles r ON ur.RoleId = r.Id
          WHERE ur.UserId = @id
        `);
      const verifyResult = await verifyRequest;
      console.log('Roles saved in DB:', verifyResult.recordset.map(r => r.Name));
    }

    return user;
  }

  async findById(id: string): Promise<User | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('id', id)
      .query(`
        SELECT u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled,
               STRING_AGG(r.Name, ',') AS Roles
        FROM dbo.Users u
        LEFT JOIN dbo.UserRoles ur ON u.Id = ur.UserId
        LEFT JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE u.Id = @id
        GROUP BY u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled
      `);

    const record = result.recordset[0];
    if (!record) return null;

    console.log('findById record.Roles:', record.Roles);

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
               STRING_AGG(r.Name, ',') AS Roles
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
               STRING_AGG(r.Name, ',') AS Roles
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

  async findByCredentials(email: string, password: string): Promise<User | null> {
    const pool = await sqlPool.connect();
    const result = await pool.request()
      .input('email', email)
      .input('password', password)
      .query(`
        SELECT u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled,
               STRING_AGG(r.Name, ',') AS Roles,
               u.PasswordHash
        FROM dbo.Users u
        LEFT JOIN dbo.UserRoles ur ON u.Id = ur.UserId
        LEFT JOIN dbo.Roles r ON ur.RoleId = r.Id
        WHERE u.Email = @email
        GROUP BY u.Id, u.Email, u.DisplayName, u.IsEmailVerified, u.MfaEnabled, u.PasswordHash
      `);

    const record = result.recordset[0];
    if (!record) {
      // User not found - still verify password to prevent timing attacks
      // Hash a dummy password to take similar time as real hash verification
      await bcrypt.compare("dummy", "$2a$12$dummyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
      return null;
    }

    console.log('findByCredentials record.Roles:', record.Roles);

    // Verify the password against the stored hash
    const passwordHash = record.PasswordHash;
    if (passwordHash === null || passwordHash === undefined) {
      // No password hash stored - treat as invalid credentials
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
      roles: record.Roles ? record.Roles.split(',').filter(Boolean) : [],
      isEmailVerified: !!record.IsEmailVerified,
      mfaEnabled: !!record.MfaEnabled
    };
  }
}