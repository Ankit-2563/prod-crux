/**
 * Seeds N synthetic EV-like battery readings via POST /api/hardware/data
 * Usage:
 *   BASE_URL=http://localhost:4000 DEVICE_ID=... DEVICE_SECRET=... node scripts/seed-ev-telemetry.mjs
 * Optional: COUNT=1000 INTERVAL_MINUTES=5
 */

const baseUrl = process.env.BASE_URL || "http://localhost:4000";
const deviceId = process.env.DEVICE_ID;
const deviceSecret = process.env.DEVICE_SECRET;
const count = Math.min(Math.max(parseInt(process.env.COUNT || "1000", 10), 1), 5000);
const intervalMinutes = Math.max(parseFloat(process.env.INTERVAL_MINUTES || "5"), 0.1);

if (!deviceId || !deviceSecret) {
  console.error("Set DEVICE_ID and DEVICE_SECRET (and optionally BASE_URL, COUNT, INTERVAL_MINUTES).");
  process.exit(1);
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const now = Date.now();
let soc = 92;

(async () => {
  for (let i = 0; i < count; i++) {
    const charging = (i % 120) >= 95;
    const ambient = 24 + Math.sin(i / 50) * 4;
    const temp = clamp(ambient + (charging ? 6 : 10) + (Math.random() * 4 - 2), 22, 52);

    if (charging) soc += Math.random() * 1.5;
    else soc -= 0.25 + Math.random() * 0.6;
    soc = clamp(soc, 6, 98);
    if (soc < 12) soc = 18 + Math.random() * 6;

    const voltage = clamp(300 + soc * 1.2 + (Math.random() * 6 - 3), 280, 420);
    const current = charging
      ? -(20 + Math.random() * 70)
      : 10 + Math.random() * 140;
    const power = voltage * current;
    const recordedAt = new Date(now - (count - i) * intervalMinutes * 60 * 1000).toISOString();

    const payload = {
      temperature: Number(temp.toFixed(2)),
      voltage: Number(voltage.toFixed(2)),
      power: Number(power.toFixed(2)),
      current: Number(current.toFixed(2)),
      soc: Number(soc.toFixed(2)),
      recordedAt,
    };

    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/hardware/data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": deviceId,
        "x-device-secret": deviceSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error(`Failed at index ${i}:`, res.status, t);
      process.exit(1);
    }

    if ((i + 1) % 100 === 0) {
      console.log(`Inserted ${i + 1}/${count}`);
    }
  }

  console.log(`Inserted all ${count} records successfully.`);
})();
