import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import connectDB from "./config/database";
import authRoutes from "./routes/auth.routes";
import { sanitizeRequest } from "./middleware/sanitize.middleware";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Security Middleware
app.use(helmet()); // Security headers

// CORS Configuration - Whitelist specific origins
const corsOptions = {
  origin: process.env.CLIENT_URL || "http://localhost:3000",
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Sanitization - Prevent NoSQL injection
app.use(sanitizeRequest);

// Connect to MongoDB
connectDB();

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Crux Server API",
    version: "1.0.0",
  });
});

app.use("/api/auth", authRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

