import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(migrationsDir, name), "utf8") }));

const fullSchema = migrations.map(({ sql }) => sql).join("\n");
const hardening = migrations.find(({ name }) => name.endsWith("_harden_phase2_data_access.sql"))?.sql ?? "";

describe("Phase 2 migration security", () => {
  it.each([
    "profiles",
    "projects",
    "project_events",
    "conversations",
    "messages",
    "ai_requests",
    "structure_metadata",
    "knowledge_sources",
    "knowledge_chunks",
  ])("enables RLS for public.%s", (table) => {
    expect(fullSchema).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
  });

  it("keeps profiles private and generated records append-only", () => {
    expect(hardening).toContain('DROP POLICY IF EXISTS "profiles_select_policy"');
    expect(hardening).toContain("USING ((SELECT auth.uid()) = id)");
    expect(hardening).toContain('DROP POLICY IF EXISTS "project_events_delete_owner"');
    expect(hardening).toContain('DROP POLICY IF EXISTS "messages_delete_owner"');
  });

  it("uses cached user identity checks in tenant RLS policies", () => {
    expect(hardening).toContain("USING (owner_id = (SELECT auth.uid()))");
    expect(hardening).toContain("projects.owner_id = (SELECT auth.uid())");
    expect(hardening).toContain("USING (user_id = (SELECT auth.uid()))");
  });

  it("explicitly grants only browser operations backed by RLS", () => {
    expect(hardening).toContain("REVOKE ALL ON TABLE");
    expect(hardening).toContain("GRANT SELECT, INSERT ON TABLE public.project_events TO authenticated");
    expect(hardening).toContain("GRANT SELECT, INSERT ON TABLE public.messages TO authenticated");
    expect(hardening).not.toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.messages");
  });

  it("matches the public event contract", () => {
    expect(hardening).toContain("ALTER COLUMN source_message_id TYPE TEXT");
    expect(hardening).toContain("CHECK (status IN ('success', 'error'))");
    expect(hardening).toContain("project_events_assistant_requires_confirmation");
    expect(hardening).toContain("uq_project_events_project_activity");
  });

  it("covers the remaining foreign key and provides a valid snapshot default", () => {
    expect(hardening).toContain("idx_ai_requests_conversation_id");
    expect(hardening).toContain('"schemaVersion": 1');
    expect(hardening).toContain('"selectedResidues": []');
  });
});
