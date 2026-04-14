import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/database";
import authRoutes from "./routes/auth.routes";
import hardwareRoutes from "./routes/hardware.routes";
import deviceRoutes from "./routes/device.routes";
import batteryRoutes from "./routes/battery.routes";
import { sanitizeRequest } from "./middleware/sanitize.middleware";

import pinoHttp from "pino-http";
import logger from "./config/logger";

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 4000;

// Security Middleware
app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req: (req) => ({
        method: req.method,
        url: req.url,
        headers: {
          'x-device-id': req.headers['x-device-id'],
          'content-type': req.headers['content-type'],
        },
        ...((['POST', 'PUT', 'PATCH'].includes(req.method)) && req.raw?.body
          ? { body: req.raw.body }
          : {}),
      }),
      res: (res) => ({
        statusCode: res.statusCode,
      }),
    },
    customSuccessMessage: function (req, res) {
      return `${req.method} ${req.url} → ${res.statusCode} (${res.getHeader('x-response-time') || '-'}ms)`;
    },
    customErrorMessage: function (req, res, err) {
      return `${req.method} ${req.url} → ${res.statusCode} ERROR: ${err.message}`;
    },
    customProps: function (req) {
      return {
        responseTime: undefined, // pino-http adds this automatically
      };
    },
  })
);

// CORS — open for React Native & hardware clients (CORS is browser-only)
// Restricted to local dev or explicitly configured origin
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  credentials: true,
};
app.use(cors(corsOptions));

// Body Parser Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Sanitization
app.use(sanitizeRequest);

// Connect to MongoDB
connectDB();

// Health check endpoint (used by Docker healthcheck)
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// Routes
app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Crux Server API", version: "1.0.0" });
});

app.use("/api/auth", authRoutes);
app.use("/api/hardware", hardwareRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/battery", batteryRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error(err);
  res
    .status(500)
    .json({ success: false, message: err.message || "Internal server error" });
});

const server = app.listen(PORT, () => {
  logger.info(`\n[START] Crux Server started on port ${PORT}`);
  logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`   Time: ${new Date().toISOString()}`);
});

// Graceful shutdown for Docker (SIGTERM on container stop)
const gracefulShutdown = (signal: string) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    logger.info("HTTP server closed.");
    mongoose.connection.close().then(() => {
      logger.info("MongoDB connection closed.");
      process.exit(0);
    });
  });

  // Force exit after 10 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
