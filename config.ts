// Defaults only. In Phase 6 real plans, prices and limits are read from the
// database (admin_settings / plans) and are editable from the Admin Dashboard.
// No payment is connected; nothing here charges anyone.

export interface PlanLimits {
  maxProjects: number;
  maxUploadMB: number;
  maxExportHeight: 720 | 1080 | 2160;
  aiCreditsPerMonth: number;
  storageMB: number;
}

export const DEFAULT_FREE: PlanLimits = {
  maxProjects: 3,
  maxUploadMB: 200,
  maxExportHeight: 720,
  aiCreditsPerMonth: 0,
  storageMB: 500,
};

export function resolveLimits(row: Partial<PlanLimits> | null): PlanLimits {
  return { ...DEFAULT_FREE, ...(row ?? {}) };
}
