import { describe, expect, it } from "vitest";
import { InMemoryProjectDataPort } from "../src/phase2/inMemoryProjectDataPort";
import { createEmptyWorkspaceSnapshot } from "../src/types/projects";

describe("InMemoryProjectDataPort", () => {
  it("creates, lists and returns isolated clones of projects", async () => {
    const port = new InMemoryProjectDataPort("user-a", () => new Date("2026-09-01T12:00:00.000Z"));
    const created = await port.createProject({
      title: "  Hemoglobin exploration  ",
      snapshot: createEmptyWorkspaceSnapshot("4HHB"),
    });
    expect(created).toMatchObject({
      ok: true,
      data: { ownerId: "user-a", title: "Hemoglobin exploration", activePdbId: "4HHB", revision: 1 },
    });
    if (!created.ok) throw new Error("fixture creation failed");
    created.data.title = "Changed outside adapter";

    const projects = await port.listProjects();
    expect(projects).toMatchObject({ ok: true, data: [{ title: "Hemoglobin exploration" }] });
  });

  it("uses optimistic revisions and reports the current value on conflict", async () => {
    const port = new InMemoryProjectDataPort();
    const created = await port.createProject({ title: "Crambin", snapshot: createEmptyWorkspaceSnapshot("1CRN") });
    if (!created.ok) throw new Error("fixture creation failed");
    const saved = await port.saveSnapshot({
      projectId: created.data.id,
      expectedRevision: 1,
      snapshot: { ...created.data.snapshot, surface: { visible: true, opacity: 0.55 } },
    });
    expect(saved).toMatchObject({ ok: true, data: { revision: 2, snapshot: { surface: { visible: true, opacity: 0.55 } } } });

    const stale = await port.updateProject({
      projectId: created.data.id,
      expectedRevision: 1,
      title: "Stale title",
      description: "",
    });
    expect(stale).toEqual({
      ok: false,
      error: {
        code: "CONFLICT",
        message: "This project was updated in another session.",
        retryable: false,
        currentRevision: 2,
      },
    });
  });

  it("cascades mock events on delete and honors AbortSignal", async () => {
    const port = new InMemoryProjectDataPort();
    const created = await port.createProject({ title: "Temporary" });
    if (!created.ok) throw new Error("fixture creation failed");
    const event = await port.appendEvent(created.data.id, {
      activityId: "activity-1",
      command: "get_structure_summary",
      input: {},
      origin: "human",
      status: "success",
      evidence: "calculated",
      durationMs: 2,
      createdAt: "2026-09-01T12:00:00.000Z",
    });
    expect(event.ok).toBe(true);
    await expect(port.deleteProject(created.data.id)).resolves.toMatchObject({ ok: true });
    await expect(port.listEvents(created.data.id)).resolves.toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });

    const controller = new AbortController();
    controller.abort();
    await expect(port.listProjects({ signal: controller.signal })).resolves.toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
  });
});
