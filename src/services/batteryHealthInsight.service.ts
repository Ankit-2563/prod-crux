import { z } from "zod";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import BatteryMetric, { IBatteryMetric } from "../models/batteryMetric.model";
import InsightCache from "../models/insightCache.model";

// ─── Factory Thresholds (MVP) ────────────────────────────────────────────────
// Based on 18650 3S BMS battery pack:
//   Nominal Voltage : 11.1 V
//   Full Charge     : 12.6 V
//   Discharge CutOff:  9.0 V
//   Capacity        : 8000 mAh
// These are hard-coded for the MVP. In the future they can be stored per-device
// in MongoDB and made configurable via a settings API.
// ─────────────────────────────────────────────────────────────────────────────

export const FACTORY_THRESHOLDS = {
  /** Max safe temperature (°C) — above this is dangerous */
  temperature: 60,
  /** Min safe voltage (V) — below this the BMS should cut off */
  voltage: 9,
  /** Max safe continuous current (A) — 3A and above is considered overcurrent */
  current: 3,
  /** Max safe power draw (W) — above 40W is considered overload */
  power: 40,
} as const;

type HealthLevel = "good" | "moderate" | "poor";
type ConfidenceLevel = "low" | "medium" | "high";

interface BatteryFeatureSummary {
  sampleCount: number;
  windowDays: number;
  avgTemperatureC: number;
  maxTemperatureC: number;
  avgSoc: number;
  avgVoltage: number;
  deepDischargeEvents: number;
  highTemperatureRatio: number;
  avgAbsoluteCurrentA: number;
  overTemperatureEvents: number;
  underVoltageEvents: number;
  overCurrentEvents: number;
  overPowerEvents: number;
  latest: {
    temperature: number;
    soc: number;
    voltage: number;
    current: number;
    power: number;
    recordedAt: Date;
  };
  stressScore: number;
  confidence: ConfidenceLevel;
  estimatedMonthsTo80: number;
  thresholds: typeof FACTORY_THRESHOLDS;
}

export interface BatteryHealthInsight {
  averageTemperature: number;
  averageVoltage: number;
  averageCurrent: number;
  averageSoc: number;
  recommendation: string;
}

const insightSchema = z.object({
  averageTemperature: z.number(),
  averageVoltage: z.number(),
  averageCurrent: z.number(),
  averageSoc: z.number(),
  recommendation: z.string().min(1),
});

const round = (value: number, digits = 2): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const safeAvg = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
};

const buildFeatureSummary = (metrics: IBatteryMetric[]): BatteryFeatureSummary => {
  const sorted = [...metrics].sort(
    (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  );

  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  const windowMs = Math.max(
    new Date(latest.recordedAt).getTime() - new Date(first.recordedAt).getTime(),
    1,
  );
  const windowDays = windowMs / (1000 * 60 * 60 * 24);

  const temperatures = sorted.map((m) => m.temperature);
  const socValues = sorted.map((m) => m.soc);
  const absCurrents = sorted.map((m) => Math.abs(m.current));
  const voltages = sorted.map((m) => m.voltage);
  const powers = sorted.map((m) => Math.abs(m.power));

  // Threshold-based event counting
  const overTemperatureEvents = temperatures.filter(
    (t) => t >= FACTORY_THRESHOLDS.temperature,
  ).length;
  const underVoltageEvents = voltages.filter(
    (v) => v <= FACTORY_THRESHOLDS.voltage,
  ).length;
  const overCurrentEvents = absCurrents.filter(
    (i) => i >= FACTORY_THRESHOLDS.current,
  ).length;
  const overPowerEvents = powers.filter(
    (p) => p >= FACTORY_THRESHOLDS.power,
  ).length;

  const highTempCount = temperatures.filter((t) => t >= 40).length;
  const deepDischargeEvents = socValues.filter((s) => s <= 10).length;
  const highTemperatureRatio = highTempCount / sorted.length;
  const deepDischargeRatio = deepDischargeEvents / sorted.length;
  const avgCurrent = safeAvg(absCurrents);

  // Threshold violation ratios feed into stress
  const overTempRatio = overTemperatureEvents / sorted.length;
  const underVoltRatio = underVoltageEvents / sorted.length;
  const overCurrentRatio = overCurrentEvents / sorted.length;
  const overPowerRatio = overPowerEvents / sorted.length;

  // Current stress normalized to the 3A factory threshold
  const currentStressNorm = clamp(avgCurrent / FACTORY_THRESHOLDS.current, 0, 1);

  // Composite stress now incorporates factory threshold violations
  const stressComposite = clamp(
    0.25 * highTemperatureRatio +
    0.15 * deepDischargeRatio +
    0.10 * currentStressNorm +
    0.15 * overTempRatio +
    0.15 * underVoltRatio +
    0.10 * overCurrentRatio +
    0.10 * overPowerRatio,
    0,
    1,
  );
  const stressScore = round(100 * stressComposite, 2);

  const estimatedMonthsTo80 = clamp(48 - stressScore * 0.35, 6, 72);

  let confidence: ConfidenceLevel = "low";
  if (sorted.length >= 120 && windowDays >= 30) confidence = "medium";
  if (sorted.length >= 500 && windowDays >= 90) confidence = "high";

  return {
    sampleCount: sorted.length,
    windowDays: round(windowDays, 2),
    avgTemperatureC: round(safeAvg(temperatures), 2),
    maxTemperatureC: round(Math.max(...temperatures), 2),
    avgSoc: round(safeAvg(socValues), 2),
    avgVoltage: round(safeAvg(voltages), 2),
    deepDischargeEvents,
    highTemperatureRatio: round(highTemperatureRatio, 4),
    avgAbsoluteCurrentA: round(avgCurrent, 3),
    overTemperatureEvents,
    underVoltageEvents,
    overCurrentEvents,
    overPowerEvents,
    latest: {
      temperature: latest.temperature,
      soc: latest.soc,
      voltage: latest.voltage,
      current: latest.current,
      power: latest.power,
      recordedAt: latest.recordedAt,
    },
    stressScore: round(stressScore, 2),
    confidence,
    estimatedMonthsTo80: round(estimatedMonthsTo80, 1),
    thresholds: FACTORY_THRESHOLDS,
  };
};

const buildDeterministicInsight = (
  deviceId: string,
  summary: BatteryFeatureSummary,
): BatteryHealthInsight => {
  return {
    averageTemperature: summary.avgTemperatureC,
    averageVoltage: summary.avgVoltage,
    averageCurrent: summary.avgAbsoluteCurrentA,
    averageSoc: summary.avgSoc,
    recommendation: "Keep temperature below 60°C and maintain SOC between 20% and 80% for optimal battery life.",
  };
};

const buildPrompt = (deviceId: string, f: BatteryFeatureSummary): string => {
  const data = `avgVoltage=${f.avgVoltage} avgTemperature=${f.avgTemperatureC} avgCurrent=${f.avgAbsoluteCurrentA} avgSoc=${f.avgSoc}`;

  return `Battery diagnostics. JSON only, no markdown. Use only provided data. Make the recommendation a short, single paragraph.
${data}
Schema:{"averageTemperature": number, "averageVoltage": number, "averageCurrent": number, "averageSoc": number, "recommendation": "string"}`;
};

const parseJsonSafely = (raw: string): unknown => {
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
};

const callOpenAI = async (prompt: string): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a precise battery diagnostics assistant. Return JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");
  return content;
};

