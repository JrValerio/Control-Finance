import { api, withApiRequestContext, type ApiRequestContext } from "./api";

export interface ForecastBankLimit {
  total: number;
  used: number;
  remaining: number;
  exceededBy: number;
  usagePct: number;
  status: "unused" | "using" | "exceeded";
  alertTriggered: boolean;
}

export interface Forecast {
  month: string;
  projectedBalance: number;
  spendingToDate: number;
  dailyAvgSpending: number;
  daysRemaining: number;
  flipDetected: boolean;
  flipDirection: "pos_to_neg" | "neg_to_pos" | null;
  engineVersion: string;
  incomeExpected: number | null;
  billsPendingTotal: number;
  billsPendingCount: number;
  adjustedProjectedBalance: number;
  bankLimit?: ForecastBankLimit | null;
}

export const forecastService = {
  getCurrent: async (context?: ApiRequestContext): Promise<Forecast | null> => {
    const { data } = await api.get<Forecast | null>("/forecasts/current", withApiRequestContext(context));
    return data;
  },

  recompute: async (context?: ApiRequestContext): Promise<Forecast> => {
    const { data } = await api.post<Forecast>("/forecasts/recompute", undefined, withApiRequestContext(context));
    return data;
  },
};
