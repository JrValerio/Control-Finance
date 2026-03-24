import { api } from "./api";

// ─── Public types ─────────────────────────────────────────────────────────────

export type ProfileType = "clt" | "inss_beneficiary";
export type ConsignacaoType = "loan" | "card" | "other";

export interface SalaryCalculation {
  grossMonthly: number;
  inssMonthly: number;
  irrfMonthly: number;
  netMonthly: number;
  netAnnual: number | null;  // null for free-plan users
  taxAnnual: number | null;  // null for free-plan users
  // INSS beneficiary extras (present when profileType === 'inss_beneficiary')
  consignacoesMonthly?: number;
  loanTotal?: number;
  cardTotal?: number;
  loanLimitAmount?: number;
  cardLimitAmount?: number;
  isOverLoanLimit?: boolean;
  isOverCardLimit?: boolean;
}

export interface Consignacao {
  id: number;
  salaryProfileId: number;
  description: string;
  amount: number;
  consignacaoType: ConsignacaoType;
  createdAt: string;
}

export interface SalaryProfile {
  id: number;
  userId: number;
  profileType: ProfileType;
  birthYear: number | null;
  grossSalary: number;
  dependents: number;
  paymentDay: number;
  createdAt: string;
  updatedAt: string;
  consignacoes: Consignacao[];
  calculation: SalaryCalculation;
}

export interface UpsertSalaryProfilePayload {
  profile_type?: ProfileType;
  gross_salary: number;
  birth_year?: number | null;
  dependents?: number;
  payment_day?: number;
}

export interface AddConsignacaoPayload {
  description: string;
  amount: number;
  consignacao_type: ConsignacaoType;
}

// ─── Normalization ────────────────────────────────────────────────────────────

const normalizeCalculation = (raw: Record<string, unknown>): SalaryCalculation => ({
  grossMonthly:        Number(raw.grossMonthly)        || 0,
  inssMonthly:         Number(raw.inssMonthly)         || 0,
  irrfMonthly:         Number(raw.irrfMonthly)         || 0,
  netMonthly:          Number(raw.netMonthly)          || 0,
  netAnnual:           raw.netAnnual  == null ? null : Number(raw.netAnnual)  || 0,
  taxAnnual:           raw.taxAnnual  == null ? null : Number(raw.taxAnnual)  || 0,
  consignacoesMonthly: raw.consignacoesMonthly != null ? Number(raw.consignacoesMonthly) : undefined,
  loanTotal:           raw.loanTotal           != null ? Number(raw.loanTotal)           : undefined,
  cardTotal:           raw.cardTotal           != null ? Number(raw.cardTotal)           : undefined,
  loanLimitAmount:     raw.loanLimitAmount     != null ? Number(raw.loanLimitAmount)     : undefined,
  cardLimitAmount:     raw.cardLimitAmount     != null ? Number(raw.cardLimitAmount)     : undefined,
  isOverLoanLimit:     raw.isOverLoanLimit     != null ? Boolean(raw.isOverLoanLimit)    : undefined,
  isOverCardLimit:     raw.isOverCardLimit     != null ? Boolean(raw.isOverCardLimit)    : undefined,
});

const normalizeConsignacao = (raw: Record<string, unknown>): Consignacao => ({
  id:              Number(raw.id)              || 0,
  salaryProfileId: Number(raw.salaryProfileId) || 0,
  description:     typeof raw.description === "string" ? raw.description : "",
  amount:          Number(raw.amount)          || 0,
  consignacaoType: (raw.consignacaoType as ConsignacaoType) ?? "other",
  createdAt:       typeof raw.createdAt === "string" ? raw.createdAt : "",
});

const normalizeProfile = (raw: Record<string, unknown>): SalaryProfile => ({
  id:          Number(raw.id)          || 0,
  userId:      Number(raw.userId)      || 0,
  profileType: (raw.profileType as ProfileType) ?? "clt",
  birthYear:   raw.birthYear != null ? Number(raw.birthYear) : null,
  grossSalary: Number(raw.grossSalary) || 0,
  dependents:  Number(raw.dependents)  || 0,
  paymentDay:  Number(raw.paymentDay)  || 5,
  createdAt:   typeof raw.createdAt === "string" ? raw.createdAt : "",
  updatedAt:   typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  consignacoes: Array.isArray(raw.consignacoes)
    ? (raw.consignacoes as Record<string, unknown>[]).map(normalizeConsignacao)
    : [],
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

  addConsignacao: async (payload: AddConsignacaoPayload): Promise<Consignacao> => {
    const { data } = await api.post("/salary/consignacoes", payload);
    return normalizeConsignacao(data as Record<string, unknown>);
  },

  deleteConsignacao: async (id: number): Promise<void> => {
    await api.delete(`/salary/consignacoes/${id}`);
  },
};
