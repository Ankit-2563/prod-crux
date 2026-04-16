import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import Admin from "../models/admin.model";

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_JWT_SECRET) {
  throw new Error("ADMIN_JWT_SECRET not defined in environment");
}

/**
 * Admin Sign-in
 */
export const adminSignin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    // Find admin in the database
    const admin = await Admin.findOne({ email });
    if (!admin) {
      res.status(401).json({
        success: false,
        message: "Invalid admin email or password",
      });
      return;
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Invalid admin email or password",
      });
      return;
    }

    // Generate admin access token (short lived for security)
    const adminToken = jwt.sign({ adminId: admin._id }, ADMIN_JWT_SECRET, {
      expiresIn: "2h",
    });

    res.status(200).json({
      success: true,
      message: "Admin login successful",
      data: {
        admin: {
          id: admin._id,
          name: admin.name,
          email: admin.email,
        },
        token: adminToken,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error during admin sign-in",
    });
  }
};
