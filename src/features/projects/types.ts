export type PersistenceState = "idle" | "saving" | "saved" | "offline" | "conflict" | "error";

export interface ProjectFormData {
  title: string;
  description: string;
  initialPdbId?: string;
}
