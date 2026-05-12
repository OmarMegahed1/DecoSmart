import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

/**
 * Re-validates the Better Auth session when the app/tab regains focus.
 * Helps native after backgrounding/OS kill edge cases and web after long background tabs.
 */
export function useSessionRefetchOnAppFocus(refetch: () => Promise<void>) {
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (Platform.OS === "web") {
      if (typeof document === "undefined") return;
      const onVisibility = () => {
        if (document.visibilityState === "visible") void refetchRef.current();
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => document.removeEventListener("visibilitychange", onVisibility);
    }

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") void refetchRef.current();
    });
    return () => sub.remove();
  }, []);
}
