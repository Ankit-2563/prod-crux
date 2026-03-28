import mongoose, { Schema, Document } from "mongoose";
import crypto from "crypto";

export interface IDevice extends Document {
  deviceId: string;
  deviceName: string;
  deviceSecretHash: string;
  userId?: mongoose.Types.ObjectId;
  isPaired: boolean;
  lastSeen?: Date;
  firmwareVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

const deviceSchema = new Schema<IDevice>(
  {
    deviceId: {
      type: String,
      required: [true, "Device ID is required"],
      unique: true,
      trim: true,
      index: true,
    },
    deviceName: {
      type: String,
      required: [true, "Device name is required"],
      trim: true,
    },
    deviceSecretHash: {
      type: String,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    isPaired: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: null,
    },
    firmwareVersion: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Static helper to hash a secret before storing/comparing
deviceSchema.statics.hashSecret = (secret: string): string => {
  return crypto.createHash("sha256").update(secret).digest("hex");
};

export default mongoose.model<IDevice>("Device", deviceSchema);
