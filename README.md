# ⚡ Command Center

Chappie's command center: a one-page dashboard for the iPad, hosted on Vercel.

**What's on it**

- **Today at a glance:** weather, today's events, reminders due, your next committee item and open follow-ups.
- **🔊 Morning briefing:** tap the button and the iPad reads your day out loud. Tap again to stop.
- **Calendar:** this week, plus a 2-week horizon pulled live from Google Calendar.
- **Committee deadlines:** your calendar events for the next 30 days that mention NYE Gala, AF STEM Aviation, Aviation, ECSU, Achievement and Awards, Closeout, or chapter meeting. They're grouped by committee, with the soonest first, and you can also add deadlines by hand.
- **Reminders & to-do:** your own list, with optional due dates.
- **Follow-ups & actions:** built automatically from calendar items that look like tasks ("pay", "send", "due", "renew"…), committee deadlines in the next 14 days, and overdue reminders.
- **AI news** and **Travel abroad:** U.S. State Department advisories plus travel headlines. Advisories for countries in your upcoming calendar events are pinned to the top.
- **IPO watch:** a live IPO calendar, plus your watchlist notes.

Everything refreshes by itself: the calendar every 10 minutes, news and weather every 30 minutes, IPOs every 6 hours, and all of it again whenever you wake the iPad.

---

## Setup (about 10 minutes, once)

All settings go in **Vercel → your project → Settings → Environment Variables**.
After adding or changing any of them, open **Deployments**, tap **⋯** on the newest one, and choose **Redeploy**. Settings only take effect after a redeploy.

### 1. Connect your Google Calendar (needed for calendar, follow-ups, and the briefing)

1. On a computer, open [calendar.google.com](https://calendar.google.com) → ⚙️ **Settings**.
2. On the left, under *Settings for my calendars*, click your calendar.
3. Scroll to **Integrate calendar** and copy the **Secret address in iCal format**. It ends in `basic.ics`.
4. In Vercel, add a variable named **`GCAL_ICS_URLS`** and paste that address as its value.
   - For more than one calendar, separate the addresses with commas. You can put a name in front of each one with a `|`, like this:
     `Personal|https://calendar.google.com/…/basic.ics,Work|https://calendar.google.com/…/basic.ics`

> Treat that secret address like a password. Anyone who has it can see your calendar. That's why step 2 matters.

### 2. Set a passcode (strongly recommended)

Your Vercel site is on the public internet. A passcode keeps strangers out of your calendar and to-do list.

- Add a variable named **`DASHBOARD_PASSCODE`** set to anything you'll remember. `DASHBOARD_PASSKEY` also works.
- The page shows a passcode box once, and the iPad remembers it afterwards. To change it later, tap **Change passcode** at the bottom of the page.

### 3. Sync reminders across devices (optional)

Without this step, reminders and committee deadlines are saved on the iPad only.
To share them between your iPad, phone and computer:

1. In Vercel, open your project → **Storage** → **Create / Connect** → **Upstash for Redis** (the free plan is plenty).
2. Connect it to this project. Vercel adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` settings for you.
3. Redeploy. The page footer then says *"synced to the cloud."*

### 4. A more reliable IPO calendar (optional)

The IPO panel works without a key by using Nasdaq's public calendar, which occasionally blocks requests.
For a steadier source, get a free key at [finnhub.io/register](https://finnhub.io/register) and add it as **`FINNHUB_API_KEY`**.

### 5. Put it on the iPad home screen

Open the site in Safari → tap the **Share** button → **Add to Home Screen**. It then opens full-screen like an app.

---

## Check that it's working

1. **Open `https://<your-site>.vercel.app/api/health`** in Safari. You should see a short block of text that includes:
   - `"ok":true`, which means the server part is running.
   - `"commit":"…"`, which should match the newest commit on GitHub `main`.
   - `"calendar":{"configured":true,"count":1,"problems":[]}`, which means it found your calendar address.
   - `"calendarLibrary":"ok"` and `"passcodeRequired":true`.
2. **Open the site itself.** A gold **🔒 Enter your Command Center passcode** box appears at the top. Enter your passcode and tap **Unlock**. The calendar fills in, and committee events appear.
3. At the bottom of the page, tap **System check**. Every line should be ✅ except the optional ones. The footer also shows `build …`, the same code as in step 1.

## Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| `/api/health` shows a **404 page** | Vercel is serving only the web page, not the server part. Usually the Vercel project isn't building from this GitHub repo. | Vercel → project → **Settings → Git**: the connected repository should be `chappie-nw/Command-center` and the production branch `main`. Under **Settings → Build & Deployment**, **Root Directory** should be empty. Then redeploy. |
| `"commit"` doesn't match GitHub, or is `null` | Vercel deployed an old upload instead of the GitHub code. | Same as above: connect the repo, then redeploy. |
| `"configured":false` | The server can't see `GCAL_ICS_URLS`. | Check the spelling, that **Production** is ticked, and that you redeployed after saving. |
| `"problems"` mentions **PUBLIC** | You copied the public address. | Copy **Secret address in iCal format** instead. |
| `"unrecognizedSettings"` lists a name | A setting has a typo (for example a trailing space). | Delete it and re-add it with the exact name. |
| Box says **"That passcode didn't work"** | What you typed doesn't match `DASHBOARD_PASSCODE`. | Re-check it in Vercel. Capital letters matter. |

## Customizing

These live near the top of the `<script>` in `index.html`:

- **`COMMITTEES`**: committee names, colors, and **keywords**. Any calendar event in the next `COMMITTEE_DAYS` (30) days whose title or location contains a keyword shows up in that committee's tracker automatically. An event goes to the first committee it matches, so "Chapter business" only collects chapter meetings and closeouts that don't mention a specific committee.
- **`IPO_WATCHLIST`**: your watchlist and notes.
- **`REFRESH_MIN`**: how often each panel refreshes.

## Why the feeds stopped updating in February (fixed)

- **Calendar, 2-week horizon, follow-ups and IPO list:** these were never live. They were a snapshot typed into the page on Feb 25, and the calendar's "Refresh" button only replayed that snapshot. They now come from your real calendar and a live IPO feed.
- **AI news and travel:** these used a free relay service (rss2json) with an option that only works on its paid plan, so every request failed and the panels showed "No stories found". The page also only loaded news when you tapped a button. News is now fetched by the site's own server code (`/api/news`) and loads automatically.

## For developers

- `index.html` is the page, plain HTML/JS with no build step.
- `api/*.js` are Vercel serverless functions: `calendar`, `news`, `ipos`, `store`, `health`. `vercel.json` pins the project to plain static files plus functions, so Vercel doesn't try to apply a framework.
- `npm test` runs the parser and calendar tests.
- `.env.example` lists every setting.
