import { Request, Response } from "express";
import crypto from "crypto";
import Device from "../models/device.model";
import { AuthRequest } from "../middleware/auth.middleware";


// HARDWARE ENDPOINT
// Called by the ESP32 on boot via EC200U AT commands
// POST /api/hardware/register
// Body: { deviceId, deviceSecret, firmwareVersion? }

export const hardwareRegister = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { deviceId, deviceSecret, deviceName, firmwareVersion } = req.body;

    if (!deviceId || !deviceSecret || !deviceName) {
      res.status(400).json({
        success: false,
        message: "deviceId, deviceSecret, and deviceName are required",
      });
      return;
    }

    const secretHash = crypto
      .createHash("sha256")
      .update(deviceSecret)
      .digest("hex");

    let device = await Device.findOne({ deviceId });

    if (!device) {
      // First time this device has ever connected — register it
      device = await Device.create({
        deviceId,
        deviceName,
        deviceSecretHash: secretHash,
        lastSeen: new Date(),
        firmwareVersion: firmwareVersion || null,
      });

      res.status(201).json({
        success: true,
        message: "Device registered successfully",
        data: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          isPaired: device.isPaired,
        },
      });
      return;
    }

    // Device exists — validate secret
    if (device.deviceSecretHash !== secretHash) {
      res.status(401).json({
        success: false,
        message: "Invalid device secret",
      });
      return;
    }

    // Update lastSeen, deviceName, and firmware version
    device.lastSeen = new Date();
    device.deviceName = deviceName;
    if (firmwareVersion) device.firmwareVersion = firmwareVersion;
    await device.save();

    res.status(200).json({
      success: true,
      message: "Device check-in successful",
      data: {
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        isPaired: device.isPaired,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Hardware registration error",
    });
  }
};


// CLIENT ENDPOINT
// Called by the React Native app after the user types in their Device ID
// POST /api/devices/pair
// Headers: Authorization: Bearer <access_token>
// Body: { deviceId }

export const pairDevice = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { deviceId } = req.body;

    if (!deviceId) {
      res.status(400).json({
        success: false,
        message: "deviceId is required",
      });
      return;
    }

    const device = await Device.findOne({ deviceId });

    if (!device) {
      // Device has never checked in with the server yet
      res.status(404).json({
        success: false,
        message:
          "Device not found. Make sure the device is powered on and connected.",
      });
      return;
    }

    if (device.isPaired && device.userId) {
      // Already paired to this same user — idempotent success
      if (device.userId.toString() === req.user!.id) {
        res.status(200).json({
          success: true,
          message: "Device is already paired to your account",
          data: {
            deviceId: device.deviceId,
            isPaired: device.isPaired,
          },
        });
        return;
      }

      // Paired to a DIFFERENT user — reject
      res.status(409).json({
        success: false,
        message: "Device is already paired to another account",
      });
      return;
    }

    // Pair device to this user
    device.userId = new (require("mongoose").Types.ObjectId)(req.user!.id);
    device.isPaired = true;
    await device.save();

    res.status(200).json({
      success: true,
      message: "Device paired successfully",
      data: {
        deviceId: device.deviceId,
        isPaired: device.isPaired,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Device pairing error",
    });
  }
};


// CLIENT ENDPOINT
// Get all devices for the logged-in user
// GET /api/devices
// Headers: Authorization: Bearer <access_token>

export const getMyDevices = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const devices = await Device.find({ userId: req.user!.id }).select(
      "-deviceSecretHash",
    );

    res.status(200).json({
      success: true,
      data: { devices },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching devices",
    });
  }
};


// CLIENT ENDPOINT
// Unpair a device from the user's account
// DELETE /api/devices/:deviceId
// Headers: Authorization: Bearer <access_token>

export const unpairDevice = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOne({ deviceId });

    if (!device) {
      res.status(404).json({ success: false, message: "Device not found" });
      return;
    }

    if (!device.userId || device.userId.toString() !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: "You do not own this device",
      });
      return;
    }

    device.userId = undefined;
    device.isPaired = false;
    await device.save();

    res.status(200).json({
      success: true,
      message: "Device unpaired successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error unpairing device",
    });
  }
};
