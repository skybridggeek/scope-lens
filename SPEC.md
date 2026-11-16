# Project Specification: SCOPE Lens (Subsidy and Cap Outcome Policy Evaluator)

Build a native Windows desktop application in **Rust** using **Tauri v2** (Rust backend for all economic modeling, elasticity solvers, optimization, and PDF generation; TypeScript + React + Tailwind CSS frontend for native-grade RTL/LTR rendering and interactive charts).

---

## 1. Core Identity & Domain Purpose
**SCOPE Lens** is an agricultural and food price-policy decision-support simulator tailored to the Algerian market. It allows economists, policymakers, and students to test the real-world side effects of market interventions—specifically **price ceilings (plafonnement)**, **producer/consumer subsidies**, **strategic stock releases (déstockage)**, and **enforcement monitoring**—before implementation.

### Supported Staple Products (Illustrative Calibrated Presets — Clearly Labeled as "Illustrative / Demo Data")
Include three pre-calibrated staple commodities with editable parameters and a prominent badge indicating that baseline figures are illustrative placeholders ready for official ONS/Ministry data replacement:
1. **Potatoes (بطاطا / Pommes de terre):** High supply volatility, seasonal storage dynamics, wholesale/retail margin friction (inspired by the Oct 2026 cap at 60–70 DZD/kg producer, 80–90 DZD/kg retail vs. 100–140 DZD/kg market price).
2. **Bananas (موز / Bananes):** Import-dependent, low supply elasticity in the short run, high parallel-market diversion risk (inspired by the Apr 2025 cap at 400 DZD/kg vs. 2,000 DZD/kg parallel spike).
3. **Table Oil (زيت المائدة / Huile de table):** Heavily subsidized staple, high fiscal burden, rigid household demand, cross-border/hoarding leakage sensitivity.

---

## 2. Visual Design System & Aesthetic Direction ("Civic Institutional & Editorial Economic")
Design the UI after modern economic research terminals (inspired by *Our World in Data*, *Stripe Press*, and institutional central-bank dashboards)—authoritative, crisp, high-contrast, and calm. **Default to Light Mode** with an optional Warm Paper/Dark Slate toggle.

### Color Palette
- **Primary Canvas:** `#F8FAFC` (Alabaster Slate) with `#FFFFFF` elevated cards and `1px solid #E2E8F0` hairline borders.
- **Primary Brand / Policy Navy:** `#0F2942` (Deep Institutional Navy) for headers, active navigation, and primary actions.
- **Secondary Accent / Fiscal Teal:** `#0D9488` (Macro Teal) for equilibrium/baseline curves and positive welfare indicators.
- **Alert / Parallel Market Amber-Coral:** `#D97706` (Warning Amber) for shortage gaps and `#DC2626` (Crimson Alert) for black-market price spikes and fiscal deficits.
- **Text Hierarchy:** `#0F172A` (Primary Ink), `#475569` (Secondary Slate), `#94A3B8` (Muted Captions).

### Typography & Bidirectional (RTL/LTR) Rules
- **Arabic (`ar`):** `'IBM Plex Sans Arabic'`, `'Cairo'`, sans-serif. Full `dir="rtl"` layout mirroring (sidebar moves to the right, chart axes/tooltips adapt cleanly, icons mirror where directional).
- **French (`fr`) & English (`en`):** `'IBM Plex Sans'` for UI/prose, `'IBM Plex Mono'` with `font-variant-numeric: tabular-nums` for all prices (`DZD/kg`), tonnages, elasticities, and financial tables so numbers align vertically without jitter when dragging sliders.
- **Scale:** Page Title `24px` (700), Section Header `18px` (600), KPI Hero Metric `28px` (700 tabular), Body `14px` (400, line-height `1.6`), Table/Axis Labels `12px` (500).

### Shapes, Motion & Interaction Details
- **Geometry:** Sharp-modern `6px` border radius on cards/buttons, `4px` on inputs/badges; subtle elevation (`0 1px 3px rgba(15, 41, 66, 0.06)`).
- **Animations:** Snappy, purposeful micro-transitions (`150ms cubic-bezier(0.2, 0, 0, 1)`) on tab switches and KPI number interpolation; smooth SVG path transitions (`200ms`) on supply/demand curves as sliders move. No bouncy or playful consumer-app animations.
- **Cursors:** `cursor: pointer` on all interactive controls/tabs; `cursor: ew-resize` when dragging parameter sliders; `cursor: crosshair` when hovering over supply/demand curves and welfare charts.

---

## 3. Internationalization (i18n) & Asset Structure
- **Languages:** Full runtime switching between **Arabic (`ar` - Default)**, **French (`fr`)**, and **English (`en`)**. Every label, economic term, tooltip, methodology formula note, case-study entry, and PDF export string must be translated accurately using proper Maghrebi/Algerian economic terminology (e.g., *السوق الموازية / Marché parallèle / Parallel Market*, *تسقيف الأسعار / Plafonnement des prix / Price Ceiling*, *تفريغ المخزون / Déstockage / Strategic Stock Release*).
- **Logo Directory:** Create an empty directory at `src-tauri/assets/logo/` (and mirror/expose it via a Tauri asset command or `public/logo/`). In the app top bar and PDF header, check if any image file (`logo.png`, `logo.svg`, `logo.jpg`) exists in that folder: if present, render it cleanly; if empty, render a clean typographic monogram badge (`SL | SCOPE Lens`) without broken image icons.

