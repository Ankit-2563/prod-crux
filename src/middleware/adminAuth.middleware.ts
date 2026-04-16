import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import Admin from "../models/admin.model";

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_JWT_SECRET) {
  throw new Error("ADMIN_JWT_SECRET not defined in environment");
}

export interface AdminAuthRequest extends Request {
  admin?: {
    id: string;
    name: string;
    email: string;
  };
}

/**
 * Middleware to authenticate administrators using a dedicated admin JWT.
 */
export const authenticateAdmin = async (
  req: AdminAuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "No admin token provided. Authorization denied.",
      });
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({
        success: false,
        message: "No admin token provided. Authorization denied.",
      });
      return;
    }

    // Verify token using admin secret
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as { adminId: string };

    // Check if admin exists in database
    const admin = await Admin.findById(decoded.adminId).select("-password");

    if (!admin) {
      res.status(401).json({
        success: false,
        message: "Admin account not found. Token invalid.",
      });
      return;
    }

    // Attach admin to request object
    req.admin = {
      id: admin._id.toString(),
      name: admin.name,
      email: admin.email,
    };

    next();
  } catch (error: any) {
    if (error.name === "JsonWebTokenError") {
      res.status(401).json({
        success: false,
        message: "Invalid admin token.",
      });
      return;
    }

    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        message: "Admin token expired.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Admin authentication error.",
    });
  }
};
