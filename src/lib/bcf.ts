// ─── BCF lib ──────────────────────────────────────────────────────────────────
// Provides:
//   importBcf(file)                 — spawns bcf-parser.worker, stores topics in bcfStore
//   exportBcfZip(topics, version)   — builds a .bcfzip ArrayBuffer (BCF 2.1 or 3.0)
//   issuesToBcfTopics(issues)       — converts ValidationIssue[] → BcfTopic[]
//   downloadBcfBlob(topics, name, version)

import { zipSync, strToU8 } from 'fflate'
import { useBcfStore }      from '../stores/bcfStore'
import { appBus }           from './event-bus'
import { toast }            from '../stores/toastStore'
import { parseBcfParserMsg } from './worker-schemas'
import type { BcfTopic, BcfComment, BcfExportVersion, ValidationIssue } from '../types'

// ── Import ────────────────────────────────────────────────────────────────────

let _bcfWorker: Worker | null = null

function getBcfWorker(): Worker {
  if (!_bcfWorker) {
    _bcfWorker = new Worker(
      new URL('../workers/bcf-parser.worker.ts', import.meta.url),
      { type: 'module' },
    )
  }
  return _bcfWorker
}

export async function importBcf(file: File): Promise<void> {
  const store = useBcfStore.getState()
  store.setIsParsing(true)
  store.setParseError(null)

  const buffer = await file.arrayBuffer()
  const id     = crypto.randomUUID()
  const worker = getBcfWorker()

  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent) => {
      const parsed = parseBcfParserMsg(e.data)
      if (!parsed.ok) return  // ignore unrelated messages

      const msg = parsed.data
      if (msg.id !== id) return
      worker.removeEventListener('message', handler)

      if (msg.type === 'error') {
        store.setParseError(msg.message)
        toast(`Error al importar BCF: ${msg.message}`, 'warning')
        reject(new Error(msg.message))
        return
      }

      store.setTopics(msg.topics)
      store.setIsParsing(false)
      useBcfStore.setState({ importedVersion: msg.version })
      appBus.emit('bcf:imported', { topicCount: msg.topics.length })
      toast(`BCF ${msg.version} importado — ${msg.topics.length} tema${msg.topics.length !== 1 ? 's' : ''}`, 'success')
      resolve()
    }

    worker.addEventListener('message', handler)
    worker.postMessage({ type: 'parse', id, buffer }, [buffer])
  })
}

// ── Convert validation issues → BCF topics ───────────────────────────────────

export function issuesToBcfTopics(
  issues: ValidationIssue[],
  snapshotBase64?: string,
): BcfTopic[] {
  return issues.map((issue) => {
    const vpGuid = crypto.randomUUID()
    const vp = snapshotBase64 ? [{ guid: vpGuid, snapshotBase64 }] : []

    return {
      guid:            issue.id,
      title:           `[${issue.ruleId}] ${issue.elementName}`,
      description:     issue.message,
      status:          'Open',
      topicType:       issue.severity === 'error' ? 'Error' : issue.severity === 'warning' ? 'Warning' : 'Info',
      priority:        issue.severity === 'error' ? 'High' : 'Normal',
      creationDate:    new Date().toISOString(),
      creationAuthor:  'IFC Viewer — Validator V2',
      viewpoints:      vp,
      comments:        [],
      source:          'generated',
      validationIssueId: issue.id,
    } satisfies BcfTopic
  })
}

// ── XML builders (BCF 2.1 + 3.0) ─────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** File name of a viewpoint's snapshot, or null when it has none. Shared by the
 *  markup builders (the <Snapshot> reference) and the zip writer (the entry) so
 *  the markup never references a file the zip didn't write. */
function snapshotFileName(vp: BcfTopic['viewpoints'][number], i: number): string | null {
  if (!vp.snapshotBase64) return null
  const ext = vp.snapshotBase64.includes('jpeg') ? 'jpg' : 'png'
  return `snapshot_${i}.${ext}`
}

/** A single <Comment> block. Element names are identical across 2.1 and 3.0;
 *  only the nesting differs (sibling of Topic in 2.1, inside <Comments> in 3.0). */
