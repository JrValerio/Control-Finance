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
 * Fire-and-forget: never blocks the UI, never throws.
 */
export const trackPaywallEvent = (event: PaywallEvent): void => {
  import("../services/api").then(({ api }) => {
    void api.post("/analytics/paywall", event).catch(() => {
      // Silently discard — tracking must never degrade the user experience
    });
  });
};

export type ActivationEvent =
  | "welcome_card_viewed"
  | "welcome_cta_clicked"
  | "first_transaction_created";

/**
 * Tracks a user activation event.
 * Today: logs to console. Swap for a persistence endpoint when ready.
 */
export const trackActivationEvent = (event: ActivationEvent): void => {
  console.log("[activation]", event);
};
