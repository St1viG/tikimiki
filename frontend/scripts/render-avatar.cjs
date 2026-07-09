/* Render an avatar style to a standalone preview.html without a Next build.
 * Transpiles the TSX in-process (typescript) and SSRs it (react-dom/server).
 * Usage: node scripts/render-avatar.cjs orbit  */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ROOT = process.cwd();
const cache = {};

function loadModule(file, extraDeps) {
  const abs = path.resolve(ROOT, file);
  if (cache[abs]) return cache[abs];
  const js = ts.transpileModule(fs.readFileSync(abs, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: abs,
  }).outputText;
  const mod = { exports: {} };
  const req = (id) => {
    if (id === "react") return React;
    if (id === "react/jsx-runtime") return require("react/jsx-runtime");
    if (id === "react/jsx-dev-runtime") return require("react/jsx-dev-runtime");
    if (extraDeps && extraDeps[id]) return extraDeps[id];
    return require(id);
  };
  new Function("require", "module", "exports", js)(req, mod, mod.exports);
  cache[abs] = mod.exports;
  return mod.exports;
}

const core = loadModule("src/lib/avatars/core.ts");
const deps = { "@/lib/avatars/core": core };

const MAP = {
  orbit: ["src/lib/avatars/OrbitAvatar.tsx", "OrbitAvatar", "Constellation"],
  grid: ["src/lib/avatars/GridAvatar.tsx", "GridAvatar", "Voltage Grid"],
  hex: ["src/lib/avatars/HexAvatar.tsx", "HexAvatar", "Gem"],
  gradient: ["src/lib/avatars/GradientAvatar.tsx", "GradientAvatar", "Aurora"],
  circuit: ["src/lib/avatars/CircuitAvatar.tsx", "CircuitAvatar", "Voltage"],
};

const variant = process.argv[2] || "orbit";
const [file, name, label] = MAP[variant];
const mod = loadModule(file, deps);
const Comp = mod[name] || mod.default;
const draw = (seed, size) => renderToStaticMarkup(React.createElement(Comp, { seed, size }));

const seeds = [
  "andrej",
  "stiveng",
  "nenad",
  "dimitrije",
  "miki",
  "tiki",
  "mara",
  "moljac",
  "fenjer",
  "etf",
  "garaza",
  "lumen",
  "vatra",
  "kvant",
  "claude",
  "pesic",
];

const grid = (size, clip) =>
  seeds
    .map(
      (s) =>
        `<figure><span class="clip ${clip}" style="width:${size}px;height:${size}px">${draw(s, size)}</span><figcaption>@${s}</figcaption></figure>`,
    )
    .join("");

const rail = seeds
  .slice(0, 4)
  .map(
    (s) =>
      `<div class="rail-row"><span class="clip circle" style="width:40px;height:40px">${draw(s, 40)}</span><span class="rail-tx"><b>${s[0].toUpperCase() + s.slice(1)} Čolić</b><i>@${s}</i></span></div>`,
  )
  .join("");

const out = `<!doctype html><html lang="sr"><head><meta charset="utf-8"><title>${label} — pregled</title>
<style>
:root{--bg:#07060F;--surface:#100D22;--surface-2:#18142F;--line:#2B2552;--ink:#EDE9FF;--muted:#9B95BC;--lemon:#ECE23A}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:'Space Grotesk',system-ui,sans-serif;padding:40px;max-width:1080px;margin:0 auto}
h1{font-size:28px;letter-spacing:-.02em}h1 small{color:var(--muted);font-size:14px;font-weight:400;margin-left:8px}
.lead{color:var(--muted);margin:6px 0 26px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px;margin-bottom:18px}
.card h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:16px}
.hero{display:flex;gap:22px;align-items:center;flex-wrap:wrap}
.clip{display:inline-grid;place-items:center;overflow:hidden;border:1px solid var(--line)}
.clip.circle{border-radius:50%}.clip.rounded{border-radius:22px}
.row{display:flex;flex-wrap:wrap;gap:18px}
figure{display:flex;flex-direction:column;align-items:center;gap:6px}
figcaption{color:var(--muted);font-size:11px}
.on-surface .clip{border-color:#241d49}
.rail{display:flex;flex-direction:column;gap:4px;max-width:230px;background:#0b0918;border:1px solid var(--line);border-radius:14px;padding:10px}
.rail-row{display:flex;align-items:center;gap:11px;padding:8px}
.rail-tx{display:flex;flex-direction:column;line-height:1.25}.rail-tx b{font-size:15px}.rail-tx i{font-style:normal;font-size:13px;color:var(--muted)}
</style></head><body>
<h1>${label}<small>polished · podrazumevani avatari</small></h1>
<p class="lead">Violet struktura + lemon/green „spark" akcenat na tamnoj pozadini — uklopljeno sa ostatkom stranice. Deterministički: isti @handle = isti avatar.</p>

<div class="card"><h2>Hero (140px) — krug i zaobljeni kvadrat</h2>
<div class="hero"><span class="clip circle" style="width:140px;height:140px">${draw("andrej", 140)}</span>
<span class="clip rounded" style="width:140px;height:140px">${draw("andrej", 140)}</span>
<span class="clip circle" style="width:72px;height:72px">${draw("nenad", 72)}</span>
<span class="clip circle" style="width:56px;height:56px">${draw("mara", 56)}</span></div></div>

<div class="card"><h2>16 različitih profila · 64px (krug)</h2><div class="row">${grid(64, "circle")}</div></div>

<div class="card on-surface"><h2>U kontekstu — levi meni (40px, prava veličina)</h2><div class="rail">${rail}</div></div>
</body></html>`;

fs.writeFileSync(`avatar-${variant}-preview.html`, out);
console.log(`wrote avatar-${variant}-preview.html (${label}) · ${seeds.length} seeds rendered`);
