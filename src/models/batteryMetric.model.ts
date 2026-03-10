import mongoose, { Schema, Document } from "mongoose";

export interface IBatteryMetric extends Document {
  deviceId: string;
  userId: mongoose.Types.ObjectId | null;
  temperature: number;  // °C
  voltage: number;      // V
  power: number;        // W
  current: number;      // A
  soc: number;          // % State of Charge (0–100)
  soh: number;          // % State of Health (0–100)
  recordedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const batteryMetricSchema = new Schema<IBatteryMetric>(
  {
    deviceId: {
      type: String,
      required: [true, "deviceId is required"],
      trim: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    temperature: {
      type: Number,
      required: [true, "temperature is required"],
    },
    voltage: {
      type: Number,
      required: [true, "voltage is required"],
    },
    power: {
      type: Number,
      required: [true, "power is required"],
    },
    current: {
      type: Number,
      required: [true, "current is required"],
    },
    soc: {
      type: Number,
      required: [true, "soc is required"],
      min: [0, "SOC cannot be below 0"],
      max: [100, "SOC cannot exceed 100"],
    },
    soh: {
      type: Number,
      required: [true, "soh is required"],
      min: [0, "SOH cannot be below 0"],
      max: [100, "SOH cannot exceed 100"],
    },
    recordedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient per-device time-series queries
batteryMetricSchema.index({ deviceId: 1, recordedAt: -1 });

export default mongoose.model<IBatteryMetric>("BatteryMetric", batteryMetricSchema);
