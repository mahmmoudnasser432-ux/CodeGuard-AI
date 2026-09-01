import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseEnv, DEV_DEFAULT_ACCESS_SECRET, DEV_DEFAULT_REFRESH_SECRET } from "../src/config/env.js";

describe("Phase 5: Production Secret Management & Deployment Hardening", () => {
  const repoRoot = path.resolve(__dirname, "../../..");
  const deployWorkflowPath = path.join(repoRoot, ".github/workflows/deploy.yml");
  const gitignorePath = path.join(repoRoot, ".gitignore");
  const rootEnvExamplePath = path.join(repoRoot, ".env.example");
  const apiEnvExamplePath = path.join(repoRoot, "apps/api/.env.example");

  describe("Deployment Workflow Hardening (.github/workflows/deploy.yml)", () => {
    const deployContent = fs.readFileSync(deployWorkflowPath, "utf-8");

    it("enforces least-privilege permissions (contents: read)", () => {
      expect(deployContent).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    });

    it("exposes RAILWAY_TOKEN at job-level env scope for AI and API services", () => {
      expect(deployContent).toMatch(/deploy-ai-service:[\s\S]*?env:\s*\n\s*RAILWAY_TOKEN:\s*\${{\s*secrets\.RAILWAY_TOKEN\s*}}/);
      expect(deployContent).toMatch(/deploy-api:[\s\S]*?env:\s*\n\s*RAILWAY_TOKEN:\s*\${{\s*secrets\.RAILWAY_TOKEN\s*}}/);
    });

    it("evaluates RAILWAY_TOKEN condition using job-level env", () => {
      expect(deployContent).toMatch(/if:\s*\${{\s*env\.RAILWAY_TOKEN\s*!=\s*''\s*}}/);
    });

    it("exposes Vercel credentials at job-level env scope", () => {
      expect(deployContent).toMatch(/deploy-frontend:[\s\S]*?env:[\s\S]*?VERCEL_TOKEN:\s*\${{\s*secrets\.VERCEL_TOKEN\s*}}/);
    });

    it("pins third-party deployment actions to immutable commit SHAs", () => {
      expect(deployContent).not.toMatch(/uses:\s*bervProject\/railway-deploy@main/);
      expect(deployContent).toMatch(/uses:\s*bervProject\/railway-deploy@[a-f0-9]{40}/);
      expect(deployContent).toMatch(/uses:\s*amondnet\/vercel-action@[a-f0-9]{40}/);
      expect(deployContent).toMatch(/uses:\s*actions\/checkout@[a-f0-9]{40}/);
    });

    it("strictly isolates deployment credentials from runtime application secrets", () => {
      const forbiddenSecrets = [
        "JWT_ACCESS_SECRET",
        "JWT_REFRESH_SECRET",
        "SQLSERVER_PASSWORD",
        "NVIDIA_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENAI_API_KEY",
        "GEMINI_API_KEY",
        "EMAIL_PASSWORD"
      ];

      for (const secret of forbiddenSecrets) {
        expect(deployContent).not.toContain(`secrets.${secret}`);
      }
    });

    it("maintains deterministic deployment pipeline order (AI -> API -> Frontend)", () => {
      expect(deployContent).toMatch(/deploy-api:[\s\S]*?needs:\s*\[deploy-ai-service\]/);
      expect(deployContent).toMatch(/deploy-frontend:[\s\S]*?needs:\s*\[deploy-api\]/);
    });
  });

  describe(".gitignore Secret Exclusions", () => {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");

    it("ignores .env and wildcard .env.* files", () => {
      expect(gitignoreContent).toMatch(/^\.env$/m);
      expect(gitignoreContent).toMatch(/^\.env\.\*$/m);
    });

    it("preserves tracked .env.example files with negative ignore patterns", () => {
      expect(gitignoreContent).toMatch(/^!\.env\.example$/m);
    });
  });

  describe("Environment Example Template Hygiene", () => {
    const rootEnvExample = fs.readFileSync(rootEnvExamplePath, "utf-8");
    const apiEnvExample = fs.readFileSync(apiEnvExamplePath, "utf-8");

    it("contains clear documentation explaining production secret management", () => {
      expect(rootEnvExample).toContain("Railway Sealed Variables");
      expect(apiEnvExample).toContain("Railway Sealed Variables");
    });

    it("does not contain real credentials or production secrets", () => {
      expect(rootEnvExample).not.toMatch(/sk-ant-/);
      expect(rootEnvExample).not.toMatch(/sk-proj-/);
      expect(rootEnvExample).not.toMatch(/nvapi-[a-zA-Z0-9]{20,}/);
    });
  });

  describe("Production Runtime Configuration Validation (Platform-Agnostic)", () => {
    const baseProdEnv = {
      NODE_ENV: "production",
      API_BASE_URL: "https://api.codeguard.ai",
      JWT_ACCESS_SECRET: "high-entropy-production-access-secret-32-chars-minimum",
      JWT_REFRESH_SECRET: "high-entropy-production-refresh-secret-32-chars-minimum",
      SQLSERVER_PASSWORD: "StrongProdPassword123!",
      REDIS_URL: "redis://redis.railway.internal:6379",
    };

    it("validates production configuration injected via platform environment variables", () => {
      const parsed = parseEnv(baseProdEnv);
      expect(parsed.NODE_ENV).toBe("production");
      expect(parsed.SQLSERVER_ENCRYPT).toBe(true);
      expect(parsed.SQLSERVER_TRUST_SERVER_CERTIFICATE).toBe(false);
      expect(parsed.AUTH_COOKIE_SECURE).toBe(true);
    });

    it("accepts Railway internal private network Redis URLs", () => {
      const parsed = parseEnv({
        ...baseProdEnv,
        REDIS_URL: "redis://default:token@redis.railway.internal:6379"
      });
      expect(parsed.REDIS_URL).toBe("redis://default:token@redis.railway.internal:6379");
    });

    it("rejects predictable development default secrets in production", () => {
      expect(() => parseEnv({
        ...baseProdEnv,
        JWT_ACCESS_SECRET: DEV_DEFAULT_ACCESS_SECRET
      })).toThrowError(/predictable development default/);

      expect(() => parseEnv({
        ...baseProdEnv,
        JWT_REFRESH_SECRET: DEV_DEFAULT_REFRESH_SECRET
      })).toThrowError(/predictable development default/);
    });
  });
});
