import { useCallback, useEffect, useState } from "react";

export type PeriodPreset = "today" | 7 | 30 | "all";

const ITR_PERIOD_KEY = "pto-itr-period-v1";
const LEGACY_DIRECTOR_PERIOD_KEY = "pto-director-period-v1";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function rangeFromPreset(preset: PeriodPreset): { from: string; to: string } {
  if (preset === "all") return { from: "", to: "" };
  const to = todayStr();
  const start = new Date();
  if (preset === "today") return { from: to, to };
  start.setDate(start.getDate() - preset + 1);
  return { from: start.toISOString().slice(0, 10), to };
}

function loadPreset(): PeriodPreset {
  const raw =
    sessionStorage.getItem(ITR_PERIOD_KEY) ?? sessionStorage.getItem(LEGACY_DIRECTOR_PERIOD_KEY);
  if (raw === "today" || raw === "all") return raw;
  if (raw === "7") return 7;
  if (raw === "30") return 30;
  return 7;
}

interface ItrPeriodState {
  preset: PeriodPreset;
  manualFrom: string;
  manualTo: string;
}

const listeners = new Set<(state: ItrPeriodState) => void>();
let currentState: ItrPeriodState = {
  preset: typeof window !== "undefined" ? loadPreset() : 7,
  manualFrom: "",
  manualTo: ""
};

function setState(next: Partial<ItrPeriodState>) {
  currentState = { ...currentState, ...next };
  if (typeof window !== "undefined") {
    sessionStorage.setItem(ITR_PERIOD_KEY, String(currentState.preset));
  }
  listeners.forEach((listener) => listener(currentState));
}

export interface ItrPeriod {
  preset: PeriodPreset;
  manualFrom: string;
  manualTo: string;
  setPreset: (preset: PeriodPreset) => void;
  setManualFrom: (value: string) => void;
  setManualTo: (value: string) => void;
  range: { from: string; to: string };
}

export function useItrPeriod(): ItrPeriod {
  const [state, setLocalState] = useState<ItrPeriodState>(currentState);

  useEffect(() => {
    const listener = (next: ItrPeriodState) => setLocalState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setPreset = useCallback((preset: PeriodPreset) => {
    setState({ preset, manualFrom: "", manualTo: "" });
  }, []);
  const setManualFrom = useCallback((value: string) => setState({ manualFrom: value }), []);
  const setManualTo = useCallback((value: string) => setState({ manualTo: value }), []);

  const range =
    state.manualFrom || state.manualTo
      ? { from: state.manualFrom, to: state.manualTo }
      : rangeFromPreset(state.preset);

  return {
    preset: state.preset,
    manualFrom: state.manualFrom,
    manualTo: state.manualTo,
    setPreset,
    setManualFrom,
    setManualTo,
    range
  };
}
