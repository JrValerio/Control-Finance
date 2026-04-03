export type MonthOverMonthDirection = "up" | "down" | "flat";
export type MonthOverMonthTone = "good" | "bad" | "neutral";

export interface MonthOverMonthMetric {
  delta: number;
  deltaPercent: number | null;
  direction: MonthOverMonthDirection;
  tone: MonthOverMonthTone;
}