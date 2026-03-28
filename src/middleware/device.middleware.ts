import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import Device, { IDevice } from "../models/device.model";

// Extend Express Request to include the authenticated device
export interface DeviceRequest extends Request {
  device?: IDevice;
}

/**
 * Device Authentication Middleware
 *
 * Reads `x-device-id` and `x-device-secret` from request headers,
 * verifies the device exists and the secret matches, then attaches
 * the device document to `req.device` for downstream handlers.
 */
export const authenticateDevice = async (
  req: DeviceRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const deviceId = req.headers["x-device-id"] as string | undefined;
    const deviceSecret = req.headers["x-device-secret"] as string | undefined;

    if (!deviceId || !deviceSecret) {
      res.status(400).json({
        success: false,
        message:
          "x-device-id and x-device-secret headers are required",
      });
      return;
    }

    // Look up the device
    const device = await Device.findOne({ deviceId });

    if (!device) {
      res.status(404).json({
        success: false,
        message: "Device not found. Register the device first.",
      });
      return;
    }

    // Verify the secret
    const secretHash = crypto
      .createHash("sha256")
      .update(deviceSecret)
      .digest("hex");

    if (device.deviceSecretHash !== secretHash) {
      res.status(401).json({
        success: false,
        message: "Invalid device secret",
      });
      return;
    }

    // Attach authenticated device to request
    req.device = device;

    next();
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Device authentication error",
    });
  }
};
