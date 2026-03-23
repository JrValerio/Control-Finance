export type PaywallFeature =
  | "csv_import"
  | "csv_export"
  | "forecast"
  | "analytics_trend"
  | "salary"
  | "unknown";

export type PaywallAction = "viewed" | "clicked_upgrade" | "dismissed";
export type PaywallContext = "trial_expired" | "feature_gate";

export interface PaywallEvent {
  feature: PaywallFeature;
  action: PaywallAction;
  context: PaywallContext;
}

/**
 * Tracks a paywall interaction event.
 *
 * Today: logs to console. Swap this implementation to send events to
 * PostHog, Mixpanel, or a backend endpoint without touching call sites.
 */
export const trackPaywallEvent = (event: PaywallEvent): void => {
  console.log("[paywall]", event);
};
