import { api } from "./api";

export interface UserProfile {
  displayName: string | null;
  salaryMonthly: number | null;
  payday: number | null;
  avatarUrl: string | null;
}

export interface MeResponse {
  id: number;
  name: string;
  email: string;
  hasPassword?: boolean;
  linkedProviders?: string[];
  trialEndsAt: string | null;
  trialExpired: boolean;
  profile: UserProfile | null;
}

export interface ProfileUpdatePayload {
  display_name?: string | null;
  salary_monthly?: number | null;
  payday?: number | null;
  avatar_url?: string | null;
}

export const profileService = {
  getMe: async (): Promise<MeResponse> => {
    const { data } = await api.get<MeResponse>("/me");
    return data;
  },

  updateProfile: async (payload: ProfileUpdatePayload): Promise<UserProfile> => {
    const { data } = await api.patch<UserProfile>("/me/profile", payload);
    return data;
  },
};
