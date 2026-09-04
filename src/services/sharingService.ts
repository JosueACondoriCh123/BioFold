/**
 * Project Public Sharing Service
 * Manages public token generation, activation, revocation, and read-only retrieval
 * of shared molecular research projects.
 */

import { getSupabaseClient } from "../auth/supabaseClient";
import type { BookmarkAnnotation } from "../types/domain";
import type { ProjectRecord, ProjectEventRecord } from "../types/projects";

export interface SharedProjectData {
  project: ProjectRecord;
  annotations: BookmarkAnnotation[];
  events: ProjectEventRecord[];
}

export const LOCAL_SHARES_KEY = "biofold_local_shares";

const MEMORY_SHARES = new Map<string, SharedProjectData>();

export function getLocalShares(): Record<string, SharedProjectData> {
  const result: Record<string, SharedProjectData> = {};
  MEMORY_SHARES.forEach((val, key) => {
    result[key] = val;
  });
  try {
    if (typeof localStorage !== "undefined" && localStorage?.getItem) {
      const raw = localStorage.getItem(LOCAL_SHARES_KEY);
      if (raw) {
        Object.assign(result, JSON.parse(raw));
      }
    }
  } catch {
    /* fallback to MEMORY_SHARES */
  }
  return result;
}

export function saveLocalShare(token: string, data: SharedProjectData) {
  MEMORY_SHARES.set(token, data);
  try {
    if (typeof localStorage !== "undefined" && localStorage?.setItem) {
      const current = getLocalShares();
      current[token] = data;
      localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(current));
    }
  } catch {
    /* ignore */
  }
}

export function removeLocalShare(projectId: string) {
  MEMORY_SHARES.forEach((data, token) => {
    if (data.project.id === projectId) {
      MEMORY_SHARES.delete(token);
    }
  });
  try {
    if (typeof localStorage !== "undefined" && localStorage?.setItem) {
      const current = getLocalShares();
      for (const [token, data] of Object.entries(current)) {
        if (data.project.id === projectId) {
          delete current[token];
        }
      }
      localStorage.setItem(LOCAL_SHARES_KEY, JSON.stringify(current));
    }
  } catch {
    /* ignore */
  }
}

export function clearLocalShares() {
  MEMORY_SHARES.clear();
  try {
    if (typeof localStorage !== "undefined" && localStorage?.removeItem) {
      localStorage.removeItem(LOCAL_SHARES_KEY);
    }
  } catch {
    /* ignore */
  }
}



/**
 * Generates a unique crypto share token
 */
export function generateShareToken(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `sh_${rnd}${ts}`;
}

/**
 * Enables public read-only sharing for a project.
 */
export async function enableProjectSharing(
  projectId: string,
): Promise<{ shareToken: string; shareUrl: string }> {
  const token = generateShareToken();
  const origin = typeof window !== "undefined" ? window.location.origin : "https://biofold-orpin.vercel.app";
  const shareUrl = `${origin}/share/${token}`;

  const supabase = getSupabaseClient();
  if (!supabase) {
    // Fallback: local memory / localStorage mock for offline or unconfigured
    return { shareToken: token, shareUrl };
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      return { shareToken: token, shareUrl };
    }

    const { error } = await supabase
      .from("projects")
      .update({
        is_public: true,
        share_token: token,
      })
      .eq("id", projectId)
      .eq("owner_id", user.id);

    if (error) {
      console.warn("Failed to enable remote project sharing:", error.message);
    }
  } catch (err) {
    console.warn("Exception enabling project sharing:", err);
  }

  return { shareToken: token, shareUrl };
}

/**
 * Disables public sharing for a project.
 */
export async function disableProjectSharing(projectId: string): Promise<void> {
  removeLocalShare(projectId);

  const supabase = getSupabaseClient();
  if (!supabase) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    await supabase
      .from("projects")
      .update({
        is_public: false,
        share_token: null,
      })
      .eq("id", projectId)
      .eq("owner_id", user.id);
  } catch (err) {
    console.warn("Exception disabling project sharing:", err);
  }
}


/**
 * Retrieves a publicly shared project and its annotations by share token.
 */
export async function getSharedProject(shareToken: string): Promise<SharedProjectData | null> {
  const normToken = shareToken.trim();
  if (!normToken) return null;

  // 1. Check local shares cache first (for testing or offline)
  const localShares = getLocalShares();
  if (localShares[normToken]) {
    return localShares[normToken];
  }

  // 2. Query Supabase publicly
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    // Fetch project
    const { data: projectRow, error: projectErr } = await supabase
      .from("projects")
      .select("*")
      .eq("share_token", normToken)
      .eq("is_public", true)
      .single();

    if (projectErr || !projectRow) {
      return null;
    }

    const project: ProjectRecord = {
      id: projectRow.id,
      ownerId: projectRow.owner_id,
      title: projectRow.title,
      description: projectRow.description || "",
      activePdbId: projectRow.active_pdb_id,
      revision: projectRow.revision,
      snapshot: projectRow.snapshot || {},
      isPublic: projectRow.is_public,
      shareToken: projectRow.share_token,
      createdAt: projectRow.created_at,
      updatedAt: projectRow.updated_at,
    };

    // Fetch annotations for this public project in parallel
    const [annotationsRes, eventsRes] = await Promise.all([
      supabase
        .from("structure_annotations")
        .select("*")
        .eq("project_id", project.id),
      supabase
        .from("project_events")
        .select("*")
        .eq("project_id", project.id)
        .order("created_at", { ascending: true }),
    ]);

    const annotations: BookmarkAnnotation[] = (annotationsRes.data || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      pdbId: row.pdb_id,
      chain: row.chain,
      residueNumber: row.residue_number,
      positionXyz: row.position_xyz,
      note: row.note,
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    const events: ProjectEventRecord[] = (eventsRes.data || []).map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      activityId: row.activity_id,
      command: row.command,
      origin: row.origin,
      agentKind: row.agent_kind,
      approvedByUser: row.approved_by_user,
      sourceMessageId: row.source_message_id,
      status: row.status,
      evidence: row.evidence,
      provenance: row.provenance,
      input: row.input,
      output: row.output,
      error: row.error,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    }));

    const result: SharedProjectData = { project, annotations, events };
    saveLocalShare(normToken, result);
    return result;
  } catch (err) {
    console.warn("Error retrieving shared project:", err);
    return null;
  }
}
