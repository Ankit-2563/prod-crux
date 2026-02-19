import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import User from "../models/user.model";
import TokenBlacklist from "../models/tokenBlacklist.model";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET not defined");
}

// Extend Express Request to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

// JWT Authentication Middleware
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "No token provided. Authorization denied.",
      });
      return;
    }

    // Extract token
    const token = authHeader.substring(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({
        success: false,
        message: "No token provided. Authorization denied.",
      });
      return;
    }

    // Check if token is blacklisted (user logged out)
    const blacklistedToken = await TokenBlacklist.findOne({ token });
    if (blacklistedToken) {
      res.status(401).json({
        success: false,
        message: "Token has been invalidated. Please login again.",
      });
      return;
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };

    // Get user from database
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      res.status(401).json({
        success: false,
        message: "User not found. Token invalid.",
      });
      return;
    }

    // Attach user to request object
    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    };

    next();
  } catch (error: any) {
    if (error.name === "JsonWebTokenError") {
      res.status(401).json({
        success: false,
        message: "Invalid token.",
      });
      return;
    }
    
    if (error.name === "TokenExpiredError") {
      res.status(401).json({
        success: false,
        message: "Token expired.",
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: "Authentication error.",
    });
  }
};

