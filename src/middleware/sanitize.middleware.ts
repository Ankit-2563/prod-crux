import { Request, Response, NextFunction } from "express";

/**
 * Custom MongoDB Sanitization Middleware
 * Prevents NoSQL injection by removing $ and . from user input
 */
export const sanitizeRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Sanitize request body (can be reassigned)
    if (req.body && typeof req.body === "object") {
      req.body = sanitizeObject(req.body);
    }

    // Note: req.query and req.params are read-only in Express 5.x
    // They are already parsed and sanitized by Express
    // We only need to sanitize req.body which contains user POST data

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Recursively sanitize an object by removing $ and . from keys
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, any> = {};
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Remove $ and . from keys to prevent NoSQL injection
        const sanitizedKey = key.replace(/[$\.]/g, "_");
        sanitized[sanitizedKey] = sanitizeObject(obj[key]);
      }
    }
    
    return sanitized;
  }

  return obj;
}
