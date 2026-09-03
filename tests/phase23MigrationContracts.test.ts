import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260902233000_phase2_3_db_controls.sql"), "utf8");

function functionDefinition(name: string) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = migration.indexOf("CREATE OR REPLACE FUNCTION public.", start + 1);
  return migration.slice(start, next < 0 ? migration.length : next);
}

describe("phase 2.3 additive database contract", () => {
  it("serializes service-only admission with a UTC budget and 60-second window", () => {
    const claim = functionDefinition("claim_assistant_request");
    expect(claim).toContain("SECURITY INVOKER");
    expect(claim).toContain("pg_advisory_xact_lock");
    expect(claim).toContain("timezone('UTC'");
    expect(claim).toContain("interval '60 seconds'");
    expect(claim).toContain("p_daily_budget_usd");
    expect(claim).toContain("p_reservation_usd");
    expect(claim).toContain("INSERT INTO public.messages");
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_assistant_request[\s\S]*?\)\s*TO authenticated;/);
  });

  it("finalizes accounting and the assistant message in one invoker transaction", () => {
    const finalize = functionDefinition("finalize_assistant_request");
    expect(finalize).toContain("SECURITY INVOKER");
    expect(finalize).toContain("FOR UPDATE");
    expect(finalize).toContain("INSERT INTO public.messages");
    expect(finalize).toContain("WHEN v_provider_called THEN v_request.reserved_cost_usd");
    expect(finalize).toContain("reserved_cost_usd = 0");
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.finalize_assistant_request[\s\S]*?\)\s*TO authenticated;/);
  });

  it("keeps corpus, ingestion, provider cache and metrics server-only", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.knowledge_ingestion_runs");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.replace_knowledge_source");
    expect(migration).toContain("max_semantic_distance DOUBLE PRECISION DEFAULT 0.35");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.external_evidence_cache");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.external_evidence_metrics");
    expect(migration).toContain("'stale_fallback'");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.messages TO authenticated");
    expect(migration).not.toContain("GRANT SELECT ON TABLE public.ai_requests TO authenticated");
  });
});
