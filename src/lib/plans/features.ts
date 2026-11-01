// ─── Paid features: the roadmap as data ───────────────────────────────────────
// Every feature the paid plans promise, with the plan that includes it and how
// far it is. Codes match the planning docs (16 §4–5, 17 §3, 20 §2–6, 18 §4).
// To ship one: build it, set status to 'live'. Screens and landings follow.

import type { IntegrationDef, PaidFeatureDef, PlanKey } from './types'

export const PAID_FEATURE_DEFS: PaidFeatureDef[] = [
  // ── Pro ──
  { id: 'large_files', code: 'P1', family: 'files', plan: 'pro', status: 'soon', server: true, section: 'jobs',
    title: 'Large files on our servers', pitch: 'IFC files up to 1 GB are converted and validated on EU servers, then open in your browser like any other.' },
  { id: 'cloud_projects', code: 'P2', family: 'files', plan: 'pro', status: 'preview', server: true, section: 'projects',
    title: 'Projects saved in the EU', pitch: '20 GB of cloud storage with versions that are never overwritten. Reopen from any computer.' },
  { id: 'client_link', code: 'P3', family: 'sharing', plan: 'pro', status: 'soon', server: true, section: 'projects',
    title: 'A link for your client', pitch: 'Model, report and score in one link. No install, no account. Optional password and expiry, revocable.' },
  { id: 'certificates', code: 'P4', family: 'proof', plan: 'pro', status: 'live', server: true, section: 'certificates',
    title: 'Verifiable certificates with your logo', pitch: 'Unlimited signed certificates your client can check at a public URL.' },
  { id: 'score_history', code: 'P5', family: 'reporting', plan: 'pro', status: 'preview', server: true, section: 'projects',
    title: 'Score history and what got worse', pitch: 'Each new version shows new and fixed issues and the score change, without pressing anything.' },
  { id: 'qualified_timestamp', code: 'P6', family: 'proof', plan: 'pro', status: 'planned', server: true, section: 'certificates',
    title: 'Qualified eIDAS timestamp', pitch: 'A qualified RFC 3161 timestamp on the certificate: legal proof of the delivery date.' },
  { id: 'weekly_digest', code: 'P7', family: 'reporting', plan: 'pro', status: 'planned', server: true,
    title: 'Weekly email summary', pitch: 'Projects, scores and estimated review hours saved, every Monday.' },
  { id: 'server_autofix', code: 'P8', family: 'files', plan: 'pro', status: 'soon', server: true, section: 'jobs',
    title: 'Server auto-fix for big files', pitch: 'Get a corrected IFC and a before/after report for files the browser cannot hold.' },
  { id: 'hosted_api', code: 'P9', family: 'api', plan: 'pro', status: 'preview', server: true, section: 'api',
    title: 'Hosted validation API', pitch: '500 calls a month on Pro, 2,000 on Team, with a visible usage counter.' },
  { id: 'cloud_storage_pickers', code: 'W1', family: 'integrations', plan: 'pro', status: 'soon', server: false, section: 'integrations',
    title: 'Open from SharePoint, Google Drive and Dropbox', pitch: 'Pick files in the provider\'s own picker. Files go straight to your browser, never through us.' },
  { id: 'email_preview', code: 'V4', family: 'sales', plan: 'pro', status: 'live', server: false,
    title: 'Email-ready GIF of the model', pitch: 'A 600 px GIF for Mailchimp, HubSpot or Outlook, linked to the 3D model.' },

  { id: 'email_tracking', code: 'V5', family: 'sales', plan: 'pro', status: 'live', server: false,
    title: 'Shipment tracking for email campaigns', pitch: 'Personal links for Mailchimp, HubSpot or Salesforce and a branded tracking page with offers, products and reviews.' },

  // ── Team ──
  { id: 'quality_gate', code: 'T1', family: 'quality', plan: 'team', status: 'soon', server: true, section: 'quality',
    title: 'Quality gate', pitch: 'Every upload is validated with your company profile. Nothing is published below the minimum score without a reviewer\'s approval.' },
  { id: 'house_standard', code: 'T2', family: 'quality', plan: 'team', status: 'soon', server: true, section: 'quality',
    title: 'House standard', pitch: 'Shared EIR/IDS profiles, ISO 19650 naming and classification applied to every project.' },
  { id: 'cde_connector', code: 'T3', family: 'integrations', plan: 'team', status: 'planned', server: true, section: 'integrations',
    title: 'Connector to your CDE', pitch: 'Watch an ACC or SharePoint folder: each new IFC is validated and the report goes back to the folder.' },
  { id: 'client_portal', code: 'T4', family: 'sharing', plan: 'team', status: 'soon', server: true,
    title: 'Client portal with your logo', pitch: 'Clients and site teams see model, report and history, comment and raise BCF issues. Guests are free.' },
  { id: 'iso_states', code: 'T5', family: 'quality', plan: 'team', status: 'soon', server: true, section: 'quality',
    title: 'ISO 19650 states', pitch: 'WIP → Shared → Published → Archived, with every transition in the audit log.' },
  { id: 'team_issues', code: 'T6', family: 'issues', plan: 'team', status: 'soon', server: true, section: 'issues',
    title: 'Team BCF issues', pitch: 'Assign, prioritise and close issues with the camera saved. Failed rules become assigned issues.' },
  { id: 'roi_report', code: 'T7', family: 'reporting', plan: 'team', status: 'planned', server: true,
    title: 'Monthly ROI report for management', pitch: '"37 deliveries validated, 212 problems stopped, ~60 h saved" — by email, every month.' },
  { id: 'audit_log', code: 'T8', family: 'reporting', plan: 'team', status: 'soon', server: true, section: 'quality',
    title: 'Audit log', pitch: 'Who uploaded, approved, shared and deleted what, and when. Filterable and exportable.' },
  { id: 'public_record', code: 'T10', family: 'sharing', plan: 'team', status: 'planned', server: true,
    title: 'Public delivery record', pitch: 'A verifiable page with your certified deliveries and first-time acceptance rate. Wins tenders.' },
  { id: 'notify_chat', code: 'W4', family: 'integrations', plan: 'team', status: 'soon', server: true, section: 'integrations',
    title: 'Alerts in Teams, Slack and Google Chat', pitch: 'New issue, rejected delivery or a score drop, with a link to the exact view.' },
  { id: 'white_label', code: 'W7', family: 'sharing', plan: 'team', status: 'planned', server: false,
    title: 'Your brand on viewer and report', pitch: 'Your logo on Team; your own domain on Enterprise.' },
  { id: 'webhooks', code: 'I4', family: 'integrations', plan: 'team', status: 'soon', server: true, section: 'integrations',
    title: 'Webhooks for n8n, Zapier, Make and Power Automate', pitch: 'Signed events when a delivery arrives, a validation ends, an issue opens or a score drops.' },

  // ── Reception ──
  { id: 'saved_requirements', code: 'R1', family: 'reception', plan: 'reception', status: 'preview', server: true, section: 'reception',
    title: 'Publishable requirements', pitch: 'IDS, rules, minimum score and naming in one link and QR for tenders and contracts. Creating a link is free; saved, editable sets are paid.' },
  { id: 'delivery_inbox', code: 'R2', family: 'reception', plan: 'reception', status: 'soon', server: true, section: 'reception',
    title: 'Delivery inbox', pitch: 'Receives every delivery, re-validates it on our server and keeps the version and its certificate.' },
  { id: 'accept_reject', code: 'R3', family: 'reception', plan: 'reception', status: 'soon', server: true, section: 'reception',
    title: 'Accept or reject with a reason', pitch: 'The supplier gets BCF with cameras and how-to-fix steps in their language.' },
  { id: 'supplier_record', code: 'R4', family: 'reception', plan: 'reception', status: 'soon', server: true, section: 'reception',
    title: 'Supplier record', pitch: 'Deliveries, first-time acceptance, average score and trend for each supplier.' },
  { id: 'portfolio', code: 'R5', family: 'reception', plan: 'reception', status: 'planned', server: true, section: 'reception',
    title: 'Portfolio dashboard', pitch: 'Every project and supplier on one screen, with alerts when someone slips.' },
  { id: 'sealed_register', code: 'R6', family: 'proof', plan: 'reception', status: 'planned', server: true,
    title: 'Sealed delivery register', pitch: 'Qualified timestamps prove what was delivered and when — for disputes and progress certification.' },
  { id: 'cde_export', code: 'R7', family: 'reception', plan: 'reception', status: 'planned', server: true,
    title: 'Export to your CDE', pitch: 'Accepted files are copied to ACC, SharePoint or Drive.' },
  { id: 'closeout_report', code: 'R8', family: 'reception', plan: 'reception', status: 'planned', server: true,
    title: 'Close-out report', pitch: 'Quality of everything received over the project, ready for facility management.' },

  // ── Sales add-on ──
  { id: 'tracked_links', code: 'V1', family: 'sales', plan: 'pro', status: 'planned', server: true,
    title: 'Tracked model links', pitch: 'One link per recipient: when they opened it, for how long and which floors or units they looked at.' },
  { id: 'crm_sync', code: 'V2', family: 'sales', plan: 'pro', status: 'planned', server: true,
    title: 'HubSpot, Salesforce and Mailchimp', pitch: 'What each contact looked at, on their CRM record and as email segments.' },
  { id: 'element_form', code: 'V3', family: 'sales', plan: 'pro', status: 'planned', server: true,
    title: 'Enquiry form on an element', pitch: '"Ask about this unit" creates the contact or deal in your CRM with the element attached.' },

  // ── Developer ──
  { id: 'sdk_unlimited', code: 'W6', family: 'api', plan: 'free', status: 'live', server: false,
    title: 'Client SDK with no request limits', pitch: 'The SDK runs in the browser, so it has no quota. Free forever.' },
  { id: 'api_credits', code: 'DEV', family: 'api', plan: 'developer', status: 'preview', server: true, section: 'api',
    title: 'Hosted API with credits', pitch: '5,000 credits a month, then €0.01 a credit. Validate, store and compare by API.' },

  { id: 'data_middleware', code: 'MW', family: 'api', plan: 'team', status: 'preview', server: true, section: 'middleware',
    title: 'Data middleware', pitch: 'Your own APIs, cron jobs and ETLs in containers. A paid add-on from €29 a month.' },

  // ── Optional AI (doc 18 §0: never the core, always disclosed, capped) ──
  { id: 'ai_eir_draft', code: 'AI1', family: 'ai', plan: 'team', status: 'planned', server: true, ai: true, section: 'ai',
    title: 'EIR from a PDF (AI draft)', pitch: 'Drafts requirements from a client\'s PDF. Our engine checks them and a person confirms.' },
  { id: 'ai_issue_summary', code: 'AI2', family: 'ai', plan: 'pro', status: 'planned', server: true, ai: true, section: 'ai',
    title: 'Plain-language issue summary (AI draft)', pitch: 'A short summary of a report for a client who does not read IFC.' },
]

