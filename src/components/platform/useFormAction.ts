import { useEffect, useRef, useState } from "react";

/** Keep feedback local; an unmounted form cannot navigate after a late response. */
export function useFormAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const locked = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (work: () => Promise<unknown>) => {
    if (locked.current) return false;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      await work();
      return mounted.current;
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
      return false;
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return { pending, error, setError, run };
}
