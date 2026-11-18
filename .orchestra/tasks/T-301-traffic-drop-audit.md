# T-301 — Investigate the traffic drop after the Nov redesign (2026-11-18)

## Verdict
No evidence that organic search traffic fell because of the redesign. There is one moderate signal on the home page's head term ("ifc viewer"). Nothing qualifies as a verified regression, so no fix PR was opened.

## Search Console data (sc-domain:ifcvieweronline.eu, read 2026-11-18; GSC runs ~2 days behind)
| Window | Clicks | Impressions | CTR | Position |
|---|---|---|---|---|
| 28d vs prev 28d | 1,990 vs 1,290 (+54%) | 53.2k vs 38.0k | 3.7% vs 3.4% | 9.3 vs 8.2 |
| 7d vs prev 7d | 426 vs 451 (−5.5%) | 13.3k vs 12.7k | 3.2% vs 3.6% | 11.2 vs 10.4 |
| Queries containing "ifc viewer", 7v7 | 159 vs 202 (−21%) | 3.62k vs 3.93k | 4.4% vs 5.1% | 7.5 vs 6.0 |

Pages, 7v7: home `/` 255 vs 283 (−28; impressions 5,519 vs 6,276) · `/es/` 5 vs 15 · `/ifc-viewer-examples/` 28 vs 16 · `/blog/best-free-ifc-viewer/` 10 vs 5 (impressions 1,033 vs 257) · `/blog/ifc-4-3-infrastructure-explained/` 10 vs 1.
Queries, 7v7: "ifc viewer" 105 vs 142 · "ifc viewer online" 15 vs 23 · "ifc online viewer" 17 vs 3 · "ifc model viewer" 6 vs 0.
Indexing: 1.25k indexed / 199 not indexed (noindex 115, crawled-not-indexed 33, alternate canonical 29, redirect 15, 4xx 4, duplicate 3). These were not compared over time; the 15 redirects and 3 duplicates are known to be intentional.

## Static SEO of the home, before (934383de, pre-11-08) vs now (origin/main)
Title, description, robots, canonical, the 11 hreflang tags, H1 and the static internal links (7) are identical. Only two things changed: the og:image/twitter:image (Shanghai capture) and a pre-paint theme script. Live checks: `/`, `/es/`, `/pricing/`, `/ifc-viewer-examples/` and `/blog/best-free-ifc-viewer/` all return 200, `index, follow`, and a self canonical.
`/es/` was rewritten on 2026-11-10 (f7860f6a) from a hand-written static page to a generated shell; its title is kept and the H1 changed. Its 15→5 clicks are too few to draw a conclusion.

## Measurement
- The production bundle (`/assets/index-*.js`) contains a `phc_` key and `eu.i.posthog.com`, so PostHog is active. `src/lib/analytics.ts` has had no init or config changes since 11-08; only new events were added.
- PostHog itself could not be checked: the built-in browser has no PostHog session. **Pending:** Joel to look at weekly unique users in PostHog. If PostHog drops while GSC does not, the cause is measurement or non-organic traffic (direct, referral, events), not SEO.
- Hosting changed from Vercel to Cloudflare Pages (#469, 11-07; Vercel turned off in #596, 11-13). The key is in the bundle, so this did not break tracking.

## Matrix
| Change | Evidence | SEO impact | Confidence | Fix | Priority |
|---|---|---|---|---|---|
| Home redesign (#492/#502, 11-10) | Static meta identical; "ifc viewer" position 6.0→7.5, home −28 clicks 7v7 | Possible small ranking loss on the head term | Low–medium (1 week, normal Google volatility) | Watch for 2 more weeks; if position stays above 7, compare the rendered visible text of the old and new home | P2 |
| /es/ generated (f7860f6a, 11-10) | 15→5 clicks, impressions 156→137 | Small | Low (tiny sample) | Watch | P3 |
| og:image changed | Social only | None in Google | High | — | — |
| Vercel→CF Pages | 200 + canonical OK; PostHog key present | None found | Medium | — | — |
| New posts/landings (#569/#574/#511) | best-free-ifc-viewer impressions ×4, 4.3 post 1→10 clicks | Positive | Medium | Keep going | — |

## Not covered
PostHog data (no session) · indexing trend over time · a visual diff of the rendered home body (old vs new). The "user drop" Joel saw is not visible in GSC: it needs PostHog to confirm whether it is real and where it comes from.

## UPDATE 2026-11-18 — PostHog checked: the "drop" is a MEASUREMENT failure
- Unique users per day in PostHog: 11-09..12 about 433–472 → 11-13 217 → 11-14 51 → 11-15..17 8–15. Tracking stops around 2026-11-13 09:00 UTC. The static pages (/pricing/ ×10, which have their own snippet) kept tracking; the SPA stopped.
- Cause (verified on the *.pages.dev URL of each deploy): Pages production deploys a1edf636 (3101dd0), fdfe4da6 (28162c1) and 4f7abdb6 (3c746c7) were built **without VITE_POSTHOG_KEY** (no `phc_` in index-*.js). e78f0454 has it. Today's deploys (294980e3 and 8f2924fa, 11-18) have it, and live production sends `/e/` to eu.i.posthog.com again (since about 11:00 UTC: 251 events).
- Organic traffic did not drop (GSC −5.5% 7v7). Users from 11-13 to 11-18 were not recorded and cannot be recovered.
- Prevention: `cf-pages/prepare.mjs` now refuses to deploy a dist without the key (escape hatch `ALLOW_NO_ANALYTICS=1`). Change in worktree C:/repo/ifc-analytics-guard, branch fix/deploy-analytics-key-guard, PR #627 merged (c4f6584b), takes effect on the next deploy. Tested: no key → fails; with key → passes.
- Rule: always build with `.env.production.local` present in the worktree you deploy from.
