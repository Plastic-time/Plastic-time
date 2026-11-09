// Draws assets/frozen-calendar.svg: the contribution calendar as water, which a
// passing snowflake freezes column by column. A frog waiting at the end gets
// frozen too, then everything thaws and the loop starts again.
// Usage: GITHUB_TOKEN=... node scripts/frozen-calendar.mjs <user> [out.svg]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif";
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
// Same gradient the stats cards in the README use for bg_color=135,0f1c2e,173a5e.
const BG_GRADIENT =
  '<linearGradient id="bg" gradientTransform="rotate(135)" gradientUnits="userSpaceOnUse">' +
  '<stop offset="0%" stop-color="#0f1c2e"/><stop offset="100%" stop-color="#173a5e"/></linearGradient>';

const user = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER;
const out = process.argv[3] || "assets/frozen-calendar.svg";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!user || !token) {
  console.error("usage: GITHUB_TOKEN=... node scripts/frozen-calendar.mjs <user> [out.svg]");
  process.exit(2);
}

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel weekday } }
      }
    }
  }
}`;
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "profile-frozen-calendar" },
  body: JSON.stringify({ query, variables: { login: user } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(`GraphQL: HTTP ${res.status} ${JSON.stringify(json.errors || json)}`);
const calendar = json.data.user.contributionsCollection.contributionCalendar;
const weeks = calendar.weeks;

const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const WATER = ["#13233a", "#1b4a77", "#2463a3", "#2f7fd0", "#3d9bf0"];
const ICE = ["#27486a", "#5aa9de", "#8cc9f0", "#bfe5fb", "#effaff"];

const W = 940;
const H = 185;
const PAD = 25;
const CELL = 11;
const STEP = 14;
const GX = 52;
const GY = 70;
const gridRight = GX + weeks.length * STEP - (STEP - CELL);
const gridBottom = GY + 7 * STEP - (STEP - CELL);
const FROG_X = Math.round((gridRight + W - PAD) / 2) + 4;
const T = 14; // seconds per loop

// Sweep timeline, in percent of the loop.
const SWEEP_START = 3;
const SWEEP_END = 58;
const FREEZE_FROG = 64;
const THAW = 90;
const THAWED = 96;
const sweepFrom = GX - 10;
const sweepTo = gridRight + 4;
const at = (x) => SWEEP_START + ((SWEEP_END - SWEEP_START) * (x - sweepFrom)) / (sweepTo - sweepFrom);
const pct = (n) => `${n.toFixed(2)}%`;

const water = [];
const ice = [];
const keyframes = [];

weeks.forEach((week, w) => {
  const x = GX + w * STEP;
  const freezeAt = at(x + CELL / 2);
  keyframes.push(
    `@keyframes f${w}{0%,${pct(freezeAt)}{opacity:0}${pct(freezeAt + 1.2)},${THAW}%{opacity:1}${THAWED}%,100%{opacity:0}}`,
  );
  const cells = [];
  for (const day of week.contributionDays) {
    const lv = LEVEL[day.contributionLevel] ?? 0;
    const y = GY + day.weekday * STEP;
    water.push(
      `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${WATER[lv]}"><title>${day.date}: ${day.contributionCount}</title></rect>`,
    );
    cells.push(`<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${ICE[lv]}"/>`);
    cells.push(`<path d="M${x + 1.5} ${y + 1.5}h4l-4 4z" class="${lv > 0 ? "glint" : "frost"}"/>`);
  }
  ice.push(`<g class="fz" style="animation-name:f${w}">${cells.join("")}</g>`);
});

// Month labels above the first week of each month, skipping crowded ones.
const months = [];
let lastCol = -10;
weeks.forEach((week, w) => {
  const first = new Date(week.contributionDays[0].date + "T00:00:00Z");
  const prev = w > 0 ? new Date(weeks[w - 1].contributionDays[0].date + "T00:00:00Z") : null;
  if (prev && first.getUTCMonth() === prev.getUTCMonth()) return;
  if (w - lastCol < 3) return;
  if (w === 0 && weeks.length > 1) {
    const next = new Date(weeks[1].contributionDays[0].date + "T00:00:00Z");
    if (next.getUTCMonth() !== first.getUTCMonth()) return;
  }
  months.push(`<text x="${GX + w * STEP}" y="${GY - 8}" class="lbl">${first.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`);
  lastCol = w;
});
const weekdays = [
  [1, "Mon"],
  [3, "Wed"],
  [5, "Fri"],
].map(([row, name]) => `<text x="${GX - 8}" y="${GY + row * STEP + 9}" class="lbl" text-anchor="end">${name}</text>`);

// An original cartoon frog, standing on y = 0 and centred on x = 0.
function frog(c) {
  return (
    `<ellipse cx="-15" cy="-5" rx="9" ry="6" fill="${c.leg}"/>` +
    `<ellipse cx="15" cy="-5" rx="9" ry="6" fill="${c.leg}"/>` +
    `<ellipse cx="0" cy="-12" rx="18" ry="13" fill="${c.body}"/>` +
    `<ellipse cx="0" cy="-8" rx="11" ry="7" fill="${c.belly}"/>` +
    `<circle cx="-9" cy="-24" r="6.5" fill="${c.body}"/><circle cx="9" cy="-24" r="6.5" fill="${c.body}"/>` +
    `<circle cx="-9" cy="-24.5" r="4.4" fill="#fff"/><circle cx="9" cy="-24.5" r="4.4" fill="#fff"/>` +
    `<circle cx="-8.2" cy="-24.2" r="2.2" fill="${c.pupil}"/><circle cx="9.8" cy="-24.2" r="2.2" fill="${c.pupil}"/>` +
    `<circle cx="-12.5" cy="-14" r="2.1" fill="${c.cheek}"/><circle cx="12.5" cy="-14" r="2.1" fill="${c.cheek}"/>` +
    `<path d="M-6 -15.5q6 4.5 12 0" fill="none" stroke="${c.mouth}" stroke-width="1.4" stroke-linecap="round"/>` +
    `<ellipse cx="-8" cy="-1" rx="5" ry="2.5" fill="${c.leg}"/><ellipse cx="8" cy="-1" rx="5" ry="2.5" fill="${c.leg}"/>`
  );
}
const liveFrog = frog({ leg: "#3f9a4a", body: "#5cc46a", belly: "#c4efbb", pupil: "#10202e", cheek: "#ff9fb0", mouth: "#2b6b34" });
const frozenFrog = frog({ leg: "#8cc9f0", body: "#bfe5fb", belly: "#effaff", pupil: "#4a7fa8", cheek: "#d6ecff", mouth: "#6fa8cf" });

