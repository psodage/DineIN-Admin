# Mobile cannot reach `192.168.x.x` (ERR_ADDRESS_UNREACHABLE)

Your PC and phone may both be on Wi‑Fi, but many routers use **AP / client isolation**: phones can use the internet but **cannot talk to other devices** on the LAN. Chrome then shows `ERR_ADDRESS_UNREACHABLE`.

The backend is fine if this works on the PC:

```text
http://127.0.0.1:5000/health  →  {"ok":true}
```

## Option A — USB (Android, most reliable)

1. Enable **USB debugging** on the phone and connect USB.
2. Run:

   ```bash
   adb reverse tcp:5000 tcp:5000
   ```

3. In `frontend/.env`:

   ```env
   EXPO_PUBLIC_API_BASE_URL=http://127.0.0.1:5000
   ```

4. Restart Expo: `npx expo start -c`

## Option B — Public dev tunnel (any network / Expo tunnel)

1. Keep `npm run dev` running in `backend/`.
2. In a **second** terminal:

   ```bash
   cd backend
   npm run expose
   ```

3. Copy the `https://….trycloudflare.com` URL from the log.
4. In `frontend/.env`:

   ```env
   EXPO_PUBLIC_API_BASE_URL=https://YOUR-URL.trycloudflare.com
   ```

5. Restart Expo: `npx expo start -c`
6. On the phone browser, open `https://YOUR-URL.trycloudflare.com/health` — you should see `{"ok":true}`.

The tunnel URL changes each time you run `npm run expose`.

## Option C — Phone hotspot (same LAN, no router isolation)

1. Turn on the phone’s **mobile hotspot**.
2. Connect the **PC** to that hotspot (not the other way around).
3. On the PC, run `ipconfig` and note the Wi‑Fi IPv4 (e.g. `192.168.43.2`).
4. Set `EXPO_PUBLIC_API_BASE_URL=http://THAT-IP:5000` in `frontend/.env`.
5. Allow port 5000 in Windows Firewall (see `backend/scripts/allow-firewall-port.ps1`).

## Option D — Fix router / firewall (stay on home Wi‑Fi)

1. In the router admin UI, disable **AP isolation**, **guest network isolation**, or **client isolation**.
2. Ensure the phone is on the **main** Wi‑Fi, not a guest SSID.
3. Run `backend/scripts/allow-firewall-port.ps1` **as Administrator**.
4. Set Windows Wi‑Fi profile to **Private** (Settings → Network).

Then use the `Network:` URL from the backend log in `frontend/.env`.
