# URL Invitation & Attribution System

> A practical guide for **Joel** (operating it) and **Claude** (maintaining it).
> Deep rationale lives in [`personalized-invite-system-research.md`](../personalized-invite-system-research.md). This file is the *how it works / how to use it* reference.

---

## 1. What it does (in one paragraph)

When you reach someone 1:1 (a LinkedIn DM, a Medium article, a warm intro), you hand them a link with a **campaign tag** — `…/?ref=li_ignacy` or the prettier `…/i/li_ignacy`. On load the app:

1. **captures** the tag (first-touch), **strips it from the URL** (so it never leaks via the address bar, a screenshot, or the `Referer` header), and **stores it for the session** (sessionStorage, **not a cookie**);
2. registers it on **PostHog** as the super-properties `entry_source`, `entry_segment`, `entry_source_kind`, so **every** later event is attributed automatically;
3. shows a **subtractive, segment-tuned founder touch** — a slim ribbon, or (for referral/standards) a dedicated welcome — and, after the first validation, a one-time **Mom-Test feedback nudge**.

The personalization is by **role/source, never by name**. The thoughtfulness is in your DM; the link just honors the promise and tells you which DM worked.

---

## 2. The links you actually send

| Form | Example | Notes |
|---|---|---|
| Query tag | `https://www.ifcvieweronline.eu/?ref=li_ignacy` | Simplest, always works. |
| Pretty path | `https://www.ifcvieweronline.eu/i/li_ignacy` | Nicer to paste. Same effect (Vercel serves the SPA for any path). |
| Alias | `…/?invite=li_ignacy` | `invite` is an accepted alias for `ref`. |

A tag must match `[A-Za-z0-9_-]{1,64}`. Anything else is ignored (and stripped).

**Deep-link combos** still work alongside the tag, e.g. `…/?ref=hn&model=https://host/a.ifc` or `…/i/li_dion` then they drag their own file.

---

## 3. The codes (who gets what)

