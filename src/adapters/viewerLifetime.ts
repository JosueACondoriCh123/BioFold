/**
 * 3Dmol 2.5 binds global listeners but exposes no destroy method. Capture only
 * registrations made during its synchronous constructor, restoring every method
 * immediately. This avoids retaining a signed-out viewer through window/body.
 */
export function captureViewerListeners<T>(targets: EventTarget[], create: () => T) {
  const removals: Array<() => void> = [];
  const restores: Array<() => void> = [];
  const cleanup = () => { for (const remove of removals.splice(0)) remove(); };
  try {
    for (const target of targets) {
      const original = target.addEventListener;
      const descriptor = Object.getOwnPropertyDescriptor(target, "addEventListener");
      Object.defineProperty(target, "addEventListener", {
        configurable: true, writable: true,
        value: (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
          original.call(target, type, listener, options);
          removals.push(() => target.removeEventListener(type, listener, options));
        },
      });
      restores.push(() => {
        if (descriptor) Object.defineProperty(target, "addEventListener", descriptor);
        else Reflect.deleteProperty(target, "addEventListener");
      });
    }
    return { value: create(), cleanup };
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    for (const restore of restores.reverse()) restore();
  }
}
