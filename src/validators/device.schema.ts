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
  deviceName: z
    .string()
    .min(1, "deviceName is required")
    .max(128, "deviceName too long")
    .trim(),
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

// Hardware: sensor readings sent by authenticated device
// (deviceId & deviceSecret are now in headers, handled by middleware)
export const batteryDataSchema = z.object({
  temperature: z.number({ message: "temperature must be a number" }),
  voltage: z.number({ message: "voltage must be a number" }),
  power: z.number({ message: "power must be a number" }),
  current: z.number({ message: "current must be a number" }),
  soc: z.number({ message: "soc must be a number" }),
  recordedAt: z.union([z.string().datetime(), z.number().int().positive()]).optional(),
});

export type HardwareRegisterInput = z.infer<typeof hardwareRegisterSchema>;
export type PairDeviceInput = z.infer<typeof pairDeviceSchema>;
export type BatteryDataInput = z.infer<typeof batteryDataSchema>;
