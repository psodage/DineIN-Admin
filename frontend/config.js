import { Platform } from "react-native";
import Constants from "expo-constants";

const DEFAULT_PORT = 5000;

/** Metro / Expo dev server host (LAN IP), not the tunnel hostname. */
function resolveDevLanHost() {
  const raw =
    Constants.expoConfig?.hostUri ??
    Constants.expoGoConfig?.debuggerHost ??
    Constants.manifest2?.extra?.expoGo?.debuggerHost ??
    Constants.manifest?.debuggerHost;

  if (!raw) return null;

  const host = String(raw).split(":")[0]?.trim();
  if (
    !host ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.includes("exp.direct") ||
    host.includes("exp.host")
  ) {
    return null;
  }
  return host;
}

function resolveApiBaseUrl() {
  const fromExtra = Constants.expoConfig?.extra?.apiBaseUrl;
  const explicit =
    process.env.EXPO_PUBLIC_API_BASE_URL || fromExtra || null;

  if (explicit) {
    return String(explicit).replace(/\/+$/, "");
  }

  if (__DEV__) {
    const devHost = resolveDevLanHost();
    if (devHost) {
      return `http://${devHost}:${DEFAULT_PORT}`;
    }
    if (Platform.OS === "android") {
      return `http://10.0.2.2:${DEFAULT_PORT}`;
    }
  }

  return `http://localhost:${DEFAULT_PORT}`;
}

export const API_BASE_URL = resolveApiBaseUrl();

/** First month shown in admin month pickers (June of this year; Jan–May are skipped). */
export const FIRST_SELECTABLE_YEAR = Number(
  process.env.EXPO_PUBLIC_FIRST_SELECTABLE_YEAR || 2025
);

export const RESTORE_CONFIRM_PHRASE =
  process.env.EXPO_PUBLIC_RESTORE_CONFIRM_PHRASE || "RESTORE_NOW";

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log("[config] API_BASE_URL =", API_BASE_URL);
}
