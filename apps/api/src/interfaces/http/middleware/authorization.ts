import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../../../domain/entities/user.js";

/**
 * Middleware to check if user has the required role
 * Usage: router.get('/admin', authorizeRoles(UserRole.ADMIN), handler);
 */
export function authorizeRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The authenticate middleware should have already attached req.user
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }

    if (!req.user.roles || !req.user.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ error: "INSUFFICIENT_PERMISSIONS" });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user has at least one of the required roles
 * Usage: router.get('/admin-or-moderator', authorizeAnyRole(UserRole.ADMIN, UserRole.MODERATOR), handler);
 */
export function authorizeAnyRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The authenticate middleware should have already attached req.user
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }

    if (!req.user.roles || !req.user.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ error: "INSUFFICIENT_PERMISSIONS" });
      return;
    }

    next();
  };
}

/**
 * Middleware to check if user has all of the required roles
 * Usage: router.get('/super-admin', authorizeAllRoles(UserRole.ADMIN, UserRole.SUPER_ADMIN), handler);
 */
export function authorizeAllRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // The authenticate middleware should have already attached req.user
    if (!req.user) {
      res.status(401).json({ error: "UNAUTHENTICATED" });
      return;
    }

    if (!req.user!.roles || !roles.every((role) => req.user!.roles!.includes(role))) {
      res.status(403).json({ error: "INSUFFICIENT_PERMISSIONS" });
      return;
    }

    next();
  };
}