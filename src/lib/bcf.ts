// ─── BCF lib ──────────────────────────────────────────────────────────────────
// Provides:
//   importBcf(file)           — spawns bcf-parser.worker, stores topics in bcfStore
//   exportBcfZip(topics)      — builds a .bcfzip ArrayBuffer (BCF 2.1)
//   issuesToBcfTopics(issues) — converts ValidationIssue[] → BcfTopic[]
//   downloadBcfBlob(blob, name)

import { zipSync, strToU8 } from 'fflate'
import { useBcfStore }      from '../stores/bcfStore'
import { appBus }           from './event-bus'
import { toast }            from '../stores/toastStore'
import { parseBcfParserMsg } from './worker-schemas'
import type { BcfTopic, ValidationIssue } from '../types'

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

// ── BCF 2.1 XML builders ─────────────────────────────────────────────────────

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function buildMarkupXml(topic: BcfTopic): string {
  const t = topic
  const vps = t.viewpoints.map((vp, i) => `
  <Viewpoints Guid="${vp.guid}">
    <Viewpoint>viewpoint_${i}.bcfv</Viewpoint>${vp.snapshotBase64 ? `\n    <Snapshot>snapshot_${i}.png</Snapshot>` : ''}
  </Viewpoints>`).join('')

  const comments = t.comments.map((c) => `
  <Comment Guid="${c.guid}">
    <Date>${xmlEscape(c.date || new Date().toISOString())}</Date>
    <Author>${xmlEscape(c.author || '')}</Author>
    <Comment>${xmlEscape(c.text)}</Comment>${c.viewpointGuid ? `\n    <Viewpoint Guid="${c.viewpointGuid}" />` : ''}
  </Comment>`).join('')

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

function buildViewpointXml(vp: BcfTopic['viewpoints'][0], vpGuid: string): string {
  const { cameraPosition: pos, cameraDirection: dir, cameraUp: up, fieldOfView: fov = 60 } = vp
  if (!pos || !dir || !up) return ''
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
    <FieldOfView>${fov}</FieldOfView>
  </PerspectiveCamera>
</VisualizationInfo>`
}

function buildVersionXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Version VersionId="2.1" xsi:noNamespaceSchemaLocation="version.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DetailedVersion>2.1</DetailedVersion>
</Version>`
}

// ── Export ────────────────────────────────────────────────────────────────────

export function exportBcfZip(topics: BcfTopic[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {}

  entries['bcf.version'] = strToU8(buildVersionXml())

  for (const topic of topics) {
    const base = topic.guid

    entries[`${base}/markup.bcf`] = strToU8(buildMarkupXml(topic))

    for (let i = 0; i < topic.viewpoints.length; i++) {
      const vp    = topic.viewpoints[i]
      const vpXml = buildViewpointXml(vp, vp.guid)
      if (vpXml) {
        entries[`${base}/viewpoint_${i}.bcfv`] = strToU8(vpXml)
      }
      if (vp.snapshotBase64) {
        const b64part = vp.snapshotBase64.split(',')[1]
        if (b64part) {
          const bytes = Uint8Array.from(atob(b64part), (c) => c.charCodeAt(0))
          const ext   = vp.snapshotBase64.includes('jpeg') ? 'jpg' : 'png'
          entries[`${base}/snapshot_${i}.${ext}`] = bytes
        }
      }
    }
  }

  return zipSync(entries, { level: 6 })
}

export function downloadBcfBlob(topics: BcfTopic[], fileName = 'issues.bcfzip'): void {
  const bytes = exportBcfZip(topics)
  const blob  = new Blob([bytes], { type: 'application/octet-stream' })
  const url   = URL.createObjectURL(blob)
  const a     = document.createElement('a')
  a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  appBus.emit('bcf:exported', { topicCount: topics.length })
}
