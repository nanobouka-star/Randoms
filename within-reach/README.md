# Within Reach — Qatar. All yours.

Concept prototype for the BPG Human by Design hackathon (brief: "Only here", Destinations & Tourism).
An interactive-film trip planner: visitors set their travel window, who's travelling and the mood they want, make timed choices scene by scene, then edit and book an itinerary of experiences found only in Qatar. **Khalid**, the traveller's AI friend, reworks the plan in chat.

Not an official Visit Qatar product. Prices, sample events and availability are illustrative.

## Run it

```bash
npm install
npm start                                   # http://localhost:8000, Khalid in offline demo mode
ANTHROPIC_API_KEY=sk-ant-... npm start      # Khalid answers through Claude
```

The page loads its content from `data/*.json`, so it must be served over HTTP. Opening `index.html` from the file system shows a message saying so.

### Deploy

Vercel works with no build step: static files from the root, `api/khalid.js` as a serverless function. Set `ANTHROPIC_API_KEY` in the project's environment variables. `vercel.json` bundles `data/khalid.json` with the function.

## Files

```
index.html          markup for every view and drawer
styles.css          all styles; brand colours and font are the tokens at the top of :root
app.js              planning logic, views, Khalid chat client
checkins.js         Khalid's check-in schedule (shared by the page and a future server job)
data/experiences.json   experiences (EXP)
data/events.json        "What's on" events
data/content.json       traveller types, moods, slot times, season notes
data/khalid.json        Khalid's persona and the brief's copy guardrails
api/khalid.js       POST /api/khalid: server-side Claude call (Vercel-style handler)
api/whatsapp.js     Khalid on WhatsApp: Meta Cloud API webhook
api/send-itinerary.js  emails the itinerary PDF through Resend
vendor/jspdf.umd.min.js  PDF library (bundled, no CDN)
Khalid Knowledge Base.docx  master copy of everything Khalid knows (v2); data/khalid.json carries its Appendix A rules word for word
server.mjs          local dev server: static files + /api/khalid
media/              13 stills, 3 clips (AI-generated placeholders); add khalid.jpg (4:5 portrait, added) for the welcome page
```

## Welcome page

The site opens on Khalid: his portrait in an arched frame and a **Talk to Khalid** button. That leads to a short form for the visitor's name and mobile number, then to the planner's home page, greeted by first name ("Marhaba, Mariam"). Khalid's chat waits in the top bar with a greeting. The name and number also prefill checkout. Only the first name is sent to Claude. The number stays in page memory: it is not sent or stored. Decide where it should go, with a privacy notice and consent, before launch. If `media/khalid.webp` fails to load, the arch shows the Arabic letter خ instead.

## Qatar time

Every trip time is Qatar time (GMT+3, no daylight saving), wherever the visitor is. The questionnaire labels the landing and leaving fields "(Qatar time)", and the itinerary and PDF say so. "Now" (default dates, month picker, live check-ins) is read from Qatar's clock (`qatarNow()` in `app.js`).

## Ramadan

`content.json` → `ramadan` holds the expected dates (2027: 8 February to 8 March, subject to the moon sighting). Inside those dates:
- the dhow, which serves Arabic coffee and dates, is only offered after dark;
- Khalid is told the trip overlaps Ramadan (`ramadanExpected`) and plans food and drink after sunset;
- Khalid always calls the dates expected.

Add each new year's expected dates to the list.

## Finalize and email the itinerary

On the itinerary page, **Finalize my itinerary** asks for an email address and sends the trip as a PDF: day by day, times in Qatar time, prices and total. The page builds the PDF; `api/send-itinerary.js` emails it through [Resend](https://resend.com). It needs `RESEND_API_KEY` and `MAIL_FROM` (a sender on a domain verified with Resend), and is limited to 5 emails per visitor per hour. Without those settings, and on the claude.ai preview, the PDF downloads instead and the page says so. The email address is also filled into checkout.

## Khalid on WhatsApp

**The button:** "Talk to Khalid on WhatsApp" appears on the home page and in the chat panel. It opens `wa.me/<number>` with a greeting that includes the visitor's first name. Set the number in `data/khalid.json` → `"whatsapp"`. While it is empty, the buttons show "Coming soon" and do nothing.

**AI replies (`api/whatsapp.js`):** a webhook for the WhatsApp Business Platform (Cloud API). It verifies Meta's signature, asks Claude for Khalid's reply using `whatsappRules` in `data/khalid.json`, and sends the reply back. To switch it on:

1. In Meta's developer dashboard, create an app with the WhatsApp product and add a business phone number (it can't already be in use on the normal WhatsApp app).
2. Deploy, then set `ANTHROPIC_API_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` and optionally `SITE_URL` (the planner link Khalid sends for booking).
3. In the app's WhatsApp → Configuration, set the callback URL to `https://<your-site>/api/whatsapp` with the same verify token, and subscribe to `messages`.
4. Put the same number in `data/khalid.json`.

Limits of this first version: each reply sees only the incoming message (no memory), only text messages are answered, and there's no rate limiting.

## Khalid's check-ins

`checkins.js` works out when Khalid should message first, and what he says, from the traveller's itinerary:

- **Landing + 1 hour:** "Did you land okay, Mariam?" plus the first plan.
- **21:30 every evening before another full day:** how today went, tomorrow's plan, an alarm reminder for early starts (whale sharks), and "Want to change anything?"
- **7 hours before the flight:** last-day message with the transfer time.

