import { z } from "zod";

// Hardware: device sending its credentials on boot
export const hardwareRegisterSchema = z.object({
  deviceId: z
    .string()
    .min(1, "deviceId is required")
    .max(64, "deviceId too long")
    .trim(),
  deviceSecret: z
    .string()
    .min(8, "deviceSecret must be at least 8 characters")
    .max(128, "deviceSecret too long"),
  firmwareVersion: z.string().max(32).optional(),
});
 
// Client: user entering a device ID to pair
export const pairDeviceSchema = z.object({
  deviceId: z
    .string()
    .min(1, "deviceId is required")
    .max(64, "deviceId too long")
    .trim(),
});

// Hardware: device sending sensor readings
export const batteryDataSchema = z.object({
  deviceId: z
    .string()
    .min(1, "deviceId is required")
    .max(64, "deviceId too long")
    .trim(),
  deviceSecret: z
    .string()
    .min(8, "deviceSecret must be at least 8 characters")
    .max(128, "deviceSecret too long"),
  temperature: z.number({ message: "temperature must be a number" }),
  voltage: z.number({ message: "voltage must be a number" }),
  power: z.number({ message: "power must be a number" }),
  current: z.number({ message: "current must be a number" }),
  soc: z
    .number({ message: "soc must be a number" })
    .min(0, "SOC cannot be below 0")
    .max(100, "SOC cannot exceed 100"),
  soh: z
    .number({ message: "soh must be a number" })
    .min(0, "SOH cannot be below 0")
    .max(100, "SOH cannot exceed 100"),
  recordedAt: z.string().datetime().optional(),
});

export type HardwareRegisterInput = z.infer<typeof hardwareRegisterSchema>;
export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;
export type BatteryDataInput = z.infer<typeof batteryDataSchema>;
