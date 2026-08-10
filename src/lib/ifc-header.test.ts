// ─── IFC header tests ─────────────────────────────────────────────────────────
// The parsing here is the risky part. A STEP header looks like it yields to a
// regular expression right up until a filename contains an apostrophe or a
// comma — both of which are ordinary in the real world and both of which corrupt
// the file if handled naively. These fixtures are built to break that.

import { describe, it, expect } from 'vitest'
import {
  splitStepArgs, parseStepString, escapeStepString, readIfcHeader, stampIfcHeader,
} from './ifc-header'

const enc = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}
const dec = (b: Uint8Array): string => {
  let s = ''
  for (const byte of b) s += String.fromCharCode(byte)
  return s
}

const FILE = (fileName: string) => `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition[DesignTransferView]'),'2;1');
FILE_NAME('${fileName}','2026-08-09T00:00:00','Ada Lovelace','ACME','IfcOpenShell 0.8.6','Bonsai (Blender 4.5)','none');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;
#1=IFCPROJECT('0x1',#2,'Project',$,$,$,$,(#3),#4);
ENDSEC;
END-ISO-10303-21;
`

// ── Scanning ──────────────────────────────────────────────────────────────────

describe('splitStepArgs', () => {
  it('splits at top-level commas', () => {
    expect(splitStepArgs("'a','b','c'")).toEqual(["'a'", "'b'", "'c'"])
  })

  it('does not split on a comma inside a string', () => {
    // `plan, rev C.ifc` is an ordinary filename and a naive split destroys it.
    expect(splitStepArgs("'plan, rev C.ifc','2024'")).toEqual(["'plan, rev C.ifc'", "'2024'"])
  })

  it('does not split inside a nested list', () => {
    expect(splitStepArgs("'a',('x','y'),'b'")).toEqual(["'a'", "('x','y')", "'b'"])
  })

  it('handles an escaped quote, which is two quotes and not a terminator', () => {
    // O'Brien. The scanner that gets this wrong thinks the string ended and
    // starts treating the rest of the filename as STEP syntax.
    expect(splitStepArgs("'O''Brien','next'")).toEqual(["'O''Brien'", "'next'"])
  })

  it('survives a parenthesis inside a string', () => {
    expect(splitStepArgs("'plan (rev C).ifc','x'")).toEqual(["'plan (rev C).ifc'", "'x'"])
  })
})

describe('parseStepString', () => {
  it('unwraps and unescapes', () => {
    expect(parseStepString("'O''Brien'")).toBe("O'Brien")
  })
  it('treats $ and * as absent', () => {
    expect(parseStepString('$')).toBe('')
    expect(parseStepString('*')).toBe('')
  })
})

describe('escapeStepString', () => {
  it('doubles quotes', () => {
    expect(escapeStepString("O'Brien")).toBe("'O''Brien'")
  })

  it('encodes non-ASCII as \\X2\\, which is what the spec prescribes', () => {
    // Written raw it would survive this codebase's latin1 round trip but be read
    // back differently by any parser that follows the spec.
    expect(escapeStepString('Müller')).toBe("'M\\X2\\00FC\\X0\\ller'")
  })

  it('keeps a run of non-ASCII in one escape sequence', () => {
    expect(escapeStepString('áé')).toBe("'\\X2\\00E100E9\\X0\\'")
  })

  it('round-trips through the parser', () => {
    for (const s of ["O'Brien, plan (rev C)", 'Müller & Co', 'plain']) {
      expect(parseStepString(escapeStepString(s))).toBe(s)
    }
  })
})

// ── Reading ───────────────────────────────────────────────────────────────────

describe('readIfcHeader', () => {
  it('reads every FILE_NAME field positionally', () => {
    const h = readIfcHeader(enc(FILE('model.ifc')))!
    expect(h.schema).toEqual(['IFC4'])
    expect(h.description).toEqual(['ViewDefinition[DesignTransferView]'])
    expect(h.name).toMatchObject({
      name: 'model.ifc',
      timestamp: '2026-08-09T00:00:00',
      preprocessorVersion: 'IfcOpenShell 0.8.6',
      originatingSystem: 'Bonsai (Blender 4.5)',
      authorization: 'none',
    })
  })

  it('reads a filename that would break a regex', () => {
    const h = readIfcHeader(enc(FILE("O''Brien, plan (rev C).ifc")))!
    expect(h.name!.name).toBe("O'Brien, plan (rev C).ifc")
  })

  it('returns null for something that is not a STEP file', () => {
    expect(readIfcHeader(enc('not an ifc at all'))).toBeNull()
  })
})