Each check-in has quick replies ("Change tomorrow", "Make tomorrow easier") that go to Khalid like a typed message.

On the page:
- **Preview:** the itinerary's "Preview Khalid's check-ins" link steps through the whole schedule for a demo.
- **Live:** if the page is open during the trip, the latest due check-in appears and the Khalid tab gets a dot.

**Not built yet: sending check-ins when the page is closed.** That needs a server job that:
1. stores each booked trip with the traveller's number and opt-in consent;
2. runs every few minutes (e.g. Vercel Cron), finds due check-ins with `KhalidCheckins.checkins(trip)`, and sends them over WhatsApp;
3. uses Meta-approved **message templates**, because WhatsApp only allows free-form messages within 24 hours of the traveller's last message;
4. stops when the traveller replies STOP, and limits itself to about 2 messages a day.

## Brand

Colours and type follow the brand sheet: primary maroon `#8E1537` (buttons, Home) and teal `#00586F` (labels, overlays, events); secondary orange `#BF4F00` (only-here tags), aqua `#6BDAD5`, sand `#D6D1C4` and light blue `#C8D6EB` (backgrounds and borders). Font: Montserrat, Bold for headlines, Regular for subheads and body.

Each colour has one job, so the extra colour reads as structure rather than decoration:
- **Teal:** navigation and structure, such as the top bar, day headers, selected options and the basket.
- **Maroon:** the main action on each screen.
- **Orange:** "only here" moments, the countdown, the hours number and "Book now".
- **Aqua:** Khalid's messages, travel moods and "in season" status.
- **Light blue:** the page background and your own chat messages.
- **Sand:** borders only.

Aqua, sand and light blue are only ever used under dark text. White text on them measures about 1.5:1 contrast, well below the 4.5:1 minimum for readable text. The WhatsApp button keeps WhatsApp's green so people recognise it.

## Content

- `experiences.json`: each has title `t`, description `s`, `slots` (`morning` / `golden` / `evening`), `months` it runs, optional `best` months, optional `windows` (date ranges it is limited to), `moods`, `rare` (only-here flag), `price` (QAR per adult; children are half), `dur`, `op`, `img`, optional `vid`.
- `events.json`: needs `from` / `to` dates and the slot it fits. Only MotoGP and F1 have real dates (`"real":1`); the rest are sample copy and are tagged SAMPLE in the UI.
- `content.json`: `season` notes are plain text (`head` + `body`), never HTML, so they are safe to feed from a CMS.

## Khalid

The chat tries three sources in order:

1. **claude.ai artifact runtime** (`window.claude.use("sample")`) when the page runs as a claude.ai artifact.
2. **`/api/khalid`**, which calls the Claude API on the server. The key never reaches the page. The persona and guardrails in `data/khalid.json` are applied server-side as the system prompt, so the client cannot override them. Input is limited to the last 6 turns and 120k characters. The reply is constrained to the JSON shape `{"reply": string, "changes": [{"row": number, "pick": id}]}` with structured outputs.
3. **`offline()`**, a keyword-based replan (seasick, kids, history, relaxing, food, romance, wild), so the demo always answers. The UI says when this mode is in use.

Before the traveller has filled in the questionnaire and rolled the film, Khalid answers in at most a sentence, steers them to the questionnaire, promises to help once the itinerary is ready, and changes nothing. The words "the short questionnaire" in his reply become a link to the start of the film; if he doesn't say them, a "Begin your film" link is added. Live Claude receives only `questionnaireDone: false` and the first name at this stage.

When the traveller asks to see their itinerary or plan, the words "your itinerary" in Khalid's reply become a link to the itinerary page.

Khalid's suggestions follow the traveller's questionnaire answers. Claude receives the month, the season note, a climate note (`climate` in `data/content.json`), who is travelling, whether there are children, and the moods, and is told to suggest nothing that doesn't fit: no beach or midday outdoor plans in peak summer, nothing late or overnight with small children. Offline mode follows the same logic when asked for suggestions or the beach.

Every change Khalid proposes is validated in the page (`apply()`): the option must exist and fit that slot's season, date and flight timing, and no experience can end up booked twice. Swaps between two rows are allowed.

Khalid is labelled as an AI friend in the UI and is told never to claim to be a person.

## Changes from the hackathon prototype

- Split into HTML / CSS / JS and moved content to JSON.
- Khalid replaces the anonymous narrator; added the server-side endpoint and dev server.
- Fixed: the airport transfer showed `00:xx` on the wrong day for flights shortly after midnight.
- Fixed: Khalid's changes were applied one at a time, so a swap between two rows was rejected.
- Removed the generic "Race night at Lusail" item, which was bookable on every November evening. The real MotoGP and F1 weekends in `events.json` cover it.
- Season notes no longer go through `innerHTML`.
- Checkout phone placeholder now uses Qatar's +974 code.

## Before it goes in front of a client

- Real availability and prices: replace `price` and the season months with a live feed (e.g. Discover Qatar inventory).
- Checkout: `pay()` is a mock. Hand off to the client's payment provider; do not collect card data in this page.
- Add rate limiting to `/api/khalid` (per IP or session) before it is public. Every call costs money.
- Conservation partners must sign off any wildlife concept (whale sharks, turtles) per the brief.
- Replace the sample events with the confirmed Qatar Calendar.
- Imagery is AI-generated placeholder; use the client's brand assets for anything public.