function commentXml(c: BcfComment, indent: string): string {
  return `${indent}<Comment Guid="${c.guid}">
${indent}  <Date>${xmlEscape(c.date || new Date().toISOString())}</Date>
${indent}  <Author>${xmlEscape(c.author || '')}</Author>
${indent}  <Comment>${xmlEscape(c.text)}</Comment>${c.viewpointGuid ? `\n${indent}  <Viewpoint Guid="${c.viewpointGuid}" />` : ''}
${indent}</Comment>`
}

// ── BCF 2.1 markup: Comments + Viewpoints are siblings of <Topic> ──────────────
function buildMarkup21(topic: BcfTopic): string {
  const t = topic
  const vps = t.viewpoints.map((vp, i) => {
    const snap = snapshotFileName(vp, i)
    return `
  <Viewpoints Guid="${vp.guid}">
    <Viewpoint>viewpoint_${i}.bcfv</Viewpoint>${snap ? `\n    <Snapshot>${snap}</Snapshot>` : ''}
  </Viewpoints>`
  }).join('')

  const comments = t.comments.map((c) => `\n${commentXml(c, '  ')}`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="markup.xsd">
  <Topic Guid="${t.guid}" TopicType="${xmlEscape(t.topicType || 'Issue')}" TopicStatus="${xmlEscape(t.status || 'Open')}">
    <Title>${xmlEscape(t.title)}</Title>
    ${t.description ? `<Description>${xmlEscape(t.description)}</Description>` : ''}
    ${t.creationDate ? `<CreationDate>${t.creationDate}</CreationDate>` : ''}
    ${t.creationAuthor ? `<CreationAuthor>${xmlEscape(t.creationAuthor)}</CreationAuthor>` : ''}
    ${t.priority ? `<Priority>${xmlEscape(t.priority)}</Priority>` : ''}
    ${t.assignedTo ? `<AssignedTo>${xmlEscape(t.assignedTo)}</AssignedTo>` : ''}
    ${t.labels && t.labels.length > 0 ? `<Labels>${t.labels.map((l) => `<Label>${xmlEscape(l)}</Label>`).join('')}</Labels>` : ''}
  </Topic>${comments}${vps}
</Markup>`
}

// ── BCF 3.0 markup: Comments + Viewpoints are nested INSIDE <Topic>; the
//    per-viewpoint element is <ViewPoint> (capital P) inside a <Viewpoints> list ─
function buildMarkup30(topic: BcfTopic): string {
  const t = topic

  const commentsBlock = t.comments.length > 0
    ? `\n    <Comments>\n${t.comments.map((c) => commentXml(c, '      ')).join('\n')}\n    </Comments>`
    : ''

  const viewpointsBlock = t.viewpoints.length > 0
    ? `\n    <Viewpoints>\n${t.viewpoints.map((vp, i) => {
        const snap = snapshotFileName(vp, i)
        return `      <ViewPoint Guid="${vp.guid}">
        <Viewpoint>viewpoint_${i}.bcfv</Viewpoint>${snap ? `\n        <Snapshot>${snap}</Snapshot>` : ''}
        <Index>${i}</Index>
      </ViewPoint>`
      }).join('\n')}\n    </Viewpoints>`
    : ''

  // Schema order: Title, Priority, Labels, CreationDate, CreationAuthor, DueDate,
  // AssignedTo, Description, Comments, Viewpoints. CreationDate is required.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Markup xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="markup.xsd">
  <Topic Guid="${t.guid}" TopicType="${xmlEscape(t.topicType || 'Issue')}" TopicStatus="${xmlEscape(t.status || 'Open')}">
    <Title>${xmlEscape(t.title)}</Title>${t.priority ? `\n    <Priority>${xmlEscape(t.priority)}</Priority>` : ''}${t.labels && t.labels.length > 0 ? `\n    <Labels>${t.labels.map((l) => `<Label>${xmlEscape(l)}</Label>`).join('')}</Labels>` : ''}
    <CreationDate>${t.creationDate || new Date().toISOString()}</CreationDate>${t.creationAuthor ? `\n    <CreationAuthor>${xmlEscape(t.creationAuthor)}</CreationAuthor>` : ''}${t.dueDate ? `\n    <DueDate>${t.dueDate}</DueDate>` : ''}${t.assignedTo ? `\n    <AssignedTo>${xmlEscape(t.assignedTo)}</AssignedTo>` : ''}${t.description ? `\n    <Description>${xmlEscape(t.description)}</Description>` : ''}${commentsBlock}${viewpointsBlock}
  </Topic>
</Markup>`
}

function buildMarkupXml(topic: BcfTopic, version: BcfExportVersion): string {
  return version === '3.0' ? buildMarkup30(topic) : buildMarkup21(topic)
}

function buildViewpointXml(vp: BcfTopic['viewpoints'][number], vpGuid: string, version: BcfExportVersion): string {
  const { cameraPosition: pos, cameraDirection: dir, cameraUp: up, fieldOfView: fov = 60 } = vp
  if (!pos || !dir || !up) return ''
  // AspectRatio is required by the 3.0 PerspectiveCamera schema.
  const aspect = version === '3.0' ? `\n    <AspectRatio>${vp.aspectRatio ?? 1}</AspectRatio>` : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<VisualizationInfo Guid="${vpGuid}">
  ${vp.componentGuids && vp.componentGuids.length > 0 ? `
  <Components>
    <Selection>
      ${vp.componentGuids.map((g) => `<Component IfcGuid="${g}" />`).join('\n      ')}
    </Selection>
  </Components>` : ''}
  <PerspectiveCamera>
    <CameraViewPoint><X>${pos.x}</X><Y>${pos.y}</Y><Z>${pos.z}</Z></CameraViewPoint>
    <CameraDirection><X>${dir.x}</X><Y>${dir.y}</Y><Z>${dir.z}</Z></CameraDirection>
    <CameraUpVector><X>${up.x}</X><Y>${up.y}</Y><Z>${up.z}</Z></CameraUpVector>
    <FieldOfView>${fov}</FieldOfView>${aspect}
  </PerspectiveCamera>
</VisualizationInfo>`
}

function buildVersionXml(version: BcfExportVersion): string {
  if (version === '3.0') {
    // 3.0 dropped the <DetailedVersion> child.
    return `<?xml version="1.0" encoding="UTF-8"?>
<Version xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="version.xsd" VersionId="3.0" />`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DetailedVersion>2.1</DetailedVersion>
</Version>`
}

// ── Export ────────────────────────────────────────────────────────────────────

/** The text (XML) entries of a .bcfzip, keyed by path — `bcf.version`, each
 *  topic's `markup.bcf`, and its `viewpoint_N.bcfv` files. Pure and snapshot-free
 *  so the schema shape can be unit-tested without unzipping. Binary snapshots are
 *  added on top by {@link exportBcfZip}. */
export function buildBcfTextEntries(
  topics: BcfTopic[],
  version: BcfExportVersion = '2.1',
): Record<string, string> {
  const entries: Record<string, string> = { 'bcf.version': buildVersionXml(version) }

  for (const topic of topics) {
    const base = topic.guid
    entries[`${base}/markup.bcf`] = buildMarkupXml(topic, version)

    for (let i = 0; i < topic.viewpoints.length; i++) {
      const vp    = topic.viewpoints[i]
      const vpXml = buildViewpointXml(vp, vp.guid, version)
      if (vpXml) entries[`${base}/viewpoint_${i}.bcfv`] = vpXml
    }
  }

  return entries
}

export function exportBcfZip(topics: BcfTopic[], version: BcfExportVersion = '2.1'): Uint8Array {
  const entries: Record<string, Uint8Array> = {}

  for (const [path, xml] of Object.entries(buildBcfTextEntries(topics, version))) {
    entries[path] = strToU8(xml)
  }

  // Binary snapshots (data URLs → bytes). Kept out of buildBcfTextEntries so the
  // file name there always matches the entry written here (via snapshotFileName).
  for (const topic of topics) {
    const base = topic.guid
    for (let i = 0; i < topic.viewpoints.length; i++) {
      const vp   = topic.viewpoints[i]
      const snap = snapshotFileName(vp, i)
      if (snap && vp.snapshotBase64) {
        const b64part = vp.snapshotBase64.split(',')[1]
        if (b64part) {
          entries[`${base}/${snap}`] = Uint8Array.from(atob(b64part), (c) => c.charCodeAt(0))
        }
      }
    }
  }

  return zipSync(entries, { level: 6 })
}

export function downloadBcfBlob(topics: BcfTopic[], fileName = 'issues.bcfzip', version: BcfExportVersion = '2.1'): void {
  const bytes = exportBcfZip(topics, version)
  const blob  = new Blob([bytes], { type: 'application/octet-stream' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  appBus.emit('bcf:exported', { topicCount: topics.length })
}
