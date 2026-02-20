import { Router } from "express";
import {
  receiveBatteryData,
  getBatteryMetrics,
  getLatestBatteryMetric,
} from "../controllers/battery.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { batteryDataSchema } from "../validators/device.schema";

const router = Router();

// ─── Hardware Routes (called by ESP32 via EC200U) ───────────────────────────
// No user JWT — device authenticates with its own deviceId + deviceSecret
router.post("/hardware/data", validate(batteryDataSchema), receiveBatteryData);

// ─── Client Routes (called by app) ──────────────────────────────────────────
router.get("/battery/:deviceId", authenticate, getBatteryMetrics);
router.get("/battery/:deviceId/latest", authenticate, getLatestBatteryMetric);

export default router;