Codes are defined in [`src/lib/invite-registry.ts`](../src/lib/invite-registry.ts). Each maps to a **segment** and a **source kind** — **never a name** (the person's identity stays in your private `content/launch/linkedin-outreach-kit.md`).

| Code(s) | segment | sourceKind | Surface they see |
|---|---|---|---|
| `li_ignacy`, `li_fugas`, `li_majcher`, `li_carlos` (→ `pt`), `li_bimpure` | `coordinator` | `linkedin` | Ribbon (handoff/triage copy) |
| `li_dion`, `li_louis`, `li_antonio` | `dev` | `linkedin` | Ribbon ("runs on web-ifc, check the network tab") |
| `li_noardo`, `li_plannerly` | `standards` | `linkedin` | **Dedicated view** ("on-ramp, not a replacement for bSI") |
| `hn`, `reddit` | (dev/coord) | `public` | **Nothing** — public sources punish funnels |
| `md_<slug>` (prefix) | `coordinator` | `medium` | Ribbon ("thanks for coming from the article") |
| `warm_<x>` (prefix) | `coordinator` | `referral` | **Dedicated view** ("you were pointed here for a reason") |

Unknown codes → attribution is still captured (you'll see the raw tag in PostHog), but no ribbon/view shows.

### Which surface appears (the adaptive policy)
- **Dedicated view** (`InviteView`) — only `referral` **or** `standards`, and not on `public`. One-time, skippable.
- **Ribbon** (`InviteRibbon`) — everyone else, **desktop only** (suppressed on mobile and on `public`), unless the dedicated view is showing (they're mutually exclusive).
- **Feedback nudge** (`InviteFeedbackNudge`) — any non-`public` invited visitor, **once**, **after** their first validation, in the viewer.

---

## 4. How to add a new person / channel

1. Open `src/lib/invite-registry.ts`.
2. Add a line to `REGISTRY` with **only** `segment` + `sourceKind` (+ optional `locale`):
   ```ts
   li_newperson: { segment: 'coordinator', sourceKind: 'linkedin' },
   ```
   For a one-off article use the `md_` prefix (no registry entry needed): just send `?ref=md_your-slug`. Same for a warm intro: `?ref=warm_whoever`.
3. Hand them `…/i/li_newperson`.
4. (Optional, by hand, Tier-2) a **named note** or **Loom** for a hot target — set `noteKey`/`loomUrl` on that entry. The `noteKey` points to an `invite` i18n string you author yourself (so no names ship by default). **Verify every personal detail before sending** — a wrong detail reads as fake.

> Keep the registry in sync with `content/launch/linkedin-outreach-kit.md`. Never put a real name/employer in the registry — segment/source only.

---

## 5. The funnel (your scoreboard)

In PostHog, build a funnel and **break it down by `entry_source`** (and/or `entry_segment`):

```
invite_link_opened → file_opened → validation_completed → share_report_clicked
```

- `share_report_clicked` by `entry_source` is the **north-star** — which outreach produced the loop.
- `invite_feedback_prompted` / `invite_feedback_dismissed` tell you whether the Mom-Test nudge reached people and landed.
- For **devs** (Segment B), don't judge by the loop — they critique, they don't hand reports to exporters. Judge them on mentions/backlinks.

Companion: `content/launch/posthog-funnel-setup.md`.

---

## 6. Privacy posture (why it's safe to claim "we don't track you")

- The tag is a **non-personal campaign label**, never PII.
- **sessionStorage, not a cookie** — cleared when the tab closes; consistent with the cookieless analytics (`persistence: 'memory'`).
- **Stripped from the URL** on load (`history.replaceState`) — no leak via address bar / history / `Referer`.
- **Nothing server-side** — attribution is entirely client-side; the Cloudflare Worker is not involved.
- Disclosed honestly in [`/privacy`](../src/components/legal/PrivacyPolicy.tsx) under "Invitation and referral links."

---

## 7. Where everything lives (file map)

| Concern | File |
|---|---|
| Parse `?ref` / `?invite` / `/i/:code` | `src/lib/url-params.ts` (`parseAppUrlParams`, `parseInvitePath`) |
| Capture + strip + register + first-touch | `src/lib/attribution.ts` (`captureAttribution`, `getStoredEntrySource`) |
| Code → context map + policy | `src/lib/invite-registry.ts` (`resolveInvite`, `shouldShowInviteRibbon`, `shouldShowInviteView`, …) |
| Boot wiring | `src/main.tsx` |
| Resolve context + render surfaces | `src/App.tsx` |
| Slim ribbon | `src/components/InviteRibbon.tsx` |
| Dedicated welcome | `src/components/InviteView.tsx` |
| Post-aha Mom-Test nudge | `src/components/InviteFeedbackNudge.tsx` |
| Founder photo (self-hosted, COEP-safe) | `src/components/FounderAvatar.tsx` + `public/founder.jpg` |
| Analytics events + super-properties | `src/lib/analytics.ts` (`registerEntrySource`, `trackInviteLinkOpened`, `trackInviteFeedback*`) |
| Copy (10 locales) | `src/locales/*/invite.json` (+ `src/locales/invite-parity.test.ts`) |
| Tests | `src/lib/{attribution,url-params,invite-registry}.test.ts` |

### Gotchas for Claude
- **First-touch wins:** a second tag never overwrites the session. To re-test a different code locally, `sessionStorage.clear()` first.
- **Don't read the live URL for context** — it's already stripped by the time App mounts. Use `getStoredEntrySource()`.
- **Typed `t`:** dynamic keys must come from the typed helpers (`inviteRibbonKey`, `inviteViewKey`, `inviteFeedbackKey`) returning literal unions, or via the `i18n.t` instance with a cast (see `InviteView` `noteKey`). New `invite` keys must be added to **all 10 locales** (parity test) and to `src/i18n/types.ts` if it's a new namespace.
- **No names in the bundle.** Registry is categorical only.
- **Replacing the founder photo:** regenerate `public/founder.jpg` (same filename) — no code change.

---

## 8. Status & what's left

Built & verified (Phases 0, 1, 1.5, 2 + founder photo): attribution, registry, ribbon, pretty path, dedicated view, feedback nudge, i18n ×10. **Deferred (Phase 3, until data justifies):** tie the invite to a shareable **badge/certificate + benchmark percentile**. **Manual (yours):** the PostHog funnel, hand-authored `noteKey`/`loomUrl` for hot targets, and sending the DMs.
