# The MCP server as published on npm, for directories that run it in a
# container to check it (Glama). Speaks MCP over stdio; no ports.
FROM node:22-slim
RUN npm install -g ifc-viewer-mcp@1.0.0 && npm cache clean --force
ENTRYPOINT ["ifc-viewer-mcp"]
