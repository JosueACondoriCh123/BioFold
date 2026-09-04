/**
 * 3D Bookmarks & Annotations Service
 * Manages scientific sticky notes, functional pins, and camera coordinates
 * linked to 3D macromolecules with persistence in Supabase and offline fallback.
 */

import { getSupabaseClient } from "../auth/supabaseClient";
import type { BookmarkAnnotation } from "../types/domain";

const STORAGE_PREFIX = "biofold_bookmarks_";
const MEMORY_BOOKMARKS = new Map<string, BookmarkAnnotation[]>();

function getLocalBookmarks(pdbId: string): BookmarkAnnotation[] {
  const norm = pdbId.toUpperCase();
  try {
    if (typeof localStorage !== "undefined" && localStorage?.getItem) {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${norm}`);
      if (raw) return JSON.parse(raw) as BookmarkAnnotation[];
    }
  } catch {
    /* fallback */
  }
  return MEMORY_BOOKMARKS.get(norm) ?? [];
}

function saveLocalBookmarks(pdbId: string, list: BookmarkAnnotation[]) {
  const norm = pdbId.toUpperCase();
  MEMORY_BOOKMARKS.set(norm, list);
  try {
    if (typeof localStorage !== "undefined" && localStorage?.setItem) {
      localStorage.setItem(`${STORAGE_PREFIX}${norm}`, JSON.stringify(list));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Lists all bookmarks for a specific structure and optional project.
 */
export async function listBookmarks(
  pdbId: string,
  projectId?: string,
): Promise<BookmarkAnnotation[]> {
  const normId = pdbId.trim().toUpperCase();
  const localItems = getLocalBookmarks(normId);

  const supabase = getSupabaseClient();
  if (!supabase) return localItems;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return localItems;

    let query = supabase
      .from("structure_annotations")
      .select("*")
      .eq("user_id", user.id)
      .eq("pdb_id", normId)
      .order("created_at", { ascending: false });

    if (projectId) {
      query = query.or(`project_id.eq.${projectId},project_id.is.null`);
    }

    const { data, error } = await query;

    if (error || !data) {
      console.warn("Error fetching remote bookmarks, falling back to local:", error?.message);
      return localItems;
    }

    const mapped: BookmarkAnnotation[] = data.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      pdbId: row.pdb_id,
      chain: row.chain,
      residueNumber: row.residue_number,
      positionXyz: row.position_xyz,
      note: row.note,
      color: row.color || "#5ccfb5",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Merge and sync local cache with cloud records
    saveLocalBookmarks(normId, mapped);
    return mapped;
  } catch (err) {
    console.warn("Exception in listBookmarks, returning local:", err);
    return localItems;
  }
}

export interface CreateBookmarkDraft {
  pdbId: string;
  projectId?: string;
  chain: string;
  residueNumber: number;
  positionXyz?: { x: number; y: number; z: number };
  note: string;
  color?: string;
}

/**
 * Creates a new bookmark annotation in Supabase with offline fallback.
 */
export async function createBookmark(draft: CreateBookmarkDraft): Promise<BookmarkAnnotation> {
  const normId = draft.pdbId.trim().toUpperCase();
  const normColor = draft.color || "#5ccfb5";
  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `bm-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  const localItem: BookmarkAnnotation = {
    id: newId,
    pdbId: normId,
    projectId: draft.projectId,
    chain: draft.chain.trim().toUpperCase() || "A",
    residueNumber: Number(draft.residueNumber) || 1,
    positionXyz: draft.positionXyz,
    note: draft.note.trim(),
    color: normColor,
    createdAt: new Date().toISOString(),
  };

  // 1. Optimistically store in local cache
  const existingLocal = getLocalBookmarks(normId);
  saveLocalBookmarks(normId, [localItem, ...existingLocal]);

  // 2. Persist to Supabase if authenticated
  const supabase = getSupabaseClient();
  if (!supabase) return localItem;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return localItem;

    const { data, error } = await supabase
      .from("structure_annotations")
      .insert({
        project_id: draft.projectId || null,
        user_id: user.id,
        pdb_id: normId,
        chain: localItem.chain,
        residue_number: localItem.residueNumber,
        position_xyz: draft.positionXyz || { x: 0, y: 0, z: 0 },
        note: localItem.note,
        color: localItem.color,
      })
      .select()
      .single();

    if (error || !data) {
      console.warn("Remote bookmark insertion warning:", error?.message);
      return localItem;
    }

    const created: BookmarkAnnotation = {
      id: data.id,
      projectId: data.project_id,
      userId: data.user_id,
      pdbId: data.pdb_id,
      chain: data.chain,
      residueNumber: data.residue_number,
      positionXyz: data.position_xyz,
      note: data.note,
      color: data.color,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    // Update local cache with remote UUID
    const updatedList = [created, ...existingLocal.filter((b) => b.id !== localItem.id)];
    saveLocalBookmarks(normId, updatedList);

    return created;
  } catch (err) {
    console.warn("Error creating bookmark in cloud:", err);
    return localItem;
  }
}

/**
 * Deletes a bookmark annotation by ID.
 */
export async function deleteBookmark(id: string, pdbId: string): Promise<void> {
  const normId = pdbId.trim().toUpperCase();

  // 1. Remove from local cache
  const existingLocal = getLocalBookmarks(normId);
  saveLocalBookmarks(
    normId,
    existingLocal.filter((b) => b.id !== id),
  );

  // 2. Remove from Supabase if authenticated
  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("structure_annotations")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
  } catch (err) {
    console.warn("Error deleting bookmark in cloud:", err);
  }
}
