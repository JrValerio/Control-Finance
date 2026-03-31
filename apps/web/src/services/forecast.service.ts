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

let getCurrentInFlightRequest: Promise<Forecast | null> | null = null;
let recomputeInFlightRequest: Promise<Forecast> | null = null;

export const forecastService = {
  getCurrent: async (context?: ApiRequestContext): Promise<Forecast | null> => {
    if (getCurrentInFlightRequest) {
      return getCurrentInFlightRequest;
    }

    const requestPromise = api
      .get<Forecast | null>("/forecasts/current", withApiRequestContext(context))
      .then(({ data }) => data)
      .finally(() => {
        if (getCurrentInFlightRequest === requestPromise) {
          getCurrentInFlightRequest = null;
        }
      });

    getCurrentInFlightRequest = requestPromise;
    return requestPromise;
  },

  recompute: async (context?: ApiRequestContext): Promise<Forecast> => {
    if (recomputeInFlightRequest) {
      return recomputeInFlightRequest;
    }

    const requestPromise = api
      .post<Forecast>("/forecasts/recompute", undefined, withApiRequestContext(context))
      .then(({ data }) => data)
      .finally(() => {
        if (recomputeInFlightRequest === requestPromise) {
          recomputeInFlightRequest = null;
        }
      });

    recomputeInFlightRequest = requestPromise;
    return requestPromise;
  },
};
