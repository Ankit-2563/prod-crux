import { Router } from "express";
import {
  getBatteryMetrics,
  getDeviceTemperature,
  getDevicePower,
  getDeviceVoltage,
  getDeviceCurrent,
  getDeviceSoc,
  getDeviceAllMetrics,
  getAllDevicesLatest,
} from "../controllers/battery.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

// Dashboard: latest reading for ALL user's devices
router.get("/", authenticate, getAllDevicesLatest);

// Per-device: paginated list of readings
router.get("/:deviceId", authenticate, getBatteryMetrics);

// Per-device: focused latest readings for specific metrics
router.get("/:deviceId/temperature", authenticate, getDeviceTemperature);
router.get("/:deviceId/power", authenticate, getDevicePower);
router.get("/:deviceId/voltage", authenticate, getDeviceVoltage);
router.get("/:deviceId/current", authenticate, getDeviceCurrent);
router.get("/:deviceId/soc", authenticate, getDeviceSoc);
router.get("/:deviceId/all", authenticate, getDeviceAllMetrics);

export default router;
