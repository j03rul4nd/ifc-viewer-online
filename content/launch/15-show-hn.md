---
title: "Show HN: Browser-only IFC/BIM validator — your model never leaves the tab"
platform: Hacker News (Show HN)
type: launch / one-shot
viral_score: n/a
seo_score: n/a
fire_when: "ONE SHOT. Do not fire until: (a) VITE_REPORT_URL verified live in prod, (b) 5 design-partner interviews done, (c) the /bench benchmark is live so you can cite a real median. Post Tue–Thu, ~08:00–10:00 ET. Be at the keyboard for the next 3–4 hours to answer every comment."
canonical: n/a
---

> This is a native Hacker News post, not an article. No cover image, no SVG. Below is everything you paste, plus how to post it and how to answer the predictable pushback. HN punishes marketing voice — keep it plain, technical, and honest about limits. Read the rules in the room before you take the stage.

---

## TITLE (paste into the "title" field)

```
Show HN: Browser-only IFC/BIM validator — your model never leaves the tab
```

(72 chars. Alt if you want the constraint even more forward: `Show HN: An IFC validator that runs 100% client-side — no upload, no server`.)

## URL (paste into the "url" field)

```
https://ifcvieweronline.com
```

---

## FIRST COMMENT (post this yourself, immediately, as the top comment)

On HN the body goes in the first comment. Paste this:

```
Author here. IFC is the open exchange format for BIM/building models — basically
a STEP file describing every wall, duct, room, GUID and property set in a building.
The annoying truth about IFC is that a file can look perfect in a 3D viewer and
still be broken in ways the geometry never shows you: missing property sets, GUIDs
that change on every export (so revision diffs and BCF issues de-reference),
spaces that didn't export, or coordinates parked kilometres from the origin. You
usually find out when the client's model checker rejects it.

The hard constraint I set: the IFC file never leaves your browser. Not "uploaded
and deleted" — never uploaded. A lot of these models are under NDA, so the people
who'd actually use a checker often *can't* drop a federated client model into an
online tool. You can verify the claim yourself — open DevTools → Network, drop a
file, watch nothing leave.

That one rule dictated the whole architecture:
- web-ifc (a C++ IFC parser compiled to WASM) does the parsing client-side.
- Three web workers keep the main thread free: parser, validator (38 rules +
  spatial tree), and export.
- An OPFS cache (key = name:size:lastModified) makes reloads near-instant.
- It's on GitHub Pages, which can't set headers — but web-ifc needs
  SharedArrayBuffer, which needs COOP/COEP / crossOriginIsolated. So there's a
  coi-serviceworker injecting the headers client-side. It's a hack; it works.

The 38 rules collapse into one Health Score (0–100). The non-obvious bit is the
curve: IFC defects are systematic (if the exporter skipped materials, it skipped
them for all 5,000 walls, which is ONE problem). A linear penalty pins every real
model to 0 — I shipped that bug first. So penalties are logarithmic:
weight × (1 + ln(count)). 4 issues and 4,000 land in genuinely different places.

Two honest things, because overclaiming is the fast way to lose this crowd:

1. There IS one place a byte touches a server. Sharing a report renders a summary
   at a Cloudflare edge route (/r?d=...) so the link is crawlable and unfurls. What
   crosses is ONLY the derived summary — the score and a condensed issue list. No
   geometry, no filename, no model. I won't say "nothing ever touches a server,"
   because that's false the moment a link has to be crawlable.

2. The viewer is not the moat and I won't pretend it is. It runs on @thatopen +
   web-ifc — someone else's excellent libraries. A browser IFC viewer is table
   stakes now; even validation is converging (buildingSMART shipped their official
   validator GA in 2026 — free, but upload + account, 250MB cap, schema conformance
   only, no 3D, no single score, no "how to fix it"). What I actually built is the
   workflow: a number you can quote, and — when a rule fails — a hand-written fix
   for that rule in Revit/ArchiCAD/Tekla/Allplan, in 10 languages. I built an
   AI-assisted version of that first; it was non-deterministic, needed a server,
   and had no moat, so I deleted it and wrote the boring deterministic table.

Known limits: big-model rendering is bounded by your machine's RAM, not a server's
(I cache the parse, but the first parse of a monster file is on your hardware). And
it's not the official referee — if your contract needs an IDS conformance stamp,
that's buildingSMART's tool, not mine.

Core viewer/validator is MIT; the cloud bits (the email proxy and the edge summary
route) are the only proprietary part.

I'd genuinely like you to break it: drag your worst, weirdest IFC in and tell me
what the score got wrong, or what the parser choked on. That's the feedback I'm
here for.
```

