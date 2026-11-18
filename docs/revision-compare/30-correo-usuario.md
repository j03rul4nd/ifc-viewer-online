# Borrador del correo al usuario (NO ENVIADO — requiere OK de Joel)

- **Para:** el usuario que respondió al correo de feedback (Tailandia).
- **Asunto:** Re: your feedback — unmarked changes on revised drawings
- **Enlace:** `https://www.ifcvieweronline.eu/?compare=demo&tour=revision&ref=rc-th1`. Solo funcionará tras desplegar T3 y T6. `ref=rc-th1` atribuye la visita sin cookies (ver `analytics.ts` `trackInviteLinkOpened`).
- **Antes de enviar:**
  1. Desplegar (`npm run deploy:pages`; nunca dos builds a la vez).
  2. Abrir el enlace en móvil y en escritorio.
  3. Comprobar que la bandera de PostHog `revision-compare` está activa para `ref=rc-th1` o para todos.
- **Asistencia:** sin llamada (decisión de Joel, 2026-11-13). El usuario responde a este correo o envía feedback desde la herramienta.

---

Hi {{first_name}},

Thank you for your reply. "Unmarked changes on revised drawings" was the most useful thing anyone has told us this year, so we built something for it.

You drop the old and the new revision, and it shows you everything that changed: added, removed, moved (with the distance and direction), resized, and changed properties. It works with IFC models and PDF drawings. On the PDFs it draws the revision clouds the designer forgot. You can tick each change as "reviewed" or "affects site", so nothing slips through. Then you export a PDF or BCF to take to site or send back to the designer.

Your files never leave your computer. Everything runs in the browser, and nothing is uploaded.

2-minute guided demo with sample revisions (no sign-up):
https://www.ifcvieweronline.eu/?compare=demo&tour=revision&ref=rc-th1

I'd love to hear how it does on one of your real revision pairs. Just reply to this email, or use the "Send feedback" button inside the tool.

Three quick questions so we get it right for you:
1. Do your revisions arrive as IFC, PDF, DWG, or a mix?
2. Roughly how big are the files?
3. Do your precast pieces have a mark or piece number in the model?

Thanks again,
Joel
IFC Viewer Online
