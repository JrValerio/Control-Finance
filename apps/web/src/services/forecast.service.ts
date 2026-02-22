import { api } from "./api";

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
}

export const forecastService = {
  getCurrent: async (): Promise<Forecast | null> => {
    const { data } = await api.get<Forecast | null>("/forecasts/current");
    return data;
  },

  recompute: async (): Promise<Forecast> => {
    const { data } = await api.post<Forecast>("/forecasts/recompute");
    return data;
  },
};
