import { api } from "./api";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SalaryCalculation {
  grossMonthly: number;
  inssMonthly: number;
  irrfMonthly: number;
  netMonthly: number;
  netAnnual: number;
  taxAnnual: number;
}

export interface SalaryProfile {
  id: number;
  userId: number;
  grossSalary: number;
  dependents: number;
  paymentDay: number;
  createdAt: string;
  updatedAt: string;
  calculation: SalaryCalculation;
}

export interface UpsertSalaryProfilePayload {
  gross_salary: number;
  dependents?: number;
  payment_day?: number;
}

// ─── Normalization ────────────────────────────────────────────────────────────

const normalizeCalculation = (raw: Record<string, unknown>): SalaryCalculation => ({
  grossMonthly: Number(raw.grossMonthly) || 0,
  inssMonthly:  Number(raw.inssMonthly)  || 0,
  irrfMonthly:  Number(raw.irrfMonthly)  || 0,
  netMonthly:   Number(raw.netMonthly)   || 0,
  netAnnual:    Number(raw.netAnnual)    || 0,
  taxAnnual:    Number(raw.taxAnnual)    || 0,
});

const normalizeProfile = (raw: Record<string, unknown>): SalaryProfile => ({
  id:          Number(raw.id) || 0,
  userId:      Number(raw.userId) || 0,
  grossSalary: Number(raw.grossSalary) || 0,
  dependents:  Number(raw.dependents) || 0,
  paymentDay:  Number(raw.paymentDay) || 5,
  createdAt:   typeof raw.createdAt === "string" ? raw.createdAt : "",
  updatedAt:   typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  calculation: normalizeCalculation(
    (raw.calculation as Record<string, unknown>) ?? {},
  ),
});

// ─── Service ──────────────────────────────────────────────────────────────────

export const salaryService = {
  getProfile: async (): Promise<SalaryProfile | null> => {
    try {
      const { data } = await api.get("/salary/profile");
      return normalizeProfile(data as Record<string, unknown>);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) return null;
      throw err;
    }
  },

  upsertProfile: async (payload: UpsertSalaryProfilePayload): Promise<SalaryProfile> => {
    const { data } = await api.put("/salary/profile", payload);
    return normalizeProfile(data as Record<string, unknown>);
  },
};
