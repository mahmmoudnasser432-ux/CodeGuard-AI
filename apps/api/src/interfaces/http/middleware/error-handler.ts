import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../../../config/env.js";

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      details: error.flatten()
    });
    return;
  }

  const requestId = (req as any).id || req.header("x-request-id");
  if ((req as any).log) {
    (req as any).log.error({ err: error, requestId }, "Unhandled internal server error");
  } else {
    console.error(`[Internal Server Error] Request ID: ${requestId ?? "none"}`, error);
  }

  if ((error as any).type === "entity.too.large" || (error as any).status === 413 || (error as any).statusCode === 413) {
    res.status(413).json({
      error: "PAYLOAD_TOO_LARGE",
      message: "Request payload exceeded size limit.",
      ...(requestId && { requestId: String(requestId) })
    });
    return;
  }

  const isProd = (process.env.NODE_ENV || env.NODE_ENV) === "production";

  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: isProd ? "An unexpected internal server error occurred." : (error.message || "Internal server error"),
    ...(requestId && { requestId: String(requestId) })
  });
};
