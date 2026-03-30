import { api } from "./api";

export interface AiInsight {
  id: string;
  type: "warning" | "success" | "info";
  title: string;
  message: string;
  action_label: string;
}

export interface UtilityInsight {
  riskLabel: "contas vencidas" | "vence em breve" | "em dia";
  type: "success" | "warning" | "critical";
  message: string;
}

export const aiService = {
  getInsight: async (): Promise<AiInsight | null> => {
    const { data } = await api.get<AiInsight | null>("/ai/insight");
    return data;
  },

  getUtilityInsight: async (): Promise<UtilityInsight | null> => {
    const { data } = await api.get<UtilityInsight | null>("/ai/utility-insight");
    return data;
  },
};