const snowflake =
  `<circle r="8" fill="#8fd3ff" opacity=".28"/>` +
  `<g stroke="#fff" stroke-width="1.6" stroke-linecap="round" fill="none">` +
  [0, 60, 120]
    .map((a) => `<g transform="rotate(${a})"><path d="M0 -7V7M-2.4 -4.6 0 -2.4 2.4 -4.6M-2.4 4.6 0 2.4 2.4 4.6"/></g>`)
    .join("") +
  `</g>`;

const sweepKeys =
  `@keyframes sweep{` +
  `0%,${SWEEP_START}%{transform:translateX(${sweepFrom}px);opacity:0}` +
  `${SWEEP_START + 1}%{opacity:1}` +
  `${SWEEP_END}%{transform:translateX(${sweepTo}px)}` +
  `${FREEZE_FROG}%{transform:translateX(${FROG_X}px);opacity:1}` +
  `${FREEZE_FROG + 5}%,100%{transform:translateX(${FROG_X}px);opacity:0}}`;
const hops = [12, 26, 40, 52];
const hopKeys =
  `@keyframes hop{0%{transform:translateY(0)}` +
  hops.map((h) => `${h - 2}%{transform:translateY(0)}${h}%{transform:translateY(-9px)}${h + 2}%{transform:translateY(0)}`).join("") +
  `100%{transform:translateY(0)}}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
<title id="title">${esc(user)}: ${calendar.totalContributions} contributions in the last year, frozen by a snowflake</title>
<style>
text{font-family:${FONT}}
.h1{font-size:18px;font-weight:600;fill:#8fd3ff}
.sum{font-size:13px;fill:#d6ecff;opacity:.85}
.lbl{font-size:10.5px;fill:#7f9bb8}
.glint{fill:#fff;opacity:.55}
.frost{fill:#d6ecff;opacity:.22}
.fz{opacity:0;animation:${T}s linear infinite}
.sweep{opacity:0;animation:sweep ${T}s linear infinite}
.spin{animation:spin 2.4s linear infinite;transform-box:fill-box;transform-origin:center}
.live{animation:live ${T}s linear infinite}
.hop{animation:hop ${T}s ease-in-out infinite}
.iced{opacity:0;animation:iced ${T}s linear infinite}
.nine{opacity:0;animation:nine ${T}s linear infinite;font-size:16px;font-weight:700;fill:#8fd3ff}
${keyframes.join("\n")}
${sweepKeys}
${hopKeys}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes live{0%,${FREEZE_FROG}%{opacity:1}${FREEZE_FROG + 1}%,${THAW + 2}%{opacity:0}${THAWED}%,100%{opacity:1}}
@keyframes iced{0%,${FREEZE_FROG - 1}%{opacity:0}${FREEZE_FROG + 1}%,${THAW}%{opacity:1}${THAWED}%,100%{opacity:0}}
@keyframes nine{0%,${FREEZE_FROG + 4}%{opacity:0}${FREEZE_FROG + 7}%,${THAW}%{opacity:1}${THAWED}%,100%{opacity:0}}
@media (prefers-reduced-motion:reduce){
.fz,.iced,.nine{animation:none;opacity:1}
.live,.sweep{animation:none;opacity:0}
}
</style>
<defs>${BG_GRADIENT}
<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#8fd3ff" stop-opacity=".05"/></linearGradient></defs>
<rect width="${W}" height="${H}" rx="4.5" fill="url(#bg)"/>
<text x="${PAD}" y="36" class="h1">Contribution calendar</text>
<text x="${W - PAD}" y="36" class="sum" text-anchor="end">${calendar.totalContributions.toLocaleString("en-US")} contributions in the last year</text>
${months.join("")}
${weekdays.join("")}
<g>${water.join("")}</g>
${ice.join("\n")}
<g transform="translate(${FROG_X} ${gridBottom})">
<g class="live"><g class="hop">${liveFrog}</g></g>
<g class="iced">${frozenFrog}
<rect x="-30" y="-46" width="60" height="48" rx="6" fill="#c8ebff" fill-opacity=".22" stroke="#e6f6ff" stroke-opacity=".85" stroke-width="1.5"/>
<path d="M-25 -41h10l-10 10z" fill="#fff" opacity=".5"/><path d="M19 -41l6 6" stroke="#fff" stroke-opacity=".6" stroke-width="1.5" stroke-linecap="round"/></g>
<text x="27" y="-50" class="nine">⑨</text>
</g>
<g class="sweep"><rect x="-1" y="${GY - 4}" width="2" height="${gridBottom - GY + 8}" fill="url(#beam)"/>
<g transform="translate(0 ${GY - 14})"><g class="spin">${snowflake}</g></g></g>
</svg>
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(`${out}: ${weeks.length} weeks, ${calendar.totalContributions} contributions, ${svg.length} bytes`);