// ── Stamping ──────────────────────────────────────────────────────────────────

describe('stampIfcHeader', () => {
  it('writes the fields it was given and leaves the rest alone', () => {
    const out = stampIfcHeader(enc(FILE('model.ifc')), {
      timestamp: '2030-01-02T03:04:05Z',
      preprocessorVersion: 'IFC Viewer Online 1.0',
    })
    const h = readIfcHeader(out)!
    expect(h.name!.timestamp).toBe('2030-01-02T03:04:05Z')
    expect(h.name!.preprocessorVersion).toBe('IFC Viewer Online 1.0')
    // The authoring tool is NOT overwritten: the model still came from there,
    // and claiming otherwise is a different lie from the one being fixed.
    expect(h.name!.originatingSystem).toBe('Bonsai (Blender 4.5)')
    expect(h.name!.name).toBe('model.ifc')
    expect(h.schema).toEqual(['IFC4'])
  })

  it('leaves the DATA section byte for byte identical', () => {
    // The whole safety argument. Only the header is re-encoded; a single shifted
    // byte after DATA; is a corrupt model.
    const original = enc(FILE('model.ifc'))
    const out = stampIfcHeader(original, { timestamp: '2030-01-02T03:04:05Z' })

    const tail = (b: Uint8Array): string => dec(b).slice(dec(b).indexOf('DATA;'))
    expect(tail(out)).toBe(tail(original))
  })

  it('preserves a hostile filename through the rewrite', () => {
    const out = stampIfcHeader(enc(FILE("O''Brien, plan (rev C).ifc")), {
      timestamp: '2030-01-01T00:00:00Z',
    })
    expect(readIfcHeader(out)!.name!.name).toBe("O'Brien, plan (rev C).ifc")
  })

  it('writes author and organization as STEP lists', () => {
    const out = stampIfcHeader(enc(FILE('m.ifc')), {
      author: ['Ada Lovelace', "O'Brien"],
      organization: ['ACME, Ltd'],
    })
    const h = readIfcHeader(out)!
    expect(h.name!.author).toEqual(['Ada Lovelace', "O'Brien"])
    expect(h.name!.organization).toEqual(['ACME, Ltd'])
  })

  it('defaults the timestamp to now rather than leaving the original', () => {
    // The point of the exercise: an exported file must not claim it was written
    // when the authoring tool wrote it.
    const before = Date.now()
    const out = stampIfcHeader(enc(FILE('m.ifc')), {})
    const stamped = Date.parse(readIfcHeader(out)!.name!.timestamp)
    expect(stamped).toBeGreaterThanOrEqual(before - 1000)
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('returns the bytes untouched when there is no header to rewrite', () => {
    // A file whose header we cannot parse is a file whose header we must not
    // corrupt. Returning the input is the only safe answer.
    const junk = enc('DATA;\n#1=IFCPROJECT();\n')
    expect(stampIfcHeader(junk, { timestamp: 'x' })).toBe(junk)
    const noData = enc('ISO-10303-21;\nHEADER;\nFILE_NAME(...);\n')
    expect(stampIfcHeader(noData, { timestamp: 'x' })).toBe(noData)
  })

  it('leaves a header with an unterminated FILE_NAME alone', () => {
    const broken = enc('ISO-10303-21;\nHEADER;\nFILE_NAME(\'a\',\nDATA;\n#1=X();\n')
    expect(stampIfcHeader(broken, { timestamp: 'x' })).toBe(broken)
  })

  it('does not corrupt high bytes elsewhere in the header', () => {
    // Exporters put accented characters in headers constantly, in whatever
    // encoding they felt like. latin1 in/out is a byte identity, so they come
    // back exactly as they went in.
    const withHighBytes = FILE('m.ifc').replace('ACME', 'AÇME')
    const out = stampIfcHeader(enc(withHighBytes), { timestamp: '2030-01-01T00:00:00Z' })
    expect(readIfcHeader(out)!.name!.organization).toEqual(['AÇME'])
  })
})