---

## 4. Quantitative Economic Engine (Implemented in Rust)
All mathematical computations must run in Rust (`src-tauri/src/model/`) and expose clean Tauri IPC commands to the frontend. Include adjustable elasticity ranges and sensitivity bounds.

### Model Inputs (Interactive Controls)
1. **Commodity Selector:** Potatoes | Bananas | Table Oil (loads calibrated baseline parameters, all user-overridable).
2. **Producer Price Ceiling ($P_{c,\text{prod}}$ in DZD/kg)** & **Retail Price Ceiling ($P_{c,\text{ret}}$ in DZD/kg)** (with toggle for "No Ceiling").
3. **Unit Subsidy ($S$ in DZD/kg):** Split option between Producer Input Subsidy vs. Consumer Retail Subsidy.
4. **Strategic Stock Release ($\Delta Q_{\text{stock}}$ in Tonnes):** Public buffer stock injected into regulated channels.
5. **Monitoring & Enforcement Intensity ($\mu \in [0, 1]$):** Continuous slider from Weak (`0.1`) to Strict (`0.95`), governing inspection frequency, seizure probability, and trader penalty risk.
6. **Deep Structural Parameters (Collapsible "Calibration & Elasticities" Drawer):**
   - Price Elasticity of Demand ($\varepsilon_d < 0$)
   - Price Elasticity of Supply ($\varepsilon_s > 0$)
   - Unit Production/Import Cost ($C_0$) & Normal Competitive Margin ($m_0$)
   - Cross-Channel Diversion Elasticity ($\gamma$) & Risk Aversion to Seizures ($\lambda$)

### Core Equations & Mechanics
1. **Baseline Unregulated Equilibrium ($P^*, Q^*$):**
   Constant-elasticity (log-linear) demand and supply functions calibrated around observed reference price $P_0$ and quantity $Q_0$:
   $$Q_d(P) = A \cdot P^{\varepsilon_d}, \quad Q_s(P) = B \cdot (P + S_{\text{prod}})^{\varepsilon_s}$$
2. **Regulated Channel Supply & Rationing:**
   When a retail ceiling $P_{c,\text{ret}}$ is active below $P^*$:
   - Effective supplier price is $P_{\text{eff}} = \min(P^*, P_{c,\text{ret}}) + S$.
   - Total physical supply is $Q_{\text{total}} = Q_s(P_{\text{eff}}) + \Delta Q_{\text{stock}}$.
   - **Channel Diversion (Rationing Rule):** If $P_{c,\text{ret}} < C_0(1 + m_0)$, producers/wholesalers withhold supply from the official channel. The fraction diverted to the parallel market $\theta \in [0, 1]$ increases with the margin squeeze $\max\left(0, \frac{C_0(1+m_0) - P_{c,\text{ret}}}{C_0}\right)$ and decreases exponentially with enforcement intensity $\mu$:
     $$\theta = 1 - \exp\left(-\alpha \cdot \frac{\max(0, C_0(1+m_0) - P_{c,\text{ret}})}{C_0} \cdot (1 - \mu)^\beta\right)$$
   - Official regulated quantity sold: $Q_{\text{reg}} = (1 - \theta) Q_{\text{total}}$.
   - Excess demand (Shortage in tonnes): $\Delta Q_{\text{shortage}} = \max(0, Q_d(P_{c,\text{ret}}) - Q_{\text{reg}})$.
3. **Parallel (Black) Market Clearing Price ($P_{\text{par}}$):**
   Residual unserved demand ($Q_d(P_{c,\text{ret}}) - Q_{\text{reg}}$) spills over into the parallel market, met by diverted supply $Q_{\text{par}} = \theta Q_{\text{total}}$ plus a risk premium proportional to enforcement $\mu$:
   $$P_{\text{par}} = P_{c,\text{ret}} \cdot \left(1 + \frac{\Delta Q_{\text{shortage}}}{Q_{\text{par}} + \delta}\right)^{\frac{1}{|\varepsilon_d|}} \cdot (1 + \kappa \mu)$$
4. **Welfare, Fiscal & Household Metrics:**
   - **Government Expenditure (Million DZD):** $G = S \cdot Q_{\text{total}} + c_{\text{stock}} \cdot \Delta Q_{\text{stock}} + c_{\text{enf}} \cdot \mu^2$
   - **Average Effective Household Price:** $P_{\text{avg}} = \frac{Q_{\text{reg}} \cdot P_{c,\text{ret}} + Q_{\text{par}} \cdot P_{\text{par}}}{Q_{\text{reg}} + Q_{\text{par}}}$
   - **Change in Household Expenditure ($\Delta E_h$)** & **Deadweight Loss ($DWL$)** (Harberger triangle + parallel-market rent dissipation).

---

## 5. Application Screens & Architecture
Organize the app with a clean persistent sidebar (respecting RTL/LTR) and five dedicated views:

