// Loads data/scope-data.json — the single place to add or edit products,
// wilayas, and study cases. Friendly field names are normalized here into
// the engine's Calibration/Policy shapes; omitted fields get defaults.

import raw from "../data/scope-data.json";
import type { Lang } from "./i18n";
import type { Calibration, CommodityPreset, Policy, WilayaInput } from "./types";

export type LocalizedText = Partial<Record<Lang, string>>;

export function pickText(text: LocalizedText, lang: Lang): string {
  return text[lang] || text.en || text.fr || text.ar || "";
}

interface RawAdvanced {
  alpha?: number;
  beta?: number;
  delta?: number;
  kappa?: number;
}

interface RawProduct {
  id: string;
  name: LocalizedText;
  price: number;
  quantity: number;
  cost: number;
  demand_sensitivity?: number;
  supply_sensitivity?: number;
  markup?: number;
  ceiling?: number;
  producer_ceiling?: number;
  subsidy?: number;
  stock_release?: number;
  advanced?: RawAdvanced;
}

interface RawWilaya {
  id: string;
  name: LocalizedText;
  deficit: number;
  transport?: number;
  priority?: number;
}

interface RawCase {
  id: string;
  product: string;
  date: LocalizedText;
  title: LocalizedText;
  body: LocalizedText;
  focus?: LocalizedText;
  facts?: { text: LocalizedText; status: string }[];
  calibration?: Partial<RawProduct>;
  policy?: {
    ceiling?: number | null;
    producer_ceiling?: number | null;
    subsidy?: number;
    stock_release?: number;
    monitoring?: number;
  };
}

function requireFields(entry: Record<string, unknown>, fields: string[], kind: string): void {
  for (const f of fields) {
    if (entry[f] === undefined || entry[f] === null || entry[f] === "") {
      throw new Error(`scope-data.json: ${kind} "${entry.id ?? "?"}" is missing required field "${f}"`);
    }
  }
}

function toCalibration(p: RawProduct): Calibration {
  const adv = p.advanced ?? {};
  return {
    p0: p.price,
    q0: p.quantity,
    eps_d: p.demand_sensitivity ?? -0.4,
    eps_s: p.supply_sensitivity ?? 0.6,
    c0: p.cost,
    m0: p.markup ?? 0.2,
    alpha: adv.alpha ?? 3,
    beta: adv.beta ?? 2,
    delta: adv.delta ?? 100,
    kappa: adv.kappa ?? 0.1,
  };
}

const rawProducts = raw.products as RawProduct[];
const rawWilayas = raw.wilayas as RawWilaya[];
const rawCases = raw.cases as RawCase[];

export const COMMODITY_PRESETS: CommodityPreset[] = rawProducts.map((p) => {
  requireFields(p as unknown as Record<string, unknown>, ["id", "name", "price", "quantity", "cost"], "product");
  return {
    id: p.id,
    calibration: toCalibration(p),
    suggested_retail_ceiling: p.ceiling ?? Math.round((p.price * 2) / 3),
    suggested_producer_ceiling: p.producer_ceiling ?? 0,
    suggested_subsidy: p.subsidy ?? 0,
    suggested_stock_release: p.stock_release ?? 0,
  };
});

export const DEFAULT_WILAYAS: WilayaInput[] = rawWilayas.map((w) => {
  requireFields(w as unknown as Record<string, unknown>, ["id", "name", "deficit"], "wilaya");
  return { id: w.id, deficit: w.deficit, transport: w.transport ?? 10, priority: w.priority ?? 0.8 };
});

export interface StudyCase {
  id: string;
  productId: string;
  date: LocalizedText;
  title: LocalizedText;
  body: LocalizedText;
  focus?: LocalizedText;
  facts: { text: LocalizedText; status: string }[];
  calibration: Calibration;
  policy: Policy;
}

export const CASES: StudyCase[] = rawCases.map((c) => {
  requireFields(c as unknown as Record<string, unknown>, ["id", "product", "title", "date", "body"], "case");
  const product = rawProducts.find((p) => p.id === c.product);
  if (!product) {
    throw new Error(`scope-data.json: case "${c.id}" references unknown product "${c.product}"`);
  }
  const merged: RawProduct = { ...product, ...c.calibration, id: product.id, name: product.name };
  if (c.calibration?.advanced) {
    merged.advanced = { ...product.advanced, ...c.calibration.advanced };
  }
  const pol = c.policy ?? {};
  return {
    id: c.id,
    productId: c.product,
    date: c.date,
    title: c.title,
    body: c.body,
    focus: c.focus,
    facts: c.facts ?? [],
    calibration: toCalibration(merged),
    policy: {
      p_c_retail: pol.ceiling ?? null,
      p_c_producer: pol.producer_ceiling ?? null,
      subsidy: pol.subsidy ?? 0,
      stock_release: pol.stock_release ?? 0,
      mu: pol.monitoring ?? 0.5,
      c_stock: 0.05,
      c_enf: 200,
    },
  };
});

export function productName(id: string, lang: Lang): string {
  const p = rawProducts.find((x) => x.id === id);
  return p ? pickText(p.name, lang) || id : id;
}

export function wilayaName(id: string, lang: Lang): string {
  const w = rawWilayas.find((x) => x.id === id);
  return w ? pickText(w.name, lang) || id : id;
}