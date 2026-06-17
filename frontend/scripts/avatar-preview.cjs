/* Extracts the real rendered avatar SVGs from the prerendered gallery and
 * assembles a single self-contained preview.html (no dev server needed). */
const fs = require("fs");

const html = fs.readFileSync(".next/server/app/demo/avatars.html", "utf8");

const seeds = ["andrej","stiveng","nenad","dimitrije","miki","tiki","mara","moljac","fenjer","etf","garaza","lumen","vatra","kvant"];
const variants = [
  { id: "grid",     label: "Voltage Grid", desc: "Identikon mreža 5×5, mirror simetrija" },
  { id: "hex",      label: "Gem",          desc: "Brušeni dragulj — heksagon sa fasetama" },
  { id: "gradient", label: "Aurora",       desc: "Mirni gradijent + meki sjaj" },
  { id: "circuit",  label: "Voltage",      desc: "Štampana ploča + munja u centru" },
  { id: "orbit",    label: "Constellation",desc: "Sazvežđe — centar i sateliti (graf tima)" },
];

const anchors = variants
  .map((v) => ({ ...v, idx: html.indexOf("av-" + v.id) }))
  .filter((a) => a.idx >= 0)
  .sort((a, b) => a.idx - b.idx);

const svgRe = /<svg\b[^>]*>[\s\S]*?<\/svg>/g;
const sliceFor = (i) => {
  const s = anchors[i].idx;
  const e = i + 1 < anchors.length ? anchors[i + 1].idx : html.length;
  return html.slice(s, e);
};

const cards = anchors.map((a, i) => {
  const svgs = sliceFor(i).match(svgRe) || [];
  return {
    ...a,
    hero: svgs.find((s) => /width="120"/.test(s)) || "",
    strip: svgs.filter((s) => /width="48"/.test(s)),
  };
});

const stripRow = (c) =>
  c.strip
    .map((svg, j) => `<figure><span class="clip">${svg}</span><figcaption>@${seeds[j] || ""}</figcaption></figure>`)
    .join("");

const sections = cards
  .map(
    (c) => `
<section class="card">
  <header><h2>${c.label}</h2><code>${c.id}</code><span>${c.desc}</span></header>
  <div class="hero"><span class="clip big">${c.hero}</span>
    <p>Isti stil, 14 različitih profila — svaki @handle daje drugačiju umetnost ↓</p></div>
  <div class="strip">${stripRow(c)}</div>
</section>`
  )
  .join("");

const out = `<!doctype html><html lang="sr"><head><meta charset="utf-8">
<title>tikimiki — generativni avatari</title>
<style>
:root{--bg:#07060F;--surface:#100D22;--line:#2B2552;--ink:#EDE9FF;--muted:#9B95BC;--lemon:#ECE23A}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:'Space Grotesk',system-ui,sans-serif;padding:40px;max-width:1100px;margin:0 auto}
h1{font-size:30px;letter-spacing:-.02em;margin-bottom:6px}
.lead{color:var(--muted);margin-bottom:28px;line-height:1.55}
.lead code{color:var(--lemon)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px 22px;margin-bottom:18px}
.card header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.card h2{font-size:20px}
.card code{font-family:ui-monospace,monospace;color:var(--lemon);font-size:13px}
.card header span{color:var(--muted);font-size:13px;margin-left:auto;text-align:right}
.hero{display:flex;align-items:center;gap:18px;margin-bottom:18px}
.hero p{color:var(--muted);font-size:13px;max-width:320px;line-height:1.5}
.clip{display:inline-grid;place-items:center;overflow:hidden;border-radius:50%}
.clip.big{width:120px;height:120px}
.strip{display:flex;flex-wrap:wrap;gap:14px}
.strip figure{display:flex;flex-direction:column;align-items:center;gap:5px}
.strip .clip{width:48px;height:48px}
.strip figcaption{color:var(--muted);font-size:11px}
</style></head>
<body>
<h1>Generativni avatari — 5 stilova</h1>
<p class="lead">Podrazumevani avatar je jedinstvena generativna sličica po profilu (ne inicijali). Deterministički: isti @handle uvek daje isti avatar. Statički pregled; živa galerija sa unosom seed-a je na <code>/demo/avatars</code>.</p>
${sections}
</body></html>`;

fs.writeFileSync("avatar-preview.html", out);
console.log("wrote avatar-preview.html ·", cards.map((c) => c.id + ":" + (c.hero ? c.strip.length + "seeds" : "NO-HERO")).join("  "));
