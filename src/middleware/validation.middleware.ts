import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

// Generic validation middleware
export const validate = (schema: ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate request body against schema
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod errors into user-friendly messages
        const errors = error.issues.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
        });
        return;
      }

      // Unknown error
      res.status(500).json({
        success: false,
        message: "Validation error",
      });
    }
  };
};

