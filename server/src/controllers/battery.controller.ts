import { Request, Response } from "express";
import crypto from "crypto";
import Device from "../models/device.model";
import BatteryMetric from "../models/batteryMetric.model";
import { AuthRequest } from "../middleware/auth.middleware";

// ─────────────────────────────────────────────
// HARDWARE ENDPOINT
// Called by the ESP32 periodically to push sensor readings
// POST /api/hardware/data
// Body: { deviceId, deviceSecret, temperature, voltage, power, current, soc, soh, recordedAt? }
// ─────────────────────────────────────────────
export const receiveBatteryData = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const {
      deviceId,
      deviceSecret,
      temperature,
      voltage,
      power,
      current,
      soc,
      soh,
      recordedAt,
    } = req.body;

    // ── 1. Authenticate device ──────────────────────────────────────────────
    const device = await Device.findOne({ deviceId });

    if (!device) {
      res.status(404).json({
        success: false,
        message: "Device not found. Register the device first.",
      });
      return;
    }

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

    // ── 2. Save metric ──────────────────────────────────────────────────────
    const metric = await BatteryMetric.create({
      deviceId,
      userId: device.userId ?? undefined,
      temperature,
      voltage,
      power,
      current,
      soc,
      soh,
      recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
    });

    // ── 3. Update device lastSeen ───────────────────────────────────────────
    device.lastSeen = new Date();
    await device.save();

    res.status(201).json({
      success: true,
      message: "Battery data recorded",
      data: {
        id: metric._id,
        deviceId: metric.deviceId,
        recordedAt: metric.recordedAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error storing battery data",
    });
  }
};

// ─────────────────────────────────────────────
// CLIENT ENDPOINT
// Fetch battery readings for a device owned by the logged-in user
// GET /api/battery/:deviceId?limit=100&page=1
// Headers: Authorization: Bearer <access_token>
// ─────────────────────────────────────────────
export const getBatteryMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { deviceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const page = Math.max(parseInt(req.query.page as string) || 1, 1);
    const skip = (page - 1) * limit;

    // ── 1. Verify user owns this device ────────────────────────────────────
    const device = await Device.findOne({ deviceId });

    if (!device) {
      res.status(404).json({
        success: false,
        message: "Device not found",
      });
      return;
    }

    if (!device.userId || device.userId.toString() !== req.user!.id) {
      res.status(403).json({
        success: false,
        message: "You do not own this device",
      });
      return;
    }

    // ── 2. Fetch paginated readings ─────────────────────────────────────────
    const [metrics, total] = await Promise.all([
      BatteryMetric.find({ deviceId })
        .sort({ recordedAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("-__v"),
      BatteryMetric.countDocuments({ deviceId }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        metrics,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching battery metrics",
    });
  }
};

// ─────────────────────────────────────────────
// CLIENT ENDPOINT
// Get the latest single reading for a device
// GET /api/battery/:deviceId/latest
// Headers: Authorization: Bearer <access_token>
// ─────────────────────────────────────────────
export const getLatestBatteryMetric = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { deviceId } = req.params;

    // Verify ownership
    const device = await Device.findOne({ deviceId });

    if (!device) {
      res.status(404).json({ success: false, message: "Device not found" });
      return;
    }

    if (!device.userId || device.userId.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: "You do not own this device" });
      return;
    }

    const latest = await BatteryMetric.findOne({ deviceId })
      .sort({ recordedAt: -1 })
      .select("-__v");

    if (!latest) {
      res.status(404).json({ success: false, message: "No data recorded yet for this device" });
      return;
    }

    res.status(200).json({
      success: true,
      data: { metric: latest },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching latest metric",
    });
  }
};
