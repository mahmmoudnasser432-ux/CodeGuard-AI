import { z } from "zod";

export const codeAnalysisRequestSchema = z.object({
  language: z.enum(["javascript", "typescript", "python", "java", "cpp", "csharp", "php"]),
  code: z.string().min(1).max(200_000),
  mode: z.enum(["beginner", "intermediate", "expert"]).default("expert"),
  repositoryContext: z
    .object({
      name: z.string().max(255),
      branch: z.string().max(120).optional(),
      commitSha: z.string().max(64).optional()
    })
    .optional()
});

export type CodeAnalysisRequest = z.infer<typeof codeAnalysisRequestSchema>;
