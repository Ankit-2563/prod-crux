import { Router } from "express";
import {
  receiveBatteryData,
  getBatteryMetrics,
  getDeviceTemperature,
  getDevicePower,
  getDeviceVoltage,
  getDeviceCurrent,
  getAllDevicesLatest,
} from "../controllers/battery.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { batteryDataSchema } from "../validators/device.schema";

const router = Router();

//Hardware Routes (ESP32 via EC200U) 
router.post("/hardware/data", validate(batteryDataSchema), receiveBatteryData);

//Client Routes 

// Dashboard: latest reading for ALL user's devices
router.get("/battery", authenticate, getAllDevicesLatest);

// Per-device: paginated list of readings
router.get("/battery/:deviceId", authenticate, getBatteryMetrics);

// Per-device: focused latest readings for specific metrics
router.get("/battery/:deviceId/temperature", authenticate, getDeviceTemperature);
router.get("/battery/:deviceId/power", authenticate, getDevicePower);
router.get("/battery/:deviceId/voltage", authenticate, getDeviceVoltage);
router.get("/battery/:deviceId/current", authenticate, getDeviceCurrent);

export default router;
