#!/usr/bin/env node
// ─── ifc-viewer-mcp ───────────────────────────────────────────────────────────
// MCP server over stdio for IFC Viewer Online. Validation, IDS and DXF run on
// this machine; the 3D viewer, drawings, sketch and twins open in the browser.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'

declare const __VERSION__: string

const server = new McpServer(
  { name: 'ifc-viewer-mcp', title: 'IFC Viewer Online', version: __VERSION__ },
  { instructions: 'Tools for IFC/BIM models. validate_ifc, check_ids and read_dxf read files on this machine (local path or URL). open_in_3d_viewer, open_drawings, open_3d_sketch and list_digital_twins return links to the free browser viewer at www.ifcvieweronline.eu: give the link to the user. The viewer can only open files at a public URL.' },
)
registerTools(server)
await server.connect(new StdioServerTransport())