const callGemini = async (prompt: string): Promise<string> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const model = process.env.GEMINI_MODEL || "gemini-3-flash-preview";

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: "application/json",
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL,
      },
    },
  });

  const content = response.text;
  if (!content) throw new Error("Gemini returned empty content");
  return content;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

const generateAIInsight = async (
  provider: "openai" | "gemini",
  prompt: string,
): Promise<BatteryHealthInsight> => {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const raw = provider === "openai" ? await callOpenAI(prompt) : await callGemini(prompt);
      const parsed = parseJsonSafely(raw);
      return insightSchema.parse(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const isRateLimit = lastError.message.includes("429") || lastError.message.includes("RESOURCE_EXHAUSTED");

      if (!isRateLimit || attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
      console.warn(`[BatteryInsight] Rate-limited (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw lastError ?? new Error("AI insight generation failed after retries");
};

// ─── MongoDB-backed insight cache ────────────────────────────────────────────
// Replaces the old in-memory Map cache. Benefits:
//   1. Survives server restarts and deploys
//   2. Works across multiple server instances (horizontal scaling)
//   3. MongoDB TTL index auto-purges expired entries — zero manual eviction
//   4. No memory pressure on the Node.js process
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Clear cache for a specific device (useful after new data ingestion) */
export const clearInsightCache = async (deviceId?: string): Promise<void> => {
  if (deviceId) {
    await InsightCache.deleteOne({ deviceId });
  } else {
    await InsightCache.deleteMany({});
  }
};

export const getBatteryHealthInsight = async (deviceId: string): Promise<{
  insight: BatteryHealthInsight;
  source: "ai" | "heuristic";
  providerUsed: "openai" | "gemini" | "none";
  summary: BatteryFeatureSummary;
  cached?: boolean;
}> => {
  // ── Check MongoDB cache first ──────────────────────────────────────────────
  const cached = await InsightCache.findOne({
    deviceId,
    expiresAt: { $gt: new Date() },
  }).lean();

  if (cached) {
    return { ...cached.data as any, cached: true };
  }

  // ── Cache miss — run full pipeline ─────────────────────────────────────────
  // Fetch up to 1 year of historical data for comprehensive analysis
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const metrics = await BatteryMetric.find({
    deviceId,
    recordedAt: { $gte: oneYearAgo },
  })
    .sort({ recordedAt: -1 })
    .select("temperature voltage power current soc recordedAt")
    .lean<IBatteryMetric[]>();

  if (!metrics.length) {
    throw new Error("No data recorded yet for this device");
  }

  const featureSummary = buildFeatureSummary(metrics);
  const fallbackInsight = buildDeterministicInsight(deviceId, featureSummary);

  const providerRaw = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  const provider =
    providerRaw === "openai" || providerRaw === "gemini"
      ? (providerRaw as "openai" | "gemini")
      : null;

  let result: {
    insight: BatteryHealthInsight;
    source: "ai" | "heuristic";
    providerUsed: "openai" | "gemini" | "none";
    summary: BatteryFeatureSummary;
  };

  if (!provider) {
    result = {
      insight: fallbackInsight,
      source: "heuristic",
      providerUsed: "none",
      summary: featureSummary,
    };
  } else {
    try {
      const prompt = buildPrompt(deviceId, featureSummary);
      const aiInsight = await generateAIInsight(provider, prompt);
      result = {
        insight: aiInsight,
        source: "ai",
        providerUsed: provider,
        summary: featureSummary,
      };
    } catch (error) {
      console.error(`[BatteryInsight] AI call failed (${provider}):`, error instanceof Error ? error.message : error);
      result = {
        insight: fallbackInsight,
        source: "heuristic",
        providerUsed: provider,
        summary: featureSummary,
      };
    }
  }

  // ── Store in MongoDB cache ─────────────────────────────────────────────────
  await InsightCache.findOneAndUpdate(
    { deviceId },
    {
      deviceId,
      data: result,
      expiresAt: new Date(Date.now() + INSIGHT_CACHE_TTL_MS),
    },
    { upsert: true, new: true },
  );

  return result;
};
