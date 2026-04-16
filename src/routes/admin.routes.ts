import { Router, Request, Response } from "express";
import User from "../models/user.model";
import Device from "../models/device.model";
import BatteryMetric from "../models/batteryMetric.model";
import { authenticateAdmin } from "../middleware/adminAuth.middleware";
import { adminSignin } from "../controllers/admin.controller";

const router = Router();

// ── Admin Authentication ────────────────────────────────────────────────
router.post("/signin", adminSignin);

/**
 * A device is considered "active" if it has sent at least one battery reading
 * in the last ACTIVE_WINDOW_MINUTES minutes.
 */
const ACTIVE_WINDOW_MINUTES = 15;

router.get(
  "/stats",
  authenticateAdmin as any,
  async (req: Request, res: Response): Promise<void> => {
  try {
    const activeWindowStart = new Date(
      Date.now() - ACTIVE_WINDOW_MINUTES * 60 * 1000,
    );

    // ── 1. Users ───────────────────────────────────────────────────────────
    const totalUsers = await User.countDocuments();
    const allUsers = await User.find()
      .select("name email createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // ── 2. Devices ─────────────────────────────────────────────────────────
    const totalDevices = await Device.countDocuments();
    const pairedDevices = await Device.countDocuments({ isPaired: true });
    const unpairedDevices = totalDevices - pairedDevices;

    const allDevicesList = await Device.find()
      .populate("userId", "name email")
      .sort({ lastSeen: -1 })
      .lean();

    // ── 3. Active devices (sent data within the active window) ─────────────
    const activeDeviceIdDocs = await BatteryMetric.distinct("deviceId", {
      recordedAt: { $gte: activeWindowStart },
    });

    const activeCount = activeDeviceIdDocs.length;

    // ── 4. Active device details with paired user info ─────────────────────
    const activeDevices = await Device.find({
      deviceId: { $in: activeDeviceIdDocs },
    })
      .select("deviceId deviceName isPaired userId lastSeen firmwareVersion")
      .populate("userId", "name email")
      .lean();

    // ── 5. Shape response ──────────────────────────────────────────────────
    const activeDeviceList = activeDevices.map((d) => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      isPaired: d.isPaired,
      lastSeen: d.lastSeen,
      firmwareVersion: d.firmwareVersion ?? null,
      pairedUser: d.userId
        ? {
            id: (d.userId as any)._id,
            name: (d.userId as any).name,
            email: (d.userId as any).email,
          }
        : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        activeWindowMinutes: ACTIVE_WINDOW_MINUTES,
        users: {
          total: totalUsers,
          list: allUsers.map((u) => ({
            id: u._id,
            name: u.name,
            email: u.email,
            createdAt: u.createdAt,
          })),
        },
        devices: {
          total: totalDevices,
          paired: pairedDevices,
          unpaired: unpairedDevices,
          activeNow: activeCount,
          list: allDevicesList.map((d) => ({
            deviceId: d.deviceId,
            deviceName: d.deviceName,
            isPaired: d.isPaired,
            lastSeen: d.lastSeen,
            firmwareVersion: d.firmwareVersion ?? null,
            owner: d.userId
              ? {
                  id: (d.userId as any)._id,
                  name: (d.userId as any).name,
                  email: (d.userId as any).email,
                }
              : null,
          })),
        },
        activeDevices: activeDeviceList,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error fetching dev stats",
    });
  }
});

export default router;
