/**
 * Sends 1000 "good health" battery telemetry points.
 *
 * Steps:
 * 1) Register + pair a new device (example: EV-GOOD-123).
 * 2) Set DEVICE_ID and DEVICE_SECRET below.
 * 3) Run: node scripts/send-1000-battery-data-good-health.mjs
 */

const BASE_URL = "http://localhost:4000";
const DEVICE_ID = "EV-GOOD-123";
const DEVICE_SECRET = "secret-ev-good-123";
const TOTAL_POINTS = 1000;
const INTERVAL_MINUTES = 5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let soc = 72; // healthy operating zone
const now = Date.now();

async function sendOne(payload) {
  const response = await fetch(`${BASE_URL}/api/hardware/data`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": DEVICE_ID,
      "x-device-secret": DEVICE_SECRET,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body}`);
  }
}

async function main() {
  console.log("Sending healthy telemetry profile...");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`DEVICE_ID=${DEVICE_ID}`);
  console.log(`TOTAL_POINTS=${TOTAL_POINTS}`);

  for (let i = 0; i < TOTAL_POINTS; i += 1) {
    const charging = (i % 90) >= 75; // short, regular top-up
    const ambient = 24 + Math.sin(i / 40) * 2.2;

    // keep below high-stress thermal zone (< 40C)
    const temperature = clamp(
      ambient + (charging ? 4 : 6) + (Math.random() * 1.4 - 0.7),
      24,
      36.5,
    );

    // keep SOC mostly in 25-80 range, no deep discharge
    if (charging) soc += 0.4 + Math.random() * 0.9;
    else soc -= 0.2 + Math.random() * 0.35;
    soc = clamp(soc, 24, 82);

    // moderate current profile
    const voltage = clamp(320 + soc * 0.9 + (Math.random() * 2 - 1), 315, 392);
    const current = charging
      ? -(12 + Math.random() * 18) // gentle charging
      : 8 + Math.random() * 28; // moderate discharge
    const power = voltage * current;

    const recordedAt = new Date(
      now - (TOTAL_POINTS - i) * INTERVAL_MINUTES * 60 * 1000,
    ).toISOString();

    const payload = {
      temperature: Number(temperature.toFixed(2)),
      voltage: Number(voltage.toFixed(2)),
      power: Number(power.toFixed(2)),
      current: Number(current.toFixed(2)),
      soc: Number(soc.toFixed(2)),
      recordedAt,
    };

    await sendOne(payload);

    if ((i + 1) % 100 === 0) {
      console.log(`Inserted ${i + 1}/${TOTAL_POINTS}`);
    }
  }

  console.log("Done: inserted healthy 1000 battery entries.");
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