---

## HOW TO POST (checklist)

1. **Preconditions (all three):** `VITE_REPORT_URL` verified live, 5 interviews done, `/bench` live with a real median you can cite ("I scored N models, the median is 71"). Don't fire early — Show HN is a one-shot; a flat launch is hard to redo.
2. **Timing:** Tuesday–Thursday, ~08:00–10:00 US Eastern. Avoid weekends and Fridays.
3. **Be present.** Clear 3–4 hours. The single biggest predictor of a Show HN doing well is the author answering every comment fast, technically, and without defensiveness.
4. **Don't ask for upvotes anywhere.** It's against the rules and HN detects voting rings. Just post and engage.
5. **Lead replies with the technical substance, not the pitch.** This crowd rewards "here's exactly how it works and where it's weak."
6. **If it flops, don't repost the same day.** You can try a different angle weeks later; don't burn goodwill.

---

## PREPARED REPLIES (the predictable pushback)

**"buildingSMART already has a free official validator now."**
> Yep, and it's the referee — for an IDS conformance stamp, use it, not me. But it
> wants an upload and an account, caps at 250MB, is schema-conformance only, has no
> 3D, no single score, and won't tell you how to fix anything. Mine never uploads,
> renders, gives one number, and hands you the fix per authoring tool. Different
> shape: theirs is a gate, mine is a mirror you hold up before the gate.

**"This is just a wrapper around @thatopen / web-ifc."**
> The viewer is, and I say so in the post — that part's a commodity and I didn't
> build the geometry engine. The part that isn't a wrapper is the 38-rule scoring
> with the log curve, and the hand-written remediation corpus (38 rules × 4 tools ×
> 10 languages). The wrapper is the easy 10%; the moat was never the renderer.

**"COI service worker is a hack / SharedArrayBuffer on Pages is fragile."**
> Totally agree it's a hack. It's the price of refusing a backend on a static host.
> If I ran a server I'd set real COOP/COEP headers — but then the file could leave
> the browser, which is the one thing I won't allow. Open to a cleaner approach if
> you've got one.

**"What stops me forking the MIT core and running the same product?"**
> Nothing stops the fork — the code's the easy part to copy. What's slow to copy is
> the remediation corpus in 10 languages, a Health Score that's already a number in
> someone's email, and a report loop that's already circulating. I open-sourced the
> hard-looking part because it was never the defensible part.

**"How is this a business?"**
> Honestly, today it's ~0 users and not a business yet — I'm here partly to find out
> if the loop works. The bet: the free user is the exporter (runs a check before
> handoff); the buyer is the coordinator who owns conformance and would pay to
> enforce it. If that loop doesn't form, there's no business, and I'd rather learn
> that now than pretend otherwise.

**"Big models will OOM the tab."**
> They can. It's the real cost of client-side — the first parse is bounded by your
> RAM, not a server's. I cache to OPFS so reloads are instant, force single-threaded
> WASM to survive nested-worker issues, and it handles a lot more than you'd expect,
> but a genuine monster file is the case where a native desktop tool wins. Fair
> tradeoff for never uploading, IMO — but tell me what size choked and on what
> hardware, that's useful data.
```
