# SCOPE Lens

**Subsidy and Cap Outcome Policy Evaluator** — a native Windows desktop app that simulates
Algerian food-price policies (price ceilings, subsidies, strategic stock releases, enforcement)
for staple commodities, and exports a bilingual-ready **Policy Brief PDF** (Arabic / French / English).

> **All numbers shipped with the app are illustrative demo data.** They are calibrated to look
> plausible (potatoes, bananas, table oil) and are clearly labelled as such in the UI and in every
> PDF. The app is built so that official data can replace them by editing a handful of files —
> see [Updating the data](#7-updating-the-data-wilayas-products-cases).

---

## Contents

1. [What the app does](#1-what-the-app-does)
2. [Running it](#2-running-it)
3. [The five screens](#3-the-five-screens)
4. [How the economic model works](#4-how-the-economic-model-works)
5. [How the app is built (architecture)](#5-how-the-app-is-built-architecture)
6. [The PDF export pipeline](#6-the-pdf-export-pipeline)
7. [Updating the data (products, wilayas, cases)](#7-updating-the-data-products-wilayas-cases)
8. [Translations and branding](#8-translations-and-branding)
9. [Tests and verification](#9-tests-and-verification)
10. [Project layout](#10-project-layout)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. What the app does

You pick a commodity, move policy sliders (ceiling price, subsidy, stock release, enforcement
intensity), and the app instantly recomputes:

- how much food reaches the **official channel** vs. leaks to the **parallel market**,
- the **shortage** (queues) at the ceiling price,
- the **parallel-market price** that clears the leftover demand,
- the **fiscal cost** to the state (subsidy + stock logistics + enforcement),
- the **change in household spending** vs. a free market,
- and a **deadweight-loss** estimate.

It then compares four policy regimes side by side, optimizes how a limited national stock
should be split across wilayas, and replays two historical Algerian case studies.
Everything can be exported as a formatted, right-to-left-correct Arabic (or FR/EN) PDF brief.

---

## 2. Running it

### Option A — Install the Windows app (recommended)

1. Open `src-tauri\target\release\bundle\msi\SCOPE Lens_0.1.0_x64_en-US.msi`
   (rebuild it first if you changed code — see below).
2. Follow the installer. Launch **SCOPE Lens** from the Start menu.

No internet, no server, no database service needed: everything runs locally inside the app.

### Option B — Build the installer yourself

Requires: [Node.js](https://nodejs.org) ≥ 20, [Rust](https://rustup.rs) (stable, MSVC toolchain),
and the Tauri Windows prerequisites (WebView2 is preinstalled on Windows 10/11).

```bash
npm install          # once, downloads frontend dependencies
npm run tauri build -- --bundles msi
```

The installer appears at `src-tauri/target/release/bundle/msi/`.

### Option C — Developer mode (live reload)

```bash
npm run dev          # terminal 1: frontend on http://localhost:1420
cd src-tauri
cargo run            # terminal 2: native window pointing at that server
```

If `cargo run` complains that **port 1420 is already in use** (because terminal 1 already owns
it), start the native shell without letting Tauri spawn its own frontend server:

```bash
cd src-tauri
cargo run --no-default-features
```

### Option D — Plain browser preview (no Rust needed)

```bash
npm run dev
```

Open http://localhost:1420. The UI runs fully in the browser using a TypeScript mirror of the
Rust engine; PDF export falls back to a normal browser download instead of a save dialog.

---

## 3. The five screens

| Screen | What you do there |
|---|---|
| **Interactive Policy Simulator** | Commodity selector, calibration read-outs, policy sliders/steppers, quick presets, live KPI cards, supply/demand/rationing diagram with shortage shading and deadweight-loss wedge, official-vs-parallel channel bars. |
| **Four-Scenario Comparison** | Same calibration, four regimes (no intervention / ceiling only / ceiling + stock release / direct subsidy) in one table + tornado-style sensitivity of the outcomes to demand and supply elasticity. |
| **Wilaya Stock-Release Optimizer** | Enter a national stock budget (tonnes); a linear program allocates it across wilayas to minimize priority-weighted shortage + transport cost. Per-wilaya allocated/unmet bars and efficiency score. Wilaya deficits, transport costs and priorities are editable in the table. |
| **Algerian Case Studies** | Two replayed episodes (banana ceiling spike, Apr 2025; potato autumn ceiling). "Load into simulator" copies the case's calibration + policy into the simulator so you can explore alternatives. |
| **Methodology & Equations** | The full model written out with KaTeX equations, parameter meanings, elasticity reference ranges, and honest limitations. |

The top bar holds the **language switcher (AR / FR / EN)** and **Export Policy Brief (PDF)**.
Arabic switches the whole app to right-to-left, including charts and tables.

---

## 4. How the economic model works

Partial-equilibrium, constant-elasticity curves calibrated at a reference point `(p0, q0)`:

```
Demand:  Qd(p) = q0 · (p / p0)^eps_d        (eps_d < 0)
Supply:  Qs(p) = q0 · (p / p0)^eps_s        (eps_s > 0)
Free market: p* = p0, q* = q0
```

**With a binding retail ceiling `p_c < p*`:**

1. Effective producer price = `p_c + subsidy`; total available quantity
   `Q = Qs(p_c + subsidy) + stock_release`.
2. **Margin squeeze** = how far the ceiling sits below the competitive cost-plus-margin price
   `c0·(1+m0)`. The deeper the squeeze and the weaker the enforcement `mu`, the more suppliers
   divert to the parallel market:
   `theta = 1 − exp(−alpha · squeeze · (1−mu)^beta)` (0 when there is no squeeze).
3. Official quantity `q_reg = (1−theta)·Q`; parallel quantity `q_par = theta·Q`.
4. **Shortage** = `max(0, Qd(p_c) − q_reg)`.
5. **Parallel price** clears the unmet demand against the diverted quantity, with a small-quantity
   damper `delta` and an enforcement risk premium `kappa·mu`:
   `p_par = p_c · (1 + shortage/(q_par + delta))^(1/|eps_d|) · (1 + kappa·mu)`.

**Fiscal cost** (million DZD) = `subsidy·(q_reg+q_par)/1e6 + c_stock·stock_release + c_enf·mu²`.
**Household spending change** compares `p_avg·Q` (volume-weighted official/parallel price) with
baseline spending `p*·Qd(p*)`. **DWL** = Harberger triangle on the shortage plus rent dissipation
on diverted quantity.

**Wilaya optimizer** — linear program (pure-Rust solver, no external DLLs):

```
minimize  Σ_w [ priority_w · 0.5 · (deficit_w − alloc_w) + transport_w/1000 · alloc_w ]
subject to  Σ alloc_w ≤ total_stock,   0 ≤ alloc_w ≤ deficit_w
```

i.e. serve the wilayas where an unmet tonne hurts most (priority) and delivery is cheapest first.

The exact same math lives in two places that must stay identical:

- **Rust (authoritative inside the app):** `src-tauri/src/model/market.rs`, `scenarios.rs`, `optimizer.rs`
- **TypeScript mirror (browser fallback + instant slider feedback):** `src/engine.ts`

---

## 5. How the app is built (architecture)

```
┌────────────────────────── Tauri v2 native window ──────────────────────────┐
│  React 18 + TypeScript + Tailwind (src/)                                   │
│   • SimContext holds commodity / calibration / policy state                │
│   • sliders recompute outcomes locally via src/engine.ts (60 fps)          │
│   • comparison / sensitivity / optimizer / PDF call Rust commands          │
│                │ invoke() IPC (JSON serde structs)                         │
│  Rust backend (src-tauri/src/)                                             │
│   • model/  : market, scenarios, optimizer, presets  (the economics)       │
│   • pdf.rs  : printpdf-based Policy Brief generator (AR/FR/EN)             │
│   • main.rs : #[tauri::command] surface + dialog plugin                     │
└────────────────────────────────────────────────────────────────────────────┘
```

Rust commands exposed to the UI (`src-tauri/src/main.rs`):

| Command | Purpose |
|---|---|
| `get_commodities` | commodity presets (calibration + suggested policy anchors) |
| `get_wilayas` | default wilaya list (deficit / transport / priority) |
| `run_simulation` | one calibration + policy → outcomes |
| `compare_scenarios` | the four regimes |
| `sensitivity` | elasticity low/base/high rows for the tornado chart |
| `optimize_wilayas` | LP allocation for a stock budget |
| `export_pdf` | builds the PDF bytes from a fully localized report payload |
| `write_pdf` | writes bytes to the path chosen in the save dialog |
| `get_logo_asset` | finds the logo file for the PDF header |

`src/api.ts` wraps every command with a browser fallback to `src/engine.ts`, so the identical UI
works with or without the native shell.

---

## 6. The PDF export pipeline

1. **Frontend assembles the report** (`src/useExportPdf.ts` + `src/pdfReport.ts`): all labels are
   already translated, numbers formatted with `Intl` for the active locale, and the supply/demand
   diagram is converted to normalized vector polylines/rectangles/labels. A sanitizer strips
   characters the embedded font lacks (Unicode minus, subscript digits, zero-width bidi marks).
2. **Rust renders it** (`src-tauri/src/pdf.rs`) with `printpdf`: A4, embedded
   **IBM Plex Sans Arabic** (regular + bold), navy/teal/amber brand palette, logo header,
   parameter and outcome tables, vector chart, four-regime grid, methodology section,
   page numbers and footer. Page breaks keep headings with their content.
3. **Arabic text is shaped manually** because printpdf draws glyphs verbatim:
   `arabic_reshaper` (letter joining) → `unicode-bidi` (visual reordering) → **glyph mirroring**
   of paired punctuation inside RTL runs (so `(طن)` prints with correctly curved brackets,
   not inverted ones) → painted left-to-right. RTL pages mirror margins, table columns and
   the logo position.
4. **Save dialog** (`tauri-plugin-dialog`) → `write_pdf` writes the file to the chosen
   location. In a plain browser the PDF downloads directly instead.

---

## 7. Updating the data (products, wilayas, cases)

**Everything lives in one file: `data/scope-data.json`.** Both the Rust backend and the
frontend read it, so you edit it once — no code changes, no duplicate lists, no translation
files to touch. The file starts with a `_README` block that explains every field.

The file has three lists:

- `products` — the commodities in the simulator selector, comparison and PDF.
- `wilayas` — the rows of the stock-release optimizer.
- `cases` — the study-case cards; "Load into simulator" works automatically.

### 7.1 Adding a product

Copy an existing product block, paste it at the end of the `products` list, and edit:

```json
{
  "id": "tomatoes",
  "name": { "en": "Tomatoes", "fr": "Tomates", "ar": "طماطم" },
  "price": 90,
  "quantity": 30000,
  "cost": 55,
  "ceiling": 70,
  "subsidy": 15,
  "stock_release": 2000
}
```

Only `id`, `name`, `price` (DZD/kg), `quantity` (tonnes) and `cost` (DZD/kg) are required.
Everything else is optional and has a documented default: `demand_sensitivity` (−0.4),
`supply_sensitivity` (0.6), `markup` (0.2), `ceiling` (⅔ of price), `producer_ceiling` (0),
`subsidy` (0), `stock_release` (0), and `advanced` (`alpha` 3, `beta` 2, `delta` 100,
`kappa` 0.1 — the parallel-market tuning parameters). Names may be given in one language
only; the app falls back to the others.

**Replacing demo figures with official data:** edit `price`/`quantity` from observed market
prices/volumes (e.g. ONILEV / ministry bulletins), the sensitivities from published estimates
or your own regression, `cost`/`markup` from import/production cost accounts. Keep the units:
**DZD/kg, tonnes, million DZD**. The UI badge ("Illustrative data…") lives in `app.badge` in
the three dictionaries — change it once your data is official.

### 7.2 Adding a wilaya

```json
{ "id": "tlemcen", "name": { "en": "Tlemcen", "fr": "Tlemcen", "ar": "تلمسان" }, "deficit": 2000, "transport": 20, "priority": 0.8 }
```

`id`, `name`, `deficit` (tonnes) are required; `transport` (DZD/kg, default 10) and
`priority` (0–1, higher = served first, default 0.8) are optional. All 58 wilayas can be
listed this way — the optimizer scales trivially.

### 7.3 Adding a study case

```json
{
  "id": "tomatoes-summer-2026",
  "product": "tomatoes",
  "date": { "en": "July 2026" },
  "title": { "en": "Summer 2026 tomato ceiling" },
  "body": { "en": "What happened, in one or two sentences." },
  "facts": [ { "text": { "en": "Ceiling of 70 DZD/kg" }, "status": "verified" } ],
  "calibration": { "demand_sensitivity": -0.5 },
  "policy": { "ceiling": 70, "monitoring": 0.3 }
}
```

`product` must be the `id` of a product in the same file. `calibration` overrides any product
field for this case only (including `advanced.delta` etc.); `policy` sets the loaded sliders
(`ceiling`, `producer_ceiling`, `subsidy`, `stock_release`, `monitoring` 0–1; omit `ceiling`
for no ceiling). `facts` statuses are `verified` (official decree) or `press` (press-reported).

### 7.4 Policy defaults, costs and slider ranges

- Suggested policy anchors: the `ceiling` / `producer_ceiling` / `subsidy` / `stock_release`
  fields of each product in the data file.
- Stock logistics cost `c_stock` (million DZD/tonne) and enforcement cost scale `c_enf`
  (million DZD): defaults in `src/state/SimContext.tsx` (`DEFAULT_POLICY`) and `src/data.ts`
  (cases); slider bounds live in `src/views/SimulatorView.tsx`.
- Shortage penalty used by the optimizer: `SHORTAGE_PENALTY_PER_T` in **both**
  `src-tauri/src/model/optimizer.rs` and `src/engine.ts` (keep them equal).

### 7.5 After any data edit

The file must stay valid JSON (quotes, commas, braces). If it is broken, the app says so
explicitly at startup. To check and ship:

```bash
npx tsc --noEmit                 # frontend type check
cd src-tauri && cargo test       # engine + data + PDF contract tests
```

then rebuild the installer or restart dev mode. If you changed anything that feeds the PDF
(payload shape or translations), refresh the contract fixtures first — see Section 9.

---

## 8. Translations and branding

- **Languages:** `src/i18n/en.json`, `fr.json`, `ar.json`. Same key tree in all three; the app
  falls back to the key path if a translation is missing. Arabic automatically flips layout
  direction (`dir="rtl"`), chart anchors and PDF mirroring.
- **Adding a language:** copy a dictionary, translate, register it in `src/i18n/index.tsx`.
- **Logo:** drop `logo.png` (or `.svg`/`.jpg`) into `src-tauri/assets/logo/` — used by the PDF
  header; the in-app logo component is `src/components/AppLogo.tsx` and the window/installer
  icons live in `src-tauri/icons/` (regenerate with `npm run tauri icon <png>`).
- **PDF fonts:** `src-tauri/assets/fonts/` (IBM Plex Sans Arabic regular/bold, embedded at compile
  time). If you swap fonts, re-check glyph coverage for Arabic, digits and punctuation.
- **Colors:** brand palette constants at the top of `src-tauri/src/pdf.rs` and in
  `src/index.css` / Tailwind config (navy `#0F2942`, teal `#0D9488`, amber `#D97706`).

---

## 9. Tests and verification

```bash
cd src-tauri
cargo test          # 13 tests: market behaviour, optimizer, scenarios, PDF generation
```

The PDF tests include a **frontend contract test**: real report payloads produced by the actual
TypeScript code (`src/pdfReport.ts` + the locale dictionaries) are stored as
`src-tauri/tests/fixtures/report-ar.json` and `report-fr.json` and fed through the Rust
serializer/renderer, so frontend and backend can never drift apart silently.

Regenerate the fixtures after changing `src/pdfReport.ts`, `src/useExportPdf.ts` or translations:

```bash
npx esbuild scripts/gen-pdf-fixture.mts --bundle --format=esm --platform=node --outfile=scripts/gen-pdf-fixture.bundle.mjs
node scripts/gen-pdf-fixture.bundle.mjs
del scripts\gen-pdf-fixture.bundle.mjs
```

The tests also write sample PDFs to your temp folder (`scope-lens-fixture-ar.pdf`,
`scope-lens-fixture-fr.pdf`, …) for visual inspection.

Frontend checks: `npx tsc --noEmit` (types) and `npm run build` (production bundle).

---

## 10. Project layout

```
├── SPEC.md                     authoritative product/spec document
├── README.md                   this file
├── data/scope-data.json        THE data file: products, wilayas, study cases (edit here)
├── package.json                frontend scripts (dev / build / tauri)
├── scripts/
│   └── gen-pdf-fixture.mts     regenerates Rust PDF contract fixtures from TS code
├── src/                        React + TypeScript frontend
│   ├── App.tsx                 shell: top bar + sidebar + view switch
│   ├── api.ts                  IPC wrappers with browser fallbacks
│   ├── engine.ts               TS mirror of the Rust economics
│   ├── data.ts                 loads data/scope-data.json (defaults, names, cases)
│   ├── pdfReport.ts            builds the PDF payload (tables + vector chart)
│   ├── useExportPdf.ts         export flow: sanitize → invoke → save dialog
│   ├── types.ts                shared serde-mirroring types
│   ├── i18n/                   en / fr / ar dictionaries + provider
│   ├── state/SimContext.tsx    global simulator state
│   ├── components/             TopBar, Sidebar, charts, controls, logo
│   └── views/                  the five screens
└── src-tauri/                  Rust backend + native packaging
    ├── tauri.conf.json         window, bundle (MSI), dev/build commands
    ├── capabilities/           IPC permissions (dialog save)
    ├── assets/                 logo/ + fonts/ (embedded into the binary)
    ├── icons/                  app/installer icons
    ├── tests/fixtures/         PDF contract payloads (ar, fr)
    └── src/
        ├── main.rs             Tauri commands + plugin registration
        ├── pdf.rs              Policy Brief renderer (shaping, bidi, mirroring, layout)
        └── model/
            ├── market.rs       calibration/policy/outcome structs + simulation
            ├── scenarios.rs    four regimes + elasticity sensitivity
            ├── data.rs         reads data/scope-data.json (shared with frontend)
            ├── optimizer.rs    wilaya LP + default wilayas from the data file
            └── presets.rs      product presets from the data file
```

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `cargo run` / `tauri dev`: "Port 1420 already in use" | Another dev server owns the port. Use `cargo run --no-default-features` in `src-tauri`, or stop the other server first. |
| Browser preview: PDF button downloads instead of showing a save dialog | Expected outside the native app; the save dialog exists only in the Tauri window. |
| Edited `data/scope-data.json` but the running app shows old numbers | The native binary embeds the data file at compile time — restart `cargo run` (or rebuild the MSI). In dev mode the frontend hot-reloads, but the Rust side needs a restart. |
| Arabic PDF shows empty boxes | A character missing from the embedded font slipped through. The sanitizer in `src/useExportPdf.ts` strips the known offenders; extend `PDF_CHAR_FIXES` if you introduce new symbols. |
| Arabic brackets look inverted in a PDF | Should not happen anymore: `shape_text` in `src-tauri/src/pdf.rs` mirrors paired punctuation in RTL runs. If you add new bracket-like characters, extend `mirror_char`. |
| Installer build fails on Windows | Ensure Rust MSVC toolchain + Visual Studio Build Tools (C++ workload) and WebView2 runtime are installed. |
| Window is blank in dev mode | The frontend server isn't running: start `npm run dev` first, then the Rust shell. |

---

*SCOPE Lens v0.1.0 — illustrative simulation for policy discussion, not an official forecast.*