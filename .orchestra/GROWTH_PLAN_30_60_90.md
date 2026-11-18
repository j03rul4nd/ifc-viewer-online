# Growth plan 30/60/90 (2026-11-18)

Base: GSC, last 28 days = 1,990 clicks, 53.2k impressions, position 9.3. The home page brings in about 60% of clicks, almost all from "ifc viewer*" queries. Labels: **[A]** = assumption, not measured.

## 0–30 days: protect the head term and measure properly
- Read PostHog weekly users and the source split (organic, direct, referral) to confirm or rule out the "drop". Owner: Joel; 10 minutes.
- Track "ifc viewer" in GSC weekly. Trigger: if the average position is above 7 for 3 weeks, compare the rendered visible text of the old and new home and restore the copy/sections that were removed.
- Request indexing again in GSC for `/` and `/es/` after each deploy that touches them.
- Grow the pages that are already gaining impressions (`/blog/best-free-ifc-viewer/` ×4, `/ifc-viewer-examples/`): add internal links from the home and the language homes. **[A]** +10–20% clicks on those pages.
- Target: 28-day clicks ≥ 2,000 (keep current level).

## 31–60 days: capture the long tail
- 774 queries in 7 days: build a list of queries with impressions > 50 and CTR < 2%, and rewrite the title/description of the page each lands on. **[A]** +0.5 pt CTR.
- "ifc model viewer", "ifc reader", "ifc file viewer": dedicated sections or landings if no page ranks above position 10.
- Review the 33 "crawled – currently not indexed" pages: merge them or make them stronger.
- Target **[A]**: 28-day clicks 2,400.

## 61–90 days: convert traffic into paying B2B users
- Link from the organic pages that rank (validation, ISO 19650, IFC 4.3) to the paid features (Steel Takeoff, validation) with the existing events.
- Measure the funnel organic → Health Score → pricing in PostHog.
- Target **[A]**: 28-day clicks 2,800; first sign-ups from organic traffic measured.
