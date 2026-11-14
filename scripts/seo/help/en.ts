import type { HelpCopy } from './types'

export const en: HelpCopy = {
  ui: {
    hub: 'Help: receiving IFC deliveries',
    hubIntro: 'Short guides for the paid workspace: setting up a project, getting suppliers ready, reading a verdict, connecting your tools, and how your data is kept.',
    preview: 'Preview: these features are not open for sign-up yet. The guides describe how they work today.',
    all: 'All guides',
    home: 'IFC Viewer Online',
    pricing: 'Plans',
  },
  topics: {
    setup: {
      title: 'Set up a project',
      desc: 'From an empty workspace to the first checked delivery, in five steps.',
      sections: [
        ['1. Create the project', 'A project is one site or one contract. Give it a name, a short code (2 to 6 capital letters, used at the start of every file name) and the minimum score a delivery needs. You can change all of it later.'],
        ['2. Set the requirements', 'Choose a template (an EIR profile) or upload your own IDS. Suppliers are checked against it before they send, and again on the server when the file arrives.'],
        ['3. Invite the suppliers', 'Each supplier gets an upload link of their own; no account is needed. The link is shown once: copy the ready message and send it from your own e-mail.'],
        ['4. Connect a folder or a webhook', 'Deliveries can also arrive from a watched SharePoint or Drive folder, and every verdict can be sent to your tools by webhook. Both are optional.'],
        ['5. Send a test delivery', 'The getting-started list sends a small public IFC through the same checks a supplier\'s file goes through, so you see a verdict in the inbox before anyone delivers.'],
      ],
    },
    suppliers: {
      title: 'Get your suppliers ready',
      desc: 'What a supplier sees, what they must get right, and what each error means.',
      sections: [
        ['Their link', 'The link opens a page with the project\'s requirements, the file name rule and the next due date. Anyone with the link can deliver in that supplier\'s name, so it should not be shared. If it leaks, make a new one from the supplier\'s card: the old one stops working at once.'],
        ['The free check', 'When a supplier chooses a file, it is checked in their own browser: whether it is a complete IFC, the name rule and the score. They see what to fix, with a free guide for each rule, before anything is sent.'],
        ['The file name', 'Names follow ISO 19650: project code, the supplier\'s own code, volume, level, type, role, number, status (S0 to S4) and revision, for example `TNO-ESTRUC-ZZ-02-M3-S-0001-S2-P01.ifc`. A name that breaks the rule is refused by the server too.'],
        ['When something fails', 'Too large: export without unused elements or split the model. Not an IFC: export again as IFC, as a renamed native file will not work. Damaged: the file was cut short during export or download, so export it again. Too many attempts: wait a minute; nothing is lost.'],
      ],
    },
    verdict: {
      title: 'Read a verdict',
      desc: 'The file\'s state, the automatic verdict and your review are three different things.',
      sections: [
        ['The file', 'Every delivery first gets a file state: ok, damaged (cut short or not closed, never scored), not an IFC, or not the file that was declared (its SHA-256 differs).'],
        ['The automatic verdict', 'A file that opens is scored from 0 to 100 against your requirements. At or above the project\'s minimum it is accepted automatically; below it, rejected with the reason. This verdict is the server\'s, and it is kept.'],
        ['Your review', 'A person can accept or return any delivery with a reason, and that decision is sealed in the register with the file\'s fingerprint. A delivery cannot be accepted before it has been validated; returning it early stays possible.'],
        ['The register', 'Every receipt and decision is kept in order, with who did it and when. Export it at any time from the project tab, as ZIP (JSON and CSV) or JSON.'],
      ],
    },
    api: {
      title: 'API and webhooks',
      desc: 'Deliveries, verdicts and events for your own tools.',
      sections: [
        ['Deliveries', 'The list of deliveries returns, for each one, the file state, the automatic verdict (`auto`) and a person\'s review (`review`) as separate fields. `verdict` stays the effective value for older integrations. The full contract is described in OpenAPI.'],
        ['Webhooks', 'Choose the events (received, validated, accepted, returned) and an https address. Each call is signed with HMAC-SHA256 over the timestamp and the body; the secret is shown once. Addresses on private networks are refused.'],
        ['Watched folders', 'A SharePoint or Drive folder can deliver on a supplier\'s behalf. Several files are handled at once, and the report is written next to each model. A file that failed on the network is retried on the next check.'],
        ['Limits', 'Public pages allow 60 requests a minute per address, and the signed-in API allows 600 a minute per user. Above that, the answer is a 429 with `Retry-After: 60`.'],
      ],
    },
    security: {
      title: 'Security and your data',
      desc: 'How one company\'s data is kept apart, and how to take it all out.',
      sections: [
        ['Each company apart', 'Every query is filtered by company, and the database itself enforces it as well (row-level security): a company never reads or changes another\'s data, even by asking for a known id.'],
        ['Roles', 'Owners and admins manage people, suppliers\' links, webhooks and project deletion. Editors review deliveries, reviewers comment and viewers read. A supplier only ever sees their own deliveries.'],
        ['Audit log', 'Inviting or revoking a supplier, decisions, client links, webhooks, automations, roles, the logo, exports and deletions each leave a line with who did it and when.'],
        ['Taking it out', 'From the project tab, export everything (deliveries with both verdicts, the register and the issues) or delete the project. Deleting needs the project name typed, removes the files too, and leaves only a line in the audit log.'],
      ],
    },
  },
}
