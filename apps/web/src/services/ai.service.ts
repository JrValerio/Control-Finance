import { api } from "./api";

export interface AiInsight {
  id: string;
  type: "warning" | "success" | "info";
  title: string;
  message: string;
  action_label: string;
}

export const aiService = {
  getInsight: async (): Promise<AiInsight | null> => {
    const { data } = await api.get<AiInsight | null>("/ai/insight");
    return data;
  },
};
