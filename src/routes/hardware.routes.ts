import { Router } from "express";
import { hardwareRegister } from "../controllers/device.controller";
import { receiveBatteryData } from "../controllers/battery.controller";
import { authenticateDevice } from "../middleware/device.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  hardwareRegisterSchema,
  batteryDataSchema,
} from "../validators/device.schema";

const router = Router();

// Hardware Registration (No user auth — device self-registers)
router.post(
  "/register",
  validate(hardwareRegisterSchema),
  hardwareRegister,
);

// Hardware Data Ingestion (Device authenticates via headers)
router.post(
  "/data",
  authenticateDevice,
  validate(batteryDataSchema),
  receiveBatteryData,
);

export default router;
