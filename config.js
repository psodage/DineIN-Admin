const DEFAULT_PORT = 5000;

// Use EXPO_PUBLIC_API_BASE_URL from .env (set manually)
// Example: EXPO_PUBLIC_API_BASE_URL=https://your-backend-url
// (Do NOT include "/api" here; screens already call `${API_BASE_URL}/api/...`)
const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
export const API_BASE_URL = explicit
  ? String(explicit).replace(/\/+$/, "")
  : `http://localhost:${DEFAULT_PORT}`;
