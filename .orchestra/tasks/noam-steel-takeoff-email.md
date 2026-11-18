# Correo para Noam — Steel takeoff

> Desplegado en producción el 2026-11-14: ya se puede enviar.
> NO se le activa Pro (decisión de Joel 2026-11-14: nada que cueste servidor). Usar el enlace de demo guiada.

**Enlace:** https://www.ifcvieweronline.eu/

---

**Subject:** Your steel takeoff is live in IFC Viewer Online

Hi Noam,

Thanks again for telling me how you work on commercial steel. Based on what you described, I've built a steel takeoff tool, and it's now live:

https://www.ifcvieweronline.eu/

How to use it:
1. Open the viewer and drop in your Tekla IFC (IFC2x3 or IFC4). It stays in your browser; nothing is uploaded.
2. Open **Tools → Steel takeoff** and click **Calculate**.
3. You get a table grouped by profile (IPE300, HEA200, PL10x200…) with piece count, total length, total weight and material, plus totals.
4. Click a row to isolate those pieces in 3D. Click it again, or press "Show all", to bring everything back.
5. Export it to CSV or Excel. The Excel file has a second sheet with one row per piece (mark, length, weight and where each value came from).

Where the numbers come from: base quantities first (NetWeight), then the Tekla Quantity / Tekla Common property sets, then volume × 7850 kg/m³. If none of those are there, it uses the geometry. If a piece has no weight, the table tells you how many.

It's part of the Pro plan. [I've turned Pro on for your account / Here's a trial: …]

One request: could you run it on one of your real models and tell me whether the totals match your Tekla lists? If anything is off (a profile name, weights, bolts), a short reply or a screenshot is plenty. If you can share a model (even a small or anonymised one), I'll use it to test every future change.

Thanks,
Joel
