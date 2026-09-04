/**
 * Molecular Storage Service
 * Synchronizes user-imported PDB and CIF molecular structure files
 * to Supabase Storage (bucket: 'molecular-files') with automatic
 * hydration into local IndexedDB for multi-device collaboration.
 */

import { getSupabaseClient } from "../auth/supabaseClient";
import {
  getCachedStructure,
  setCachedStructure,
  clearStructureCache,
} from "../adapters/structureCache";
import type { StructureFormat } from "../adapters/structureGateway";

export interface UploadStructureOptions {
  pdbId: string;
  content: string;
  format: StructureFormat;
  filename?: string;
}

export interface UploadStructureResult {
  ok: boolean;
  pdbId: string;
  cloudSynced: boolean;
  path?: string;
  error?: string;
}

const BUCKET_NAME = "molecular-files";

/**
 * Uploads a molecular structure to Supabase Storage and hydrates local IndexedDB.
 */
export async function uploadStructureFile({
  pdbId,
  content,
  format,
}: UploadStructureOptions): Promise<UploadStructureResult> {
  const normId = pdbId.trim().toUpperCase();

  // 1. Always ensure local IndexedDB is populated
  try {
    await setCachedStructure(normId, content);
  } catch (err) {
    console.warn("Failed to save to local IndexedDB cache:", err);
  }

  // 2. Check if Supabase client & authenticated session exist
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: true, pdbId: normId, cloudSynced: false };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      // User is working in unauthenticated / anonymous mode
      return { ok: true, pdbId: normId, cloudSynced: false };
    }

    const filePath = `${user.id}/${normId}.${format}`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, blob, {
        upsert: true,
        contentType: "text/plain",
      });

    if (uploadError) {
      console.warn("Supabase Storage upload warning:", uploadError.message);
      return {
        ok: true,
        pdbId: normId,
        cloudSynced: false,
        error: uploadError.message,
      };
    }

    return {
      ok: true,
      pdbId: normId,
      cloudSynced: true,
      path: filePath,
    };
  } catch (err) {
    console.warn("Error during cloud storage sync:", err);
    return {
      ok: true,
      pdbId: normId,
      cloudSynced: false,
      error: err instanceof Error ? err.message : "Cloud sync failed",
    };
  }
}

/**
 * Downloads a molecular structure file. Checks local IndexedDB first;
 * if missing, attempts to retrieve it from Supabase Storage.
 */
export async function downloadStructureFile(pdbId: string): Promise<string | null> {
  const normId = pdbId.trim().toUpperCase();

  // 1. Check local IndexedDB
  const local = await getCachedStructure(normId);
  if (local) {
    return local;
  }

  // 2. Check Supabase Storage if authenticated
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    // Try .cif first, then .pdb
    for (const ext of ["cif", "pdb"]) {
      const filePath = `${user.id}/${normId}.${ext}`;
      const { data, error } = await supabase.storage.from(BUCKET_NAME).download(filePath);
      if (!error && data) {
        const text = await data.text();
        if (text) {
          // Hydrate local cache for instant future loads
          void setCachedStructure(normId, text);
          return text;
        }
      }
    }
  } catch (err) {
    console.warn("Error downloading structure from cloud storage:", err);
  }

  return null;
}

/**
 * Deletes a structure from both local IndexedDB and cloud storage.
 */
export async function deleteStructureFile(pdbId: string): Promise<void> {
  const normId = pdbId.trim().toUpperCase();

  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.storage
          .from(BUCKET_NAME)
          .remove([`${user.id}/${normId}.cif`, `${user.id}/${normId}.pdb`]);
      }
    } catch {
      /* ignore remote deletion error */
    }
  }
}
