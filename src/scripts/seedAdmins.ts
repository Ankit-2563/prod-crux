import mongoose from "mongoose";
import bcrypt from "bcrypt";
import dotenv from "dotenv";
import Admin from "../models/admin.model";
import connectDB from "../config/database";

dotenv.config();

const seedAdmins = async () => {
  try {
    await connectDB();

    const adminEmail = process.env.SEED_ADMIN_EMAIL;
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    const adminName = process.env.SEED_ADMIN_NAME;

    if (!adminEmail || !adminPassword || !adminName) {
      console.error(
        "Error: Missing required environment variables: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME",
      );
      process.exit(1);
    }

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (existingAdmin) {
      console.log(`Admin with email ${adminEmail} already exists.`);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    // Create admin
    await Admin.create({
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
    });

    console.log(`Successfully seeded admin: ${adminEmail}`);
    process.exit(0);
  } catch (error) {
    console.error("Error seeding admins:", error);
    process.exit(1);
  }
};

seedAdmins();
