import mongoose, { Schema, Document } from "mongoose";

export interface IRefreshToken extends Document {
  userId: mongoose.Types.ObjectId;
  token: string;
  deviceInfo: {
    userAgent?: string;
    ip?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deviceInfo: {
      userAgent: {
        type: String,
      },
      ip: {
        type: String,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Auto-delete tokens older than 30 days (cleanup)
refreshTokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 }); // 30 days

export default mongoose.model<IRefreshToken>("RefreshToken", refreshTokenSchema);
