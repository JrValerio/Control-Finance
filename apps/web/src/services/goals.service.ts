import { api } from "./api";

export interface Goal {
  id: number;
  userId: number;
  title: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  icon: GoalIcon;
  notes: string | null;
  monthlyNeeded: number;
  createdAt: string;
  updatedAt: string;
}

export type GoalIcon =
  | "target"
  | "plane"
  | "home"
  | "car"
  | "graduation"
  | "heart"
  | "star"
  | "gift"
  | "briefcase"
  | "umbrella";

export const GOAL_ICONS: Record<GoalIcon, string> = {
  target:     "🎯",
  plane:      "✈️",
  home:       "🏠",
  car:        "🚗",
  graduation: "🎓",
  heart:      "❤️",
  star:       "⭐",
  gift:       "🎁",
  briefcase:  "💼",
  umbrella:   "☂️",
};

export interface CreateGoalPayload {
  title: string;
  target_amount: number;
  current_amount?: number;
  target_date: string;
  icon?: GoalIcon;
  notes?: string | null;
}

export type UpdateGoalPayload = Partial<CreateGoalPayload>;

export const goalsService = {
  list: async (): Promise<Goal[]> => {
    const { data } = await api.get<Goal[]>("/goals");
    return data;
  },

  create: async (payload: CreateGoalPayload): Promise<Goal> => {
    const { data } = await api.post<Goal>("/goals", payload);
    return data;
  },

  update: async (id: number, payload: UpdateGoalPayload): Promise<Goal> => {
    const { data } = await api.patch<Goal>(`/goals/${id}`, payload);
    return data;
  },

  remove: async (id: number): Promise<void> => {
    await api.delete(`/goals/${id}`);
  },
};
