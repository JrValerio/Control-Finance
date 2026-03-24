import { api } from "./api";

export interface SubscriptionDetail {
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionSummary {
  plan: string;
  displayName: string;
  features: Record<string, unknown>;
  subscription: SubscriptionDetail | null;
}

export const billingService = {
  getSubscription: async (): Promise<SubscriptionSummary> => {
    const { data } = await api.get<SubscriptionSummary>("/billing/subscription");
    return data;
  },

  createCheckout: async (): Promise<{ url: string }> => {
    const { data } = await api.post<{ url: string }>("/billing/checkout");
    return data;
  },

  createPortal: async (): Promise<{ url: string }> => {
    const { data } = await api.post<{ url: string }>("/billing/portal");
    return data;
  },
};
