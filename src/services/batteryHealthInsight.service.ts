import { z } from "zod";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import BatteryMetric, { IBatteryMetric } from "../models/batteryMetric.model";

type HealthLevel = "good" | "moderate" | "poor";
type ConfidenceLevel = "low" | "medium" | "high";

interface BatteryFeatureSummary {
  sampleCount: number;
  windowDays: number;
  avgTemperatureC: number;
  maxTemperatureC: number;
  avgSoc: number;
  deepDischargeEvents: number;
  highTemperatureRatio: number;
  avgAbsoluteCurrentA: number;
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
}

export interface BatteryHealthInsight {
  overallHealth: HealthLevel;
  healthScore: number;
  summary: string;
  estimatedDegradeTimeline: {
    to80PercentCapacityMonths: number;
    confidence: ConfidenceLevel;
  };
  topRisks: string[];
  recommendedActions: Array<{
    action: string;
    impact: "low" | "medium" | "high";
    difficulty: "easy" | "medium" | "hard";
  }>;
  explanations: Record<string, string>;
  disclaimer: string;
}

const insightSchema = z.object({
  overallHealth: z.enum(["good", "moderate", "poor"]),
  healthScore: z.number().min(0).max(100),
  summary: z.string().min(1),
  estimatedDegradeTimeline: z.object({
    to80PercentCapacityMonths: z.number().min(1).max(120),
    confidence: z.enum(["low", "medium", "high"]),
  }),
  topRisks: z.array(z.string()).max(5),
  recommendedActions: z
    .array(
      z.object({
        action: z.string().min(1),
        impact: z.enum(["low", "medium", "high"]),
        difficulty: z.enum(["easy", "medium", "hard"]),
      }),
    )
    .max(8),
  explanations: z.record(z.string(), z.string()),
  disclaimer: z.string().min(1),
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

  const highTempCount = temperatures.filter((t) => t >= 40).length;
  const deepDischargeEvents = socValues.filter((s) => s <= 10).length;
  const highTemperatureRatio = highTempCount / sorted.length;
  const deepDischargeRatio = deepDischargeEvents / sorted.length;
  const avgCurrent = safeAvg(absCurrents);

  // Current stress is normalized to typical EV window averages (A). The old formula
  // used `100 * 0.1 * (avgCurrent / 2)`, which hit the cap (~20A avg) and marked almost
  // all EV-like data as maximum stress.
  const referenceAvgCurrentA = 100;
  const currentStressNorm = clamp(avgCurrent / referenceAvgCurrentA, 0, 1);
  const stressComposite = clamp(
    0.5 * highTemperatureRatio + 0.35 * deepDischargeRatio + 0.15 * currentStressNorm,
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
    deepDischargeEvents,
    highTemperatureRatio: round(highTemperatureRatio, 4),
    avgAbsoluteCurrentA: round(avgCurrent, 3),
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
  };
};

const buildDeterministicInsight = (
  deviceId: string,
  summary: BatteryFeatureSummary,
): BatteryHealthInsight => {
  const healthScore = round(clamp(100 - summary.stressScore, 0, 100), 0);
  const overallHealth: HealthLevel =
    healthScore >= 75 ? "good" : healthScore >= 45 ? "moderate" : "poor";

  const topRisks: string[] = [];
  if (summary.highTemperatureRatio >= 0.25) {
    topRisks.push("Frequent high temperature operation (>= 40C)");
  }
  if (summary.deepDischargeEvents >= 10) {
    topRisks.push("Frequent deep discharge events (SOC <= 10%)");
  }
  if (summary.avgAbsoluteCurrentA >= 85) {
    topRisks.push("Sustained higher average current draw for this window");
  }
  if (!topRisks.length) {
    topRisks.push("No major stress factors detected in available window");
  }

  return {
    overallHealth,
    healthScore,
    summary: `Device ${deviceId} shows ${overallHealth} battery health based on ${summary.sampleCount} readings over ${summary.windowDays} days. This estimate uses stress signals (temperature, deep discharge frequency, and current draw) because direct capacity/cycle telemetry is not available.`,
    estimatedDegradeTimeline: {
      to80PercentCapacityMonths: summary.estimatedMonthsTo80,
      confidence: summary.confidence,
    },
    topRisks,
    recommendedActions: [
      {
        action: "Avoid prolonged charging or operation above 40C",
        impact: "high",
        difficulty: "medium",
      },
      {
        action: "Keep SOC mostly between 20% and 80% for daily use",
        impact: "high",
        difficulty: "easy",
      },
      {
        action: "Reduce heavy load usage while charging",
        impact: "medium",
        difficulty: "medium",
      },
      {
        action: "Track weekly trends and alert when stress score rises",
        impact: "medium",
        difficulty: "easy",
      },
    ],
    explanations: {
      sampleWindow: `${summary.sampleCount} points over ${summary.windowDays} days`,
      thermalStress: `High temperature ratio: ${(summary.highTemperatureRatio * 100).toFixed(1)}%`,
      deepDischarge: `Deep discharge events: ${summary.deepDischargeEvents}`,
      currentLoad: `Average absolute current: ${summary.avgAbsoluteCurrentA} A`,
      estimationModel:
        "Timeline is a heuristic estimate derived from stress signals, not a direct battery chemistry measurement.",
    },
    disclaimer:
      "This is an estimated advisory based on telemetry trends and not a guaranteed lifespan prediction.",
  };
};

const buildPrompt = (deviceId: string, f: BatteryFeatureSummary): string => {
  const data = `dev=${deviceId} n=${f.sampleCount} days=${f.windowDays} avgT=${f.avgTemperatureC} maxT=${f.maxTemperatureC} avgSoc=${f.avgSoc} deepDis=${f.deepDischargeEvents} hiTempR=${f.highTemperatureRatio} avgI=${f.avgAbsoluteCurrentA} stress=${f.stressScore} mo80=${f.estimatedMonthsTo80} conf=${f.confidence} latestT=${f.latest.temperature} latestSoc=${f.latest.soc} latestV=${f.latest.voltage} latestI=${f.latest.current} latestP=${f.latest.power}`;

  return `Battery diagnostics. JSON only, no markdown. Use only provided data.
${data}
Schema:{overallHealth:"good"|"moderate"|"poor",healthScore:0-100,summary:string,estimatedDegradeTimeline:{to80PercentCapacityMonths:1-120,confidence:"low"|"medium"|"high"},topRisks:string[max5],recommendedActions:[{action:string,impact:"low"|"medium"|"high",difficulty:"easy"|"medium"|"hard"}max4],explanations:{key:string},disclaimer:string}`;
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

// ─── In-memory insight cache ─────────────────────────────────────────────────
// Battery health doesn't change second-to-second. Caching avoids redundant
// Gemini/OpenAI calls and MongoDB queries. This runs on the server — the
// React Native frontend just calls the same endpoint and gets faster responses.

const INSIGHT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CachedInsight {
  data: {
    insight: BatteryHealthInsight;
    source: "ai" | "heuristic";
    providerUsed: "openai" | "gemini" | "none";
    summary: BatteryFeatureSummary;
  };
  createdAt: number;
}

const insightCache = new Map<string, CachedInsight>();

/** Evict stale entries (called automatically on every lookup) */
const evictStale = (): void => {
  const now = Date.now();
  for (const [key, entry] of insightCache) {
    if (now - entry.createdAt > INSIGHT_CACHE_TTL_MS) {
      insightCache.delete(key);
    }
  }
};

/** Clear cache for a specific device (useful after new data ingestion) */
export const clearInsightCache = (deviceId?: string): void => {
  if (deviceId) {
    insightCache.delete(deviceId);
  } else {
    insightCache.clear();
  }
};

export const getBatteryHealthInsight = async (deviceId: string): Promise<{
  insight: BatteryHealthInsight;
  source: "ai" | "heuristic";
  providerUsed: "openai" | "gemini" | "none";
  summary: BatteryFeatureSummary;
  cached?: boolean;
}> => {
  // ── Check cache first ──────────────────────────────────────────────────────
  evictStale();
  const cached = insightCache.get(deviceId);
  if (cached) {
    return { ...cached.data, cached: true };
  }

  // ── Cache miss — run full pipeline ─────────────────────────────────────────
  const metrics = await BatteryMetric.find({ deviceId })
    .sort({ recordedAt: -1 })
    .limit(2000)
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

  // ── Store in cache ─────────────────────────────────────────────────────────
  insightCache.set(deviceId, { data: result, createdAt: Date.now() });

  return result;
};

