import { useEffect, useRef } from "react";
import { checkAndApplyOTAUpdate } from "../lib/otaUpdates";

/**
 * Runs a one-time OTA check after mount (production builds only).
 * Does not block rendering; errors are handled inside checkAndApplyOTAUpdate.
 */
export function useOTAUpdates() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void checkAndApplyOTAUpdate();
  }, []);
}
