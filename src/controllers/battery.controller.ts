import { Request, Response } from "express";
import Device from "../models/device.model";
import BatteryMetric from "../models/batteryMetric.model";
import { AuthRequest } from "../middleware/auth.middleware";
import { DeviceRequest } from "../middleware/device.middleware";
import { getBatteryHealthInsight } from "../services/batteryHealthInsight.service";

// ─────────────────────────────────────────────
// HARDWARE ENDPOINT
// Called by the ESP32 periodically to push sensor readings
// POST /api/hardware/data
// Headers: x-device-id, x-device-secret (authenticated by middleware)
// Body: { temperature, voltage, power, current, soc, recordedAt? }
// ─────────────────────────────────────────────
export const receiveBatteryData = async (
  req: DeviceRequest,
  res: Response,
): Promise<void> => {
  try {
    const device = req.device!;

    const {
      temperature,
      voltage,
      power,
      current,
      soc,
      recordedAt,
    } = req.body;

    // ── 1. Save metric ──────────────────────────────────────────────────────
    const metric = await BatteryMetric.create({
      deviceId: device.deviceId,
      userId: device.userId ?? undefined,
      temperature,
      voltage,
      power,
      current,
      soc,
      recordedAt: recordedAt
        ? (typeof recordedAt === "number"
            ? new Date(recordedAt * 1000)   // firmware sends unix seconds
            : new Date(recordedAt))         // ISO string from future clients
        : new Date(),
    });

    // ── 2. Update device lastSeen ───────────────────────────────────────────
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
// CLIENT ENDPOINTS for specific metrics
// GET /api/battery/:deviceId/<metric>
// Headers: Authorization: Bearer <access_token>
// ─────────────────────────────────────────────

const getLatestDeviceField = async (
  req: AuthRequest,
  res: Response,
  field: "temperature" | "power" | "voltage" | "current" | "soc" | "chargeStatus"
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
      .select(`deviceId recordedAt ${field}`)
      .lean();

    if (!latest) {
      res.status(404).json({ success: false, message: "No data recorded yet for this device" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        deviceId: latest.deviceId,
        recordedAt: latest.recordedAt,
        [field]: latest[field],
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || `Error fetching latest ${field}`,
    });
  }
};

export const getDeviceTemperature = async (req: AuthRequest, res: Response): Promise<void> => { await getLatestDeviceField(req, res, "temperature"); };
export const getDevicePower = async (req: AuthRequest, res: Response): Promise<void> => { await getLatestDeviceField(req, res, "power"); };
export const getDeviceVoltage = async (req: AuthRequest, res: Response): Promise<void> => { await getLatestDeviceField(req, res, "voltage"); };
export const getDeviceCurrent = async (req: AuthRequest, res: Response): Promise<void> => { await getLatestDeviceField(req, res, "current"); };
export const getDeviceSoc = async (req: AuthRequest, res: Response): Promise<void> => { await getLatestDeviceField(req, res, "soc"); };

export const getDeviceAllMetrics = async (req: AuthRequest, res: Response): Promise<void> => {
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
      .select("deviceId recordedAt temperature power voltage current soc chargeStatus")
      .lean();

    if (!latest) {
      res.status(404).json({ success: false, message: "No data recorded yet for this device" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        deviceId: latest.deviceId,
        recordedAt: latest.recordedAt,
        temperature: latest.temperature,
        power: latest.power,
        voltage: latest.voltage,
        current: latest.current,
        soc: latest.soc,
        chargeStatus: latest.chargeStatus ?? null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching latest metrics",
    });
  }
};

export const getDeviceHealthInsight = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const deviceIdParam = req.params.deviceId;
    const deviceId = Array.isArray(deviceIdParam) ? deviceIdParam[0] : deviceIdParam;

    const device = await Device.findOne({ deviceId });
    if (!device) {
      res.status(404).json({ success: false, message: "Device not found" });
      return;
    }

    if (!device.userId || device.userId.toString() !== req.user!.id) {
      res.status(403).json({ success: false, message: "You do not own this device" });
      return;
    }

    const result = await getBatteryHealthInsight(deviceId);

    res.status(200).json({
      success: true,
      data: {
        deviceId,
        generatedAt: new Date().toISOString(),
        source: result.source,
        providerUsed: result.providerUsed,
        insight: result.insight,
        telemetrySummary: result.summary,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error generating battery health insight",
    });
  }
};


// CLIENT ENDPOINT
// Dashboard overview — latest reading for ALL devices owned by user
// GET /api/battery
// Headers: Authorization: Bearer <access_token>

export const getAllDevicesLatest = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const devices = await Device.find({ userId: req.user!.id, isPaired: true }).select("deviceId lastSeen");

    if (!devices.length) {
      res.status(200).json({ success: true, data: { devices: [] } });
      return;
    }

    const deviceIds = devices.map((d) => d.deviceId);

    // Get the most recent metric per device in one aggregation
    const latestMetrics = await BatteryMetric.aggregate([
      { $match: { deviceId: { $in: deviceIds } } },
      { $sort: { recordedAt: -1 } },
      { $group: { _id: "$deviceId", metric: { $first: "$$ROOT" } } },
    ]);

    const metricMap: Record<string, any> = {};
    latestMetrics.forEach((m) => { metricMap[m._id] = m.metric; });

    const result = devices.map((d) => ({
      deviceId: d.deviceId,
      lastSeen: d.lastSeen,
      latestMetric: metricMap[d.deviceId] || null,
    }));

    res.status(200).json({ success: true, data: { devices: result } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error fetching device overview" });
  }
};
