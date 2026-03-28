import { Router } from "express";
import {
  pairDevice,
  getMyDevices,
  unpairDevice,
} from "../controllers/device.controller";
import { authenticate } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  pairDeviceSchema,
} from "../validators/device.schema";

const router = Router();

// Client Routes
router.post(
  "/pair",
  authenticate,
  validate(pairDeviceSchema),
  pairDevice,
);
router.get("/", authenticate, getMyDevices);
router.delete("/:deviceId", authenticate, unpairDevice);

export default router;
