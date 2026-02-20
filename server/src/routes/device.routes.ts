import { Router } from "express";
import {
  hardwareRegister,
  pairDevice,
  getMyDevices,
  unpairDevice,
} from "../controllers/device.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  hardwareRegisterSchema,
  pairDeviceSchema,
} from "../validators/device.schema";

const router = Router();

// ─── Hardware Routes (called by ESP32 via EC200U) ───────────────────────────
// No user auth — device authenticates with its own secret
router.post(
  "/hardware/register",
  validate(hardwareRegisterSchema),
  hardwareRegister,
);

// ─── Client Routes (called by React Native app) ──────────────────────────────
router.post(
  "/devices/pair",
  authenticate,
  validate(pairDeviceSchema),
  pairDevice,
);
router.get("/devices", authenticate, getMyDevices);
router.delete("/devices/:deviceId", authenticate, unpairDevice);

export default router;
