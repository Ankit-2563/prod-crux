/**
 * Simple script to send 1000 battery entries to the server.
 *
 * 1) Edit constants below for your device
 * 2) Run: node scripts/send-1000-battery-data.mjs
 */

const BASE_URL = "http://localhost:4000";
const DEVICE_ID = "EV-TEST-123";
const DEVICE_SECRET = "secret-ev-test-123";
const TOTAL_POINTS = 1000;
const INTERVAL_MINUTES = 5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let soc = 92;
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
  console.log("Sending telemetry...");
  console.log(`BASE_URL=${BASE_URL}`);
  console.log(`DEVICE_ID=${DEVICE_ID}`);
  console.log(`TOTAL_POINTS=${TOTAL_POINTS}`);

  for (let i = 0; i < TOTAL_POINTS; i += 1) {
    const charging = (i % 120) >= 95; // about 20% charging samples
    const ambient = 24 + Math.sin(i / 50) * 4;
    const temperature = clamp(
      ambient + (charging ? 6 : 10) + (Math.random() * 4 - 2),
      22,
      52,
    );

    if (charging) soc += Math.random() * 1.5;
    else soc -= 0.25 + Math.random() * 0.6;
    soc = clamp(soc, 6, 98);
    if (soc < 12) soc = 18 + Math.random() * 6;

    const voltage = clamp(300 + soc * 1.2 + (Math.random() * 6 - 3), 280, 420);
    const current = charging ? -(20 + Math.random() * 70) : 10 + Math.random() * 140;
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

  console.log("Done: inserted 1000 battery entries.");
}

main().catch((error) => {
  console.error("Failed:", error.message);
  process.exit(1);
});
