# IFC Viewer Online — MCP server

[![npm](https://img.shields.io/npm/v/ifc-viewer-mcp?color=e11d48)](https://www.npmjs.com/package/ifc-viewer-mcp)
[![MCP](https://img.shields.io/badge/MCP-stdio-111827)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-3b82f6)](../LICENSE)

An [MCP](https://modelcontextprotocol.io) server that gives Claude and other AI assistants an **IFC/BIM toolkit with a 3D viewer**:
validate IFC files, check them against IDS, get a Health Score, and open models, technical drawings,
3D sketches and live digital twins in the free browser viewer at [www.ifcvieweronline.eu](https://www.ifcvieweronline.eu/).

Validation, IDS and DXF reading run **on your machine**: files are not uploaded anywhere. Free, no account, no API key.

Guide with examples: <https://www.ifcvieweronline.eu/blog/ifc-mcp-server-claude-bim-3d-viewer/>

## Install

Needs Node.js 20 or later.

**Claude Code**

```bash
claude mcp add ifc-viewer -- npx -y ifc-viewer-mcp
```

**Claude Desktop** — Settings → Developer → Edit config, then add:

```json
{
  "mcpServers": {
    "ifc-viewer": { "command": "npx", "args": ["-y", "ifc-viewer-mcp"] }
  }
}
```

**Cursor, VS Code, Windsurf, Cline and other clients** take the same `command` + `args`.

## Tools

| Tool | What it does | Runs |
|---|---|---|
| `validate_ifc` | Health Score (0–100), issue counts, costliest rules, issues with fix guides | Local |
| `list_validation_rules` | Every rule with category, severity, standard | Local |
| `check_ids` | IFC against an IDS 1.0 file: pass/fail per specification, failing elements | Local |
| `open_in_3d_viewer` | Link + `<iframe>` to view public IFC files in 3D (federated, on the map, isolated class, point clouds) | Browser |
| `open_drawings` | Model with a floor plan cut beside it; drop DXF/PDF, calibrate, compare, export | Browser |
| `read_dxf` | Layers, entity counts, extents, units and texts of a DXF | Local |
| `open_3d_sketch` | 3D sketch studio for pen, touch and foldables | Browser |
| `list_digital_twins` | Live city twins (Barcelona, Helsinki, Tokyo) + twin builder | Browser |
| `read_fiware_entities` | NGSI-LD / NGSIv2 entities from a FIWARE broker as flat records | Local → broker |
| `search_port_library` | Port de Barcelona IFC object library (CC BY 4.0) | Local |

## Example prompts

- "Validate `C:/projects/tower/ARC.ifc` and tell me the three things that cost the most points."
- "Check `model.ifc` against `requirements.ids` and list the failing walls."
- "Open https://example.com/site.ifc on the map, seen from the top, and give me an embed for our wiki."
- "What layers are in `ground-floor.dxf`, and what rooms are labelled?"
- "Find a crane in the Port de Barcelona library and open it in 3D."
- "Show me a live digital twin of Barcelona."

## Develop

```bash
cd mcp
npm install
npm run build        # bundles the viewer's own validator and IDS engine into dist/index.js
node dist/index.js   # stdio
```

Tests run with the app's suite: `npx vitest run mcp/` from the repo root.
