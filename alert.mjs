// redeploy trigger

import cron from "node-cron";

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const REGION = "NA";

const EVENTS_URL =
  "https://raw.githubusercontent.com/Archey6/archeage-tools/data/static/service/eventsNoDST.json";

const TARGETS = [
  "Hiram Rift",
  "Akasch Invasion",
  "Kraken",
  "Jola, Meina, & Glenn",
  "Black Dragon",
  "Golden Plains Battle",
].map((s) => s.toLowerCase());

const LEADS_MIN = [10, 1];
const CRON = "*/1 * * * *";

if (!WEBHOOK_URL) throw new Error("WEBHOOK_URL 필요함");

const sent = new Set();

const WEEKDAY = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function hmsToSec(hms) {
  const m = String(hms ?? "").match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function nextOccurrenceUtc(timesEntry, now = new Date()) {
  const tSec = hmsToSec(timesEntry.time);
  if (tSec == null) return null;

  const allowedDays = Array.isArray(timesEntry.days) ? timesEntry.days : null;
  const allowedSet = allowedDays
    ? new Set(
        allowedDays
          .map((d) => WEEKDAY[String(d).toUpperCase()])
          .filter((x) => Number.isInteger(x))
      )
    : null;

  let candidate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0
    ) + tSec * 1000
  );

  const advanceToAllowed = () => {
    if (!allowedSet) return;
    for (let i = 0; i < 8; i++) {
      if (allowedSet.has(candidate.getUTCDay())) return;
      candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
    }
  };

  advanceToAllowed();

  if (candidate.getTime() <= now.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 3600 * 1000);
    advanceToAllowed();
  }

  return candidate;
}

async function fetchEvents() {
  const res = await fetch(EVENTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`events fetch 실패: ${res.status}`);
  return await res.json();
}

async function sendWebhook(payload) {
  await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/* ------------------ 스타일 자동 설정 ------------------ */

function getEmbedColor(name) {
  const n = name.toLowerCase();

  if (n.includes("hiram rift") || n.includes("akasch invasion"))
    return 0x3498db; // 파랑

  if (n.includes("golden plains battle"))
    return 0x9b59b6; // 보라

  if (
    n.includes("kraken") ||
    n.includes("jola, meina, & glenn") ||
    n.includes("black dragon")
  )
    return 0xe74c3c; // 빨강

  return 0x95a5a6; // 기본 회색
}

function getEmoji(name) {
  const n = name.toLowerCase();

  if (n.includes("hiram rift")) return "🌀";
  if (n.includes("akasch invasion")) return "🌌";
  if (n.includes("kraken")) return "🐙";
  if (n.includes("jola, meina, & glenn")) return "🔥";
  if (n.includes("black dragon")) return "🐉";
  if (n.includes("golden plains battle")) return "⚔️";

  return "⏰";
}

/* ------------------------------------------------------- */

async function tick() {
  const now = new Date();
  const nowEpoch = Math.floor(now.getTime() / 1000);

  const events = await fetchEvents();

  for (const ev of events) {
    if (ev.disabled) continue;

    const nameLower = String(ev.name ?? "").toLowerCase();
    if (!TARGETS.some((k) => nameLower.includes(k))) continue;

    const times = ev.times?.filter((t) => t.region === REGION);
    if (!times?.length) continue;

    let bestNext = null;
    for (const t of times) {
      const next = nextOccurrenceUtc(t, now);
      if (!next) continue;
      if (!bestNext || next.getTime() < bestNext.getTime())
        bestNext = next;
    }
    if (!bestNext) continue;

    const startEpoch = Math.floor(bestNext.getTime() / 1000);

    for (const leadMin of LEADS_MIN) {
      const alertEpoch = startEpoch - leadMin * 60;

      if (nowEpoch >= alertEpoch && nowEpoch < alertEpoch + 60) {
        const key = `${ev.id}-${startEpoch}-${leadMin}`;
        if (sent.has(key)) continue;
        sent.add(key);

        const embed = {
          title: `${getEmoji(ev.name)} ${ev.name}`,
          color: getEmbedColor(ev.name),
          description:
            `**시작:** <t:${startEpoch}:F>\n` +
            `**T-${leadMin}m 알림**`,
          footer: { text: `NA · Archeage Event Alert` },
        };

        await sendWebhook({ embeds: [embed] });
      }
    }
  }
}

console.log("AA alert started");
cron.schedule(CRON, () => tick().catch(console.error), {
  timezone: "Asia/Seoul",
});

