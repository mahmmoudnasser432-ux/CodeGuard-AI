import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env.js";
import type { UserRole } from "../../../domain/entities/user.js";

interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
  displayName: string;
  isEmailVerified: boolean;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: JwtPayload;
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: "UNAUTHENTICATED" });
    return;
  }

  try {
    req.user = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "codeguard-ai" }) as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: "INVALID_TOKEN" });
  }
}

export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    next();
    return;
  }

  try {
    req.user = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: "codeguard-ai" }) as JwtPayload;
  } catch {
    // If token is invalid, continue gracefully without setting req.user
  }
  next();
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }
    next();
  };
}
