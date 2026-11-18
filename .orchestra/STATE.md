# STATE — 2026-11-14

- E1 Steel Takeoff: FUSIONADO en main (PR #621, b5986155). EN PRODUCCIÓN (Cloudflare Pages 2026-11-14). No toca public/models → no hace falta deploy:models.
- Worktree C:/repo/ifc-steel (feat/steel-takeoff) ya no hace falta; tiene public/** regenerados y fixtures/steel/ sin commitear (descartables). Borrarlo con cuidado (ver memoria feedback_worktree_junction_delete).
- Vercel check falla en todos los PR (cuenta bloqueada, Vercel ya no despliega): ignorar.
- Siguiente: elegir con Joel entre backlog E1+ o nueva épica.
- #622 (2026-11-14, deployed): template content + Studio words in all 10 languages; follow-up 'content in 8 more languages' is done.
- 2026-11-14: Steel demo tour EN PRODUCCIÓN (PR #625, deploy:models + deploy:pages). Enlace: https://www.ifcvieweronline.eu/?steel=demo&tour=steel&ref=noam
- 2026-11-18: worktree C:/repo/ifc-mail and temp folders deleted; branches feat/mail-* kept (all merged).
- 2026-11-18 T-301: the "drop" = PostHog stopped recording (Pages deploys 11-13..16 built WITHOUT VITE_POSTHOG_KEY). Fixed by the 11-18 deploys. Organic traffic flat. Guard in C:/repo/ifc-analytics-guard (fix/deploy-analytics-key-guard) PR #627 merged (c4f6584b), takes effect on the next deploy. See tasks/T-301.
- 2026-11-18: main c4f6584b deployed to Pages (542ba2ba) from C:/repo/ifc-analytics-guard; bundle with PostHog key. Funnel audit in tasks/T-302.