export const INTEGRATIONS: IntegrationDef[] = [
  { id: 'wordpress', name: 'WordPress', kind: 'embed', code: 'I1', plan: 'free', status: 'live', does: 'Block and shortcode that embed the viewer.' },
  { id: 'notion', name: 'Notion, Confluence, Miro', kind: 'embed', code: 'I2', plan: 'free', status: 'live', does: 'Paste a viewer link; it embeds.' },
  { id: 'sharepoint', name: 'SharePoint / OneDrive', kind: 'storage', code: 'W1', plan: 'pro', status: 'soon', does: 'Open and save IFC from the Microsoft picker.' },
  { id: 'gdrive', name: 'Google Drive', kind: 'storage', code: 'W1', plan: 'pro', status: 'soon', does: 'Open and save IFC from the Google picker.' },
  { id: 'dropbox', name: 'Dropbox', kind: 'storage', code: 'W1', plan: 'pro', status: 'planned', does: 'Open and save IFC from Dropbox.' },
  { id: 'slack', name: 'Slack', kind: 'notify', code: 'I3', plan: 'team', status: 'soon', does: 'Alerts with a link to the exact view.' },
  { id: 'teams', name: 'Microsoft Teams', kind: 'notify', code: 'I3', plan: 'team', status: 'soon', does: 'Alerts with a link to the exact view.' },
  { id: 'gchat', name: 'Google Chat', kind: 'notify', code: 'I3', plan: 'team', status: 'planned', does: 'Alerts with a link to the exact view.' },
  { id: 'n8n', name: 'n8n, Zapier, Make, Power Automate', kind: 'automation', code: 'I4', plan: 'team', status: 'soon', does: 'Signed webhooks for every event.' },
  { id: 'jira', name: 'Jira, Linear, Asana, Trello', kind: 'tasks', code: 'I5', plan: 'team', status: 'planned', does: 'Each BCF issue becomes a task with a link back.' },
  { id: 'powerbi', name: 'Power BI and Excel', kind: 'bi', code: 'W5', plan: 'team', status: 'planned', does: 'Live connector for properties, validation and issues.' },
  { id: 'hubspot', name: 'HubSpot', kind: 'crm', code: 'I7', plan: 'pro', status: 'planned', does: 'Model views on the contact timeline (Sales add-on).' },
  { id: 'salesforce', name: 'Salesforce / Pardot', kind: 'crm', code: 'I7', plan: 'pro', status: 'planned', does: 'Activity on the contact for scoring (Sales add-on).' },
  { id: 'mailchimp', name: 'Mailchimp', kind: 'crm', code: 'I7', plan: 'pro', status: 'planned', does: 'Tags from what each contact looked at (Sales add-on).' },
]

export function featureById(id: string): PaidFeatureDef | undefined {
  return PAID_FEATURE_DEFS.find((f) => f.id === id)
}

export function featuresForPlan(plan: PlanKey): PaidFeatureDef[] {
  return PAID_FEATURE_DEFS.filter((f) => f.plan === plan)
}

export function featuresInSection(section: string): PaidFeatureDef[] {
  return PAID_FEATURE_DEFS.filter((f) => f.section === section)
}
