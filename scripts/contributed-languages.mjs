// Draws assets/contributed-languages.svg: the languages of the user's merged
// pull requests in other people's repositories, weighted by lines changed.
// GitHub's own language stats only cover repositories the user owns.
// Usage: GITHUB_TOKEN=... node scripts/contributed-languages.mjs <user> [out.svg] [--no-markdown]
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const user = args[0] || process.env.GITHUB_REPOSITORY_OWNER;
const out = args[1] || "assets/contributed-languages.svg";
const skipMarkdown = process.argv.includes("--no-markdown");
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!user || !token) {
  console.error("usage: GITHUB_TOKEN=... node scripts/contributed-languages.mjs <user> [out.svg] [--no-markdown]");
  process.exit(2);
}

const FONT = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif";
const BG_GRADIENT =
  '<linearGradient id="bg" gradientTransform="rotate(135)" gradientUnits="userSpaceOnUse">' +
  '<stop offset="0%" stop-color="#0f1c2e"/><stop offset="100%" stop-color="#173a5e"/></linearGradient>';

// Extension → [language, GitHub linguist colour]. Data and config formats
// (JSON, YAML, lock files, SVG…) are left out, as GitHub's language bar does.
const LANGS = {
  JavaScript: ["#f1e05a", "js mjs cjs jsx"],
  TypeScript: ["#3178c6", "ts mts cts tsx"],
  Python: ["#3572A5", "py pyi"],
  Rust: ["#dea584", "rs"],
  "C++": ["#f34b7d", "cpp cc cxx hpp hh hxx h"],
  C: ["#555555", "c"],
  "C#": ["#178600", "cs"],
  Go: ["#00ADD8", "go"],
  Java: ["#b07219", "java"],
  Kotlin: ["#A97BFF", "kt kts"],
  Swift: ["#F05138", "swift"],
  Ruby: ["#701516", "rb"],
  PHP: ["#4F5D95", "php"],
  Lua: ["#000080", "lua"],
  Shell: ["#89e051", "sh bash zsh"],
  PowerShell: ["#012456", "ps1 psm1 psd1"],
  HTML: ["#e34c26", "html htm"],
  CSS: ["#663399", "css scss sass less"],
  Vue: ["#41b883", "vue"],
  Svelte: ["#ff3e00", "svelte"],
  TeX: ["#3D6117", "tex"],
  Markdown: ["#083fa1", "md mdx markdown"],
};
const byExt = new Map();
for (const [lang, [, exts]] of Object.entries(LANGS)) for (const e of exts.split(" ")) byExt.set(e, lang);
const SKIP_PATH = /(^|\/)(node_modules|vendor|dist|build)\/|\.min\.(js|css)$|\.snap$/;

function language(path) {
  if (SKIP_PATH.test(path)) return null;
  const ext = path.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const lang = ext && byExt.get(ext);
  if (lang === "Markdown" && skipMarkdown) return null;
  return lang || null;
}

const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "profile-contributed-languages" };
async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

const pulls = [];
const q = encodeURIComponent(`author:${user} type:pr is:merged`);
for (let page = 1; page <= 10; page++) {
  const res = await api(`/search/issues?q=${q}&per_page=100&page=${page}`);
  pulls.push(...res.items);
  if (res.items.length < 100) break;
}
const outside = pulls
  .map((p) => ({ repo: p.repository_url.replace("https://api.github.com/repos/", ""), number: p.number }))
  .filter((p) => p.repo.split("/")[0].toLowerCase() !== user.toLowerCase());

const lines = new Map();
const repos = new Set();
async function countPull({ repo, number }) {
  for (let page = 1; page <= 30; page++) {
    const files = await api(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    for (const f of files) {
      const lang = language(f.filename);
      if (!lang) continue;
      lines.set(lang, (lines.get(lang) || 0) + f.additions + f.deletions);
      repos.add(repo);
    }
    if (files.length < 100) break;
  }
}
// A few requests at a time keeps well inside the API rate limits.
for (let i = 0; i < outside.length; i += 6) await Promise.all(outside.slice(i, i + 6).map(countPull));

const total = [...lines.values()].reduce((a, b) => a + b, 0);
const ranked = [...lines].sort((a, b) => b[1] - a[1]);
const ROWS = 6;
const rows = ranked.length > ROWS ? [...ranked.slice(0, ROWS - 1), ["Other", ranked.slice(ROWS - 1).reduce((n, [, v]) => n + v, 0)]] : ranked;

// Lighten colours that would vanish on the dark card (contrast below 3:1).
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function readable(hex) {
  let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let k = 0; k < 20; k++) {
    const h = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    if (luminance(h) >= 0.14) return h;
    [r, g, b] = [r, g, b].map((v) => v + (255 - v) * 0.15);
  }
  return "#8fd3ff";
}
const colour = (lang) => (lang === "Other" ? "#7f9bb8" : readable(LANGS[lang][0]));

const W = 350;
const H = 247;
const BAR_X = 112;
const BAR_W = 150;
const top = rows[0]?.[1] || 1;
const body = rows.map(([lang, n], i) => {
  const y = 84 + i * 26;
  const pct = ((100 * n) / total).toFixed(1);
  const w = Math.max(3, (BAR_W * n) / top);
  return (
    `<g class="in" style="animation-delay:${(0.1 + i * 0.08).toFixed(2)}s">` +
    `<circle cx="30" cy="${y - 4}" r="5" fill="${colour(lang)}"/>` +
    `<text x="42" y="${y}" class="lang">${lang}</text>` +
    `<rect x="${BAR_X}" y="${y - 8}" width="${BAR_W}" height="8" rx="4" class="track"/>` +
    `<rect x="${BAR_X}" y="${y - 8}" width="${w.toFixed(1)}" height="8" rx="4" fill="${colour(lang)}" class="bar" style="animation-delay:${(0.1 + i * 0.08).toFixed(2)}s"/>` +
    `<text x="${W - 25}" y="${y}" class="pct">${pct}%</text></g>`
  );
});

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title">
<title id="title">Languages in ${outside.length} merged pull requests to other projects, by lines changed: ${rows.map(([l, n]) => `${l} ${((100 * n) / total).toFixed(1)}%`).join(", ")}</title>
<style>
text{font-family:${FONT}}
.h1{font-size:18px;font-weight:600;fill:#8fd3ff}
.sub{font-size:11px;fill:#7f9bb8}
.lang{font-size:12px;fill:#d6ecff}
.pct{font-size:12px;fill:#d6ecff;text-anchor:end}
.track{fill:#8fd3ff;fill-opacity:.08}
.in{animation:in .5s ease-out both}
.bar{animation:grow .9s ease-out both;transform-box:fill-box;transform-origin:left}
@keyframes in{from{opacity:0}to{opacity:1}}
@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media (prefers-reduced-motion:reduce){.in,.bar{animation:none}}
</style>
<defs>${BG_GRADIENT}</defs>
<rect width="${W}" height="${H}" rx="4.5" fill="url(#bg)"/>
<text x="25" y="35" class="h1">Contributed Languages</text>
<text x="25" y="54" class="sub">by lines changed in merged PRs to ${repos.size} other projects</text>
${body.join("\n")}
</svg>
`;

await mkdir(dirname(out), { recursive: true });
await writeFile(out, svg);
console.log(`${out}: ${outside.length} merged PRs, ${repos.size} projects, ${total} lines`);
for (const [lang, n] of ranked) console.log(`  ${lang.padEnd(11)} ${String(n).padStart(8)}  ${((100 * n) / total).toFixed(1)}%`);
