import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "VALIDATION_FAILED",
      details: error.flatten()
    });
    return;
  }

  res.status(500).json({
    error: "INTERNAL_SERVER_ERROR",
    message: "The request could not be completed."
  });
};
