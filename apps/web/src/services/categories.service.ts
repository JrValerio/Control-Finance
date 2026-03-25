import { api } from "./api";

export interface CategoryItem {
  id: number;
  userId: number | null;
  name: string;
  normalizedName: string;
  type: "income" | "expense" | null;
  system: boolean;
  deletedAt: string | null;
  createdAt: string | null;
}

interface CategoryApiPayload {
  id?: unknown;
  userId?: unknown;
  user_id?: unknown;
  name?: unknown;
  normalizedName?: unknown;
  normalized_name?: unknown;
  type?: unknown;
  system?: unknown;
  deletedAt?: unknown;
  deleted_at?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
}

const normalizeIsoStringOrNull = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeCategoryItem = (payload: CategoryApiPayload): CategoryItem => {
  const normalizedId = Number(payload?.id);
  const normalizedUserId = Number(payload?.userId ?? payload?.user_id);
  const normalizedName =
    typeof payload?.name === "string" ? payload.name.trim() : "";
  const normalizedKey =
    typeof payload?.normalizedName === "string"
      ? payload.normalizedName.trim()
      : typeof payload?.normalized_name === "string"
        ? payload.normalized_name.trim()
        : "";

  const rawType = payload?.type;
  const type: "income" | "expense" | null =
    rawType === "income" || rawType === "expense" ? rawType : null;

  return {
    id: Number.isInteger(normalizedId) && normalizedId > 0 ? normalizedId : 0,
    userId:
      Number.isInteger(normalizedUserId) && normalizedUserId > 0
        ? normalizedUserId
        : null,
    name: normalizedName,
    normalizedName: normalizedKey,
    type,
    system: Boolean(payload?.system),
    deletedAt: normalizeIsoStringOrNull(payload?.deletedAt ?? payload?.deleted_at),
    createdAt: normalizeIsoStringOrNull(payload?.createdAt ?? payload?.created_at),
  };
};

const isValidCategoryItem = (item: CategoryItem): boolean =>
  item.id > 0 && Boolean(item.name);

export const categoriesService = {
  listCategories: async (includeDeleted = false): Promise<CategoryItem[]> => {
    const params = includeDeleted ? { includeDeleted: "true" } : undefined;
    const { data } = await api.get("/categories", { params });

    if (!Array.isArray(data)) {
      return [];
    }

    return data
      .map((item) => normalizeCategoryItem(item as CategoryApiPayload))
      .filter(isValidCategoryItem);
  },

  createCategory: async (name: string, type?: "income" | "expense"): Promise<CategoryItem> => {
    const { data } = await api.post("/categories", { name, type });
    return normalizeCategoryItem(data as CategoryApiPayload);
  },

  updateCategory: async (id: number, name: string): Promise<CategoryItem> => {
    const { data } = await api.patch(`/categories/${id}`, { name });
    return normalizeCategoryItem(data as CategoryApiPayload);
  },

  deleteCategory: async (id: number): Promise<CategoryItem> => {
    const { data } = await api.delete(`/categories/${id}`);
    return normalizeCategoryItem(data as CategoryApiPayload);
  },

  restoreCategory: async (id: number): Promise<CategoryItem> => {
    const { data } = await api.post(`/categories/${id}/restore`);
    return normalizeCategoryItem(data as CategoryApiPayload);
  },
};
