import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../api";
import { COMMODITY_PRESETS } from "../engine";
import type { Calibration, CommodityPreset, Policy } from "../types";
import { simulate } from "../engine";

export interface QuickPreset {
  p_c_retail: number | null;
  subsidy: number;
  stock_release: number;
  mu: number;
}

interface SimState {
  commodities: CommodityPreset[];
  commodityId: string;
  calibration: Calibration;
  policy: Policy;
  outcome: Outcome;
  setCommodity: (id: string) => void;
  setCalibration: (patch: Partial<Calibration>) => void;
  setPolicy: (patch: Partial<Policy>) => void;
  applyPreset: (preset: QuickPreset) => void;
  loadCase: (params: { calibration: Calibration; policy: Policy }) => void;
  navigate: (view: string) => void;
}

import type { Outcome } from "../types";

const SimContext = createContext<SimState>(null as unknown as SimState);

const DEFAULT_POLICY = (preset: CommodityPreset): Policy => ({
  p_c_retail: preset.suggested_retail_ceiling,
  p_c_producer: preset.suggested_producer_ceiling || null,
  subsidy: preset.suggested_subsidy,
  stock_release: preset.suggested_stock_release,
  mu: 0.5,
  c_stock: 0.05,
  c_enf: 200.0,
});

export function SimProvider({
  children,
  navigate,
}: {
  children: ReactNode;
  navigate: (view: string) => void;
}) {
  // Seed synchronously from the local mirror (identical to the Rust
  // presets) so first paint is complete; hydrate from the Rust backend
  // when it answers.
  const [commodities, setCommodities] = useState<CommodityPreset[]>(COMMODITY_PRESETS);
  const [commodityId, setCommodityId] = useState(COMMODITY_PRESETS[0]?.id ?? "potatoes");

  useEffect(() => {
    api.getCommodities().then((list) => {
      if (list.length > 0) setCommodities(list);
    });
  }, []);

  const preset = commodities.find((c) => c.id === commodityId) ?? null;

  const [calibrationOverride, setCalibrationOverride] = useState<Calibration | null>(null);
  const [policy, setPolicyState] = useState<Policy | null>(null);

  const calibration = calibrationOverride ?? preset?.calibration ?? null;
  const effectivePolicy = policy ?? (preset ? DEFAULT_POLICY(preset) : null);

  const setCommodity = useCallback((id: string) => {
    setCommodityId(id);
    setCalibrationOverride(null);
    setPolicyState(null);
  }, []);

  const setCalibration = useCallback(
    (patch: Partial<Calibration>) => {
      if (calibration) setCalibrationOverride({ ...calibration, ...patch });
    },
    [calibration],
  );

  const setPolicy = useCallback(
    (patch: Partial<Policy>) => {
      if (effectivePolicy) setPolicyState({ ...effectivePolicy, ...patch });
    },
    [effectivePolicy],
  );

  const applyPreset = useCallback(
    (p: QuickPreset) => {
      setPolicy({ p_c_retail: p.p_c_retail, subsidy: p.subsidy, stock_release: p.stock_release, mu: p.mu });
    },
    [setPolicy],
  );

  const loadCase = useCallback(
    (params: { calibration: Calibration; policy: Policy }) => {
      setCalibrationOverride(params.calibration);
      setPolicyState(params.policy);
      navigate("simulator");
    },
    [navigate],
  );

  // The outcome is deterministic given calibration + policy; compute it
  // locally (identical math to the Rust engine) so sliders stay at 60fps,
  // while the Rust commands serve the comparison/sensitivity/LP views.
  const outcome: Outcome = useMemo(
    () => (calibration && effectivePolicy ? simulate(calibration, effectivePolicy) : ({} as Outcome)),
    [calibration, effectivePolicy],
  );

  const value: SimState = {
    commodities,
    commodityId,
    calibration: calibration ?? ({} as Calibration),
    policy: effectivePolicy ?? ({} as Policy),
    outcome,
    setCommodity,
    setCalibration,
    setPolicy,
    applyPreset,
    loadCase,
    navigate,
  };

  return <SimContext.Provider value={value}>{children}</SimContext.Provider>;
}

export function useSim(): SimState {
  return useContext(SimContext);
}
