# Deploy and domain checklist

Optional. Only worth doing if you want the Vultr or GoDaddy prizes, or just a nicer demo link. Nothing here has been run yet; treat it as a checklist, and check each prize's exact rules on the Devpost page first (for example which domain endings GoDaddy Registry counts).

## 1. Decide what the live demo is

- Keep `NEXT_PUBLIC_DEMO=1`. This build-time flag shows the demo controls and the simulated calendar, which is what you want for judging. Set it **before** `npm run build`; it is baked into the build.
- Server-only keys go in the server's environment, never in the repo: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`. The planner works with none of them.

## 2. Host on Vultr

1. Create a Cloud Compute server (Ubuntu LTS, the smallest size is enough for a demo).
2. Install Node 20 or newer and git, then clone the repo.
3. Copy `.env.example` to `.env.local` and fill what you use.
4. `npm ci && npm run build && npm start` (listens on port 3000). Check it works through the server's IP first.
5. Keep it running after you log out: run it under `pm2` or a `systemd` service.
6. Put a reverse proxy in front (Caddy or nginx) for HTTPS on ports 80 and 443. A domain and HTTPS are needed for Google sign-in.
7. Open only ports 22, 80 and 443 in the firewall.

## 3. Domain (GoDaddy Registry prize)

1. On the Devpost page, check which domain endings qualify and whether the domain must be registered during the event.
2. Register something short and memorable that says what it does.
3. Add an `A` record pointing the domain at the Vultr server's IP.
4. Use that domain in the Devpost submission.

## 4. If you also connect Google Calendar

1. In Google Cloud, create the OAuth client (web app) and enable the Calendar API.
2. Add `https://YOUR-DOMAIN/api/auth/google/callback` as an authorised redirect URL.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and a long random `GOOGLE_TOKEN_SECRET` on the server.
4. While the Google app is in Testing mode, add every demo account under Test users. Settings then shows Connect Google Calendar.
5. Run one full import and one accepted plan against a real account before claiming it works.

## 5. n8n (optional idea, not built)

A weekly digest would fit n8n: a schedule trigger calls a small read-only endpoint that returns this week's study hours, deadlines and any overload warning, and n8n emails or messages it to the student. That endpoint does not exist yet. Only chase this prize if you have time left after the items above.

## 6. Final check before submitting

- The live link loads, the demo reset button works, and there are no console errors at 1440 px and 390 px.
- `npm test`, `npm run lint` and `npm run build` all pass.