1. **Interactive Policy Simulator (Primary Workspace):**
   - **Left/Right Control Panel:** Product selector, policy sliders (ceilings, subsidy, stock release, monitoring), quick-preset buttons (*1. No Intervention*, *2. Ceiling Only*, *3. Ceiling + Stock Release*, *4. Direct Subsidy*), and collapsible elasticity calibration drawer.
   - **Top KPI Strip:** 5 tabular cards showing *Official Quantity Sold (t)*, *Market Shortage (t)*, *Parallel Market Price (DZD/kg)*, *Fiscal Cost (M DZD)*, and *Effective Household Spending Change (%)*.
   - **Interactive Visuals:**
     - **Supply, Demand & Rationing Diagram:** Interactive SVG/Canvas plot showing $D(P)$, $S(P)$, $P^*$, $P_{c,\text{ret}}$, $P_{\text{par}}$, shaded shortage gap, and Deadweight Loss area.
     - **Channel Split & Price Comparison Bar Chart:** Regulated vs. Parallel volume and price breakdown.
     - **Sensitivity Tornado / Fan Chart:** Shows output variance across low/base/high elasticity bounds.

2. **Four-Scenario Side-by-Side Comparison:**
   - Automatically computes and compares all four policy regimes simultaneously for the selected commodity using current parameter values.
   - Includes a structured comparison matrix (highlighting best/worst trade-offs per metric) and grouped bar charts comparing Fiscal Cost vs. Shortage vs. Parallel Price.

3. **Wilaya Stock-Release Optimizer (Linear Programming Extension):**
   - Implement a **Simplex / Linear Programming solver in Rust** (using `good_lp` or a clean custom two-phase simplex solver in Rust so there are zero external C-solver DLL headaches on Windows).
   - Allocates a constrained national buffer stock $\bar{Q}_{\text{stock}}$ across a representative set of Algerian wilayas (e.g., Algiers, Oran, Constantine, Setif, Blida, Ouargla, Bechar, Tizi Ouzou) with distinct population demand weights, local deficit severities, and transport costs per tonne.
   - Minimizes total weighted shortage + logistics cost, outputting an optimal allocation table and efficiency score.

4. **Algerian Case Studies & Empirical Timeline:**
   - Interactive retrospective case-study explorer featuring:
     - **Case A: April 2025 Five-Product Price Ceiling (focus on Bananas):** Capped at 400 DZD/kg vs. observed spike up to 2,000 DZD/kg; button to *"Load Retrospective Parameters into Simulator"* to reproduce the spike.
     - **Case B: Autumn 2026 Potato Market Intervention:** Pre-cap prices (100–140 DZD/kg), Oct 1, 2026 ceiling (60–70 producer / 80–90 retail), Oct 18 daily monitoring decree, and Nov 3–4 wholesale friction & Boumerdes seizures.
   - Includes a source verification status tracker distinguishing verified official decrees from press-reported figures.

5. **Methodology, Equations & Calibration Reference:**
   - Cleanly typeset mathematical documentation (using KaTeX) explaining every equation, variable unit, welfare formula, and elasticity reference range, synchronized with the active language (`ar` / `fr` / `en`).

---

## 6. Clean, Unbroken Native PDF Report Export
Implement a dedicated **Export Policy Brief (PDF)** button in the header that generates a clean, multi-page A4 PDF directly from Rust (using `printpdf` or `genpdf` with embedded TTF fonts supporting **Arabic shaping/RTL**, French accents, and English—or headless WebView print-to-PDF via Tauri with strict CSS `@media print` pagination rules so **no table row, chart, or card ever splits awkwardly across a page break**).

### PDF Report Requirements:
- **Header:** Optional logo from `assets/logo/`, report title, commodity analyzed, timestamp, and *"Illustrative Simulation Data"* watermark/badge.
- **Section 1:** Executive Summary & Input Policy Parameters Table.
- **Section 2:** Key Simulated Outcomes & Welfare Impact Table (bold headers, clear borders, `break-inside: avoid` on every row and section).
- **Section 3:** High-resolution vector snapshot of the Supply/Demand curve and 4-Scenario Comparison table.
- **Section 4:** Methodology & Elasticity Assumptions footnote.
- Save via native Windows Save Dialog (`tauri-plugin-dialog`) and offer a one-click *"Open PDF"* toast notification.

---

## 7. Build & Delivery Expectations
1. Initialize the full Tauri v2 + Rust + React/TypeScript project structure cleanly so `cargo tauri dev` and `cargo tauri build` compile on Windows without missing system dependencies.
2. Write comprehensive Rust unit tests (`cargo test`) verifying:
   - Market clearing when $P_c \ge P^*$ (no distortion).
   - Shortage and parallel-market price escalation when $P_c < C_0(1+m_0)$ and monitoring $\mu$ is low.
   - Stock release mitigating shortages and lowering $P_{\text{par}}$.
   - Wilaya LP optimizer respecting total stock constraints.
3. Ensure zero hardcoded single-language strings—every UI element reads from structured `ar.json`, `fr.json`, and `en.json` locale dictionaries.