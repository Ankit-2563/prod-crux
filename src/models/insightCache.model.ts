import mongoose, { Schema, Document } from "mongoose";

export interface IInsightCache extends Document {
  deviceId: string;
  data: {
    insight: Record<string, any>;
    source: "ai" | "heuristic";
    providerUsed: "openai" | "gemini" | "none";
    summary: Record<string, any>;
  };
  createdAt: Date;
  expiresAt: Date;
}

const insightCacheSchema = new Schema<IInsightCache>(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // MongoDB TTL index — auto-deletes expired docs
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model<IInsightCache>("InsightCache", insightCacheSchema);
