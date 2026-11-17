// Shared by server and client (the automation form and both automation pages): the settings shape and its defaults.
// It must stay a plain module: a "use client" file can't export values that a server page calls.

export type AutomationSettings = {
  instant: { on: boolean; delayMin: number; text: string };
  afterHours: { on: boolean; from: string; to: string; text: string };
  followUp: { on: boolean; afterHours: number; text: string };
  optIn: { on: boolean; delayMin: number; text: string };
};

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  instant: { on: false, delayMin: 2, text: "" },
  afterHours: { on: false, from: "23:00", to: "08:00", text: "" },
  followUp: { on: false, afterHours: 3, text: "" },
  optIn: { on: false, delayMin: 30, text: "" },
};

/** Saved settings on top of the defaults (older numbers have no opt-in block yet). */
export function withDefaults(saved: Partial<AutomationSettings> | null | undefined): AutomationSettings {
  return {
    instant: { ...AUTOMATION_DEFAULTS.instant, ...(saved?.instant ?? {}) },
    afterHours: { ...AUTOMATION_DEFAULTS.afterHours, ...(saved?.afterHours ?? {}) },
    followUp: { ...AUTOMATION_DEFAULTS.followUp, ...(saved?.followUp ?? {}) },
    optIn: { ...AUTOMATION_DEFAULTS.optIn, ...(saved?.optIn ?? {}) },
  };
}
