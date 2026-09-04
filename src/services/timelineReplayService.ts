import { commandBus } from "../core/commandBus";
import type { ActivityEntry } from "../types/domain";
import type { ProjectEventRecord } from "../types/projects";

export async function restoreStateToStep(
  activities: ActivityEntry[],
  stepIndex: number,
  events?: ProjectEventRecord[],
  signal?: AbortSignal,
): Promise<void> {
  if (stepIndex < 0 || stepIndex >= activities.length) return;

  const targetActivity = activities[stepIndex];
  if (!targetActivity) return;

  const context = { origin: "human" as const, signal };

  // If we have access to the original event record, replay the exact input!
  if (events && events.length > 0) {
    const matchingEvent =
      events.find((e) => e.activityId === targetActivity.id) || events[stepIndex];
    if (matchingEvent && matchingEvent.status === "success") {
      try {
        await commandBus.execute(
          matchingEvent.command,
          matchingEvent.input as any,
          context,
        );
        return;
      } catch (err) {
        console.warn("Error replaying event input:", err);
      }
    }
  }

  // Fallback: extract command details from activity entry and message
  try {
    if (targetActivity.command === "load_structure") {
      const match =
        targetActivity.message.match(/^([A-Za-z0-9_-]+)\s+loaded/i) ||
        targetActivity.message.match(/structure\s+([A-Za-z0-9_-]+)/i);
      const pdbId = match ? match[1].toUpperCase() : "1CRN";
      await commandBus.execute("load_structure", { pdbId }, context);
    } else if (targetActivity.command === "set_representation") {
      const match = targetActivity.message.match(/Representation set to (\w+)/i);
      const style = (match ? match[1].toLowerCase() : "cartoon") as any;
      await commandBus.execute(
        "set_representation",
        { style, colorScheme: "chain" },
        context,
      );
    } else if (targetActivity.command === "show_surface") {
      const visible = !targetActivity.message.includes("hidden");
      await commandBus.execute("show_surface", { visible, opacity: 0.8 }, context);
    } else if (targetActivity.command === "reset_workspace") {
      await commandBus.execute("reset_workspace", { scope: "view" }, context);
    }
  } catch (err) {
    console.warn("Error replaying timeline step:", err);
  }
}

