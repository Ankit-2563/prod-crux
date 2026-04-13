import mongoose, { Schema, Document } from "mongoose";

export interface IBatteryMetric extends Document {
  deviceId: string;
  userId: mongoose.Types.ObjectId | null;
  temperature: number;  // °C
  voltage: number;      // V
  power: number;        // W
  current: number;      // A
  soc: number;          // % (state of charge)
  chargeStatus: "charging" | "discharging" | "idle" | null;
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
    },
    chargeStatus: {
      type: String,
      enum: ["charging", "discharging", "idle"],
      default: null,
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
