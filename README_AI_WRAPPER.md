# AI Battery Wrapper Guide (Beginner Friendly)

This guide explains the battery insight wrapper added in this backend:

- what it is
- why it exists
- how it works internally
- how to test it with scripts
- how to tailor it for your real hardware signals

If you have never used OpenAI/Gemini wrappers before, start here.

---

## 1) What is this wrapper?

The wrapper is a backend service that takes your battery telemetry history and returns user-friendly battery health insights.

The frontend only needs one endpoint:

- `GET /api/battery/:deviceId/health-insight`

The backend does the heavy work:

1. verifies user owns the device
2. fetches historical battery metrics
3. computes deterministic summary features
4. sends compact feature summary to AI (Gemini/OpenAI)
5. validates response shape
6. falls back to local heuristic if AI fails

So your frontend gets a stable response regardless of provider issues.

---

## 2) Files created/updated for this feature

- `src/services/batteryHealthInsight.service.ts`  
  Core wrapper logic, feature extraction, AI calls, JSON validation, fallback.

- `src/controllers/battery.controller.ts`  
  Added `getDeviceHealthInsight`.

- `src/routes/battery.routes.ts`  
  Added route:
  `GET /api/battery/:deviceId/health-insight`

- `scripts/send-1000-battery-data.mjs`  
  Seeds high-stress EV-like telemetry (useful for poor-health simulation).

- `scripts/send-1000-battery-data-good-health.mjs`  
  Seeds low-stress profile (useful for good-health simulation).

---

## 3) Why use wrapper + fallback?

AI output can fail for many reasons (bad key, quota, JSON format mismatch, network errors).

With this design:

- API still returns useful insight (`source: "heuristic"`)
- app does not break
- frontend always receives the same data shape

Important response fields:

- `source`: `"ai"` or `"heuristic"`
- `providerUsed`: `"gemini" | "openai" | "none"`

---

## 4) Current telemetry model assumptions

Your current hardware ingestion stores:

- temperature (`C`)
- voltage (`V`)
- power (`W`)
- current (`A`)
- soc (`%`)
- recordedAt

The wrapper estimates stress using:

- high temperature ratio (`>= 40C`)
- deep discharge events (`soc <= 10`)
- average absolute current

Then converts stress to:

- `healthScore` (`0-100`)
- `overallHealth` (`good/moderate/poor`)
- estimated timeline to 80% capacity

---

## 5) Environment setup

In `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=YOUR_GEMINI_KEY
GEMINI_MODEL=gemini-2.0-flash

# OR for OpenAI
# AI_PROVIDER=openai
# OPENAI_API_KEY=YOUR_OPENAI_KEY
# OPENAI_MODEL=gpt-4o-mini
```

If AI is unavailable, wrapper auto-falls back to heuristic.

---

## 6) Endpoint contract (frontend-ready)

`GET /api/battery/:deviceId/health-insight`

Response (shape):

```json
{
  "success": true,
  "data": {
    "deviceId": "EV-TEST-123",
    "generatedAt": "2026-03-29T19:39:03.867Z",
    "source": "ai",
    "providerUsed": "gemini",
    "insight": {
      "overallHealth": "moderate",
      "healthScore": 67,
      "summary": "....",
      "estimatedDegradeTimeline": {
        "to80PercentCapacityMonths": 31,
        "confidence": "low"
      },
      "topRisks": ["..."],
      "recommendedActions": [
        {
          "action": "...",
          "impact": "high",
          "difficulty": "easy"
        }
      ],
      "explanations": {
        "sampleWindow": "...",
        "thermalStress": "...",
        "deepDischarge": "...",
        "currentLoad": "...",
        "estimationModel": "..."
      },
      "disclaimer": "..."
    },
    "telemetrySummary": {
      "sampleCount": 1000,
      "windowDays": 3.47,
      "avgTemperatureC": 31.8,
      "maxTemperatureC": 39.2,
      "avgSoc": 42.1,
      "deepDischargeEvents": 2,
      "highTemperatureRatio": 0.05,
      "avgAbsoluteCurrentA": 38.7,
      "latest": {
        "temperature": 30.2,
        "soc": 45.1,
        "voltage": 352.9,
        "current": 28.2,
        "power": 9951.8,
        "recordedAt": "..."
      },
      "stressScore": 33.4,
      "confidence": "low",
      "estimatedMonthsTo80": 36.3
    }
  }
}
```

---

## 7) Testing scripts you now have

### A) Stress profile (likely poor/moderate)

```bash
node scripts/send-1000-battery-data.mjs
```

### B) Good profile (likely good/moderate)

```bash
node scripts/send-1000-battery-data-good-health.mjs
```

Before running, make sure device IDs in script match registered/paired devices.

---

## 8) How to tailor wrapper to your real hardware

This is the most important section.

### Step 1: Confirm your real units and ranges

Decide actual ranges from your BMS/hardware:

- normal temperature range
- dangerous temperature threshold
- typical current draw range
- SOC operating policy (for your chemistry)

Then update thresholds in:

- `src/services/batteryHealthInsight.service.ts`

Example parameters to tune:

- high temp threshold (`>= 40C` now)
- deep discharge threshold (`<= 10%` now)
- current normalization reference (`100A` now)

### Step 2: Add chemistry-specific signals (recommended)

Current model is generic because cycle/capacity data is missing.
For better accuracy, add fields in hardware payload:

- `cycleCount`
- `stateOfHealth` (SOH)
- `cellImbalanceMv`
- `chargeCount`
- `dcFastChargeRatio`
- `packResistanceMilliOhm`
- `ambientTemp`

Then include them in:

1. schema (`batteryDataSchema`)
2. DB model (`IBatteryMetric`)
3. ingestion endpoint (`receiveBatteryData`)
4. wrapper feature summary + prompt

### Step 3: Improve confidence logic

Currently confidence is based on sample count + window days.
You should also reduce confidence when:

- too many missing points
- sensor values clipped/out-of-range
- very short active driving/charging windows

### Step 4: Version your heuristic

Add a field like:

- `heuristicVersion: "v1"`

in response so you can track algorithm changes over time.

---

## 9) Why you saw `source: "heuristic"` with `providerUsed: "gemini"`

That means:

- provider selected = Gemini
- AI call failed OR AI returned invalid JSON
- fallback executed correctly

Common reasons:

- invalid/expired API key
- quota/rate limit
- temporary network/API outage
- model response not valid JSON

This is expected behavior by design.

---

## 10) Quick troubleshooting checklist

1. Server running on port `4000`
2. Device exists and is paired to current user
3. Device has historical metrics
4. Auth token valid
5. `.env` has `AI_PROVIDER` and matching key
6. Restart server after `.env` changes
7. Check response:
   - `source: "ai"` means AI worked
   - `source: "heuristic"` means fallback

---

## 11) Suggested next upgrades

1. Add per-device insight caching (e.g., 5-15 minutes)
2. Add explicit AI error reason in response metadata (internal-safe)
3. Store latest generated insight in DB for fast dashboard load
4. Add periodic background insight generation
5. Add model guardrails with stricter schema and retries

---

## 12) Minimal mental model

Think of this as two layers:

- **Layer A (Math layer)**: deterministic feature extraction + baseline insight
- **Layer B (Language layer)**: AI explanation and recommendation formatting

Layer A keeps output reliable.  
Layer B makes it readable for users.

That is the core wrapper concept.
