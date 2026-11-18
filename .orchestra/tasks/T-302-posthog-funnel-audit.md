# T-302 — Product / traffic / funnel audit with real PostHog data (2026-11-18)

Clean window: **2026-11-02 → 11-12** (11 days). From 11-13 to 11-18 the SPA did not record events (builds without the key, see T-301), so the "11–17 vs 4–10 Nov" comparison is **not possible** in PostHog. For that week, use GSC.

## Acquisition (sessions with $pageview, by referrer)
direct 1,310 · **bing 1,080** · google 759 · internal 613 · other 170 · linkedin 2.
Bing brings more sessions than Google, and those are real sessions: 57% of them open a file (688/1,201), against 52% for Google and 41% for direct. Assumption to check: Bing Webmaster Tools is not being watched.
Device: desktop 4,093 sessions (49% open a file) · mobile 322 (22%) · tablet 17.

## Activation funnel (per session, 4,439 sessions)
| Step | Sessions | % |
|---|---|---|
| Session | 4,439 | 100 |
| landing_cta_clicked | 2,257 | 51 |
| file_opened | 2,096 | 47 |
| validation_completed (automatic) | 2,051 | 46 |
| value action (feature_used / fix / IDS / data) | 767 | 17 |
| export / share report | 29 | 0.7 |
| pricing (viewed / intent / pro_entry) | 60 | 1.4 |
file_opened by source: upload 2,594 · demo 429. file_open_failed (since 10-19, property `error_msg` = code@phase): parse@geometry 30 (avg 368 MB, max 2 GB) · scene@setup 20 (avg 320 MB) · parse@properties 6 (small files) · network@download 5 · out-of-memory@geometry 5 (avg 352 MB) · worker-init@geometry 3 · viewer-unavailable@attach 2 · http@download 1. ~75% are large files (>300 MB).

By entry page (sessions → opened): `/` 3,400 → 1,924 (57%) · `/es/` 77 → 43 · `/fr/` 35 → 22 · `/de/` 31 → 22 · `/pt/` 28 → 22 · `/sketch/` 131 → 0 (expected) · blog posts (reduce-size, best-free, iso-19650) about 20 each → 0–1. **The blog does not activate.**

## Features (feature_used, events)
multi_model 698 · measurement 245 · section_plane 129 · floor_plan 42 · takeoff 39 · drawing_generate 38 · batch_fix_preview 37. fix_first_clicked 537 events / 133 sessions; issue_fix_applied 30.

## Pricing
Pricing pageviews over the whole period: /pricing/ 20, /es/precios/ 11, /de/preise/ 7, /ja/ 6, zh/th 4 each. **Not enough volume** to judge whether the redesign helps or hurts. pricing_role_picked 11, pricing_intent 12.

## What CANNOT be measured (by design)
- **D1/D7/D30 retention and first → second session:** `persistence: 'memory'` + `person_profiles: 'identified_only'` (cookieless, GDPR). Each load is a new anonymous user. Do not promise retention without a decision on consent.

## Findings → actions
| P | Finding | Action |
|---|---|---|
| P0 | 11-13..18 lost; cause fixed (PR #627) | Done. Restart comparisons from 11-19 |
| P1 | Failed opens: ~75% are files >300 MB (parse@geometry, scene@setup, OOM) | A clear message for large files + guide them to .frag / Pro; investigate scene@setup |
| P1 | Bing > Google in sessions and activation | Bing Webmaster Tools: sitemap, IndexNow, monitoring |
| P1 | Blog does not activate (~0%) | In-post CTA "open your IFC here" / live demo above the fold; measure blog_tool_clicked |
| P1 | Mobile activates at 22% vs 49% on desktop | Review the mobile CTA/upload flow |
| P2 | Exports are 0.7% of sessions; pricing 1.4% | Too little volume for pricing A/B tests; focus on activation → value |
| Decision for Joel | Retention cannot be measured | Keep cookieless (current) or use an opt-in persistent ID |
