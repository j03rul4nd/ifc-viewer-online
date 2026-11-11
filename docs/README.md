# Documentation index

Every doc in `docs/`, grouped by area. **Reference** docs describe how the code works today and are kept up to date. **Plan**, **research** and **log** docs record how a feature was designed or investigated; they are useful history but can be ahead of or behind the code. When they disagree, the code and the reference docs win.

New here? Read [`../readme.md`](../readme.md), then [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`../DECISIONS.md`](../DECISIONS.md).

Some older notes are written in Spanish.

## Getting set up

| Doc | Kind | What it covers |
|---|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Reference | Vercel deploy, build flags, headers, self-hosting |
| [REFERENCE_IFC.md](REFERENCE_IFC.md) | Reference | The reference IFC models used for demos and tests |
| [DEMOS.md](DEMOS.md) | Reference | Demo scenes catalogue: what each shows, how to reproduce and embed it |

## Loading, viewer and UI

| Doc | Kind | What it covers |
|---|---|---|
| [MODEL_LOADING.md](MODEL_LOADING.md) | Reference | Load queue, scheduler, convert pool, OPFS cache, cancel and retry |
| [ADD_DATA.md](ADD_DATA.md) | Reference | The *Add data* hub and how every non-IFC drop is routed |
| [MESH_IMPORT.md](MESH_IMPORT.md) | Reference | Importing glTF/OBJ/other 3D meshes |
| [FAR_COORDINATES.md](FAR_COORDINATES.md) | Reference | Models with UTM coordinates in the geometry, and federation through the map conversion |
| [SCENE_TREE_PLAN.md](SCENE_TREE_PLAN.md) | Plan | Scene tree: groups, point clouds, transforms and camera |
| [PANEL_RAIL.md](PANEL_RAIL.md) · [RIGHT_EDGE.md](RIGHT_EDGE.md) · [WINDOW_DESIGN.md](WINDOW_DESIGN.md) · [MODAL_DESIGN.md](MODAL_DESIGN.md) | Reference | UI rules for panels, the right edge, floating windows and modals |
| [MOBILE_TOOLS.md](MOBILE_TOOLS.md) | Reference | How each tool works on a phone |
| [ROUTING.md](ROUTING.md) | Reference | Routes in Measure: inside buildings and on OSM streets |
| [PRESENTATION_DIRECTOR.md](PRESENTATION_DIRECTOR.md) | Reference | Presentation director and recorded camera moves |
| [COVER_STUDIO_RESEARCH.md](COVER_STUDIO_RESEARCH.md) | Research | Cover studio templates and roadmap |

## Validation, IDS and delivery

| Doc | Kind | What it covers |
|---|---|---|
| [IDS_IMPLEMENTATION_PLAN.md](IDS_IMPLEMENTATION_PLAN.md) | Plan (shipped) | buildingSMART IDS 1.0 engine and worker |
| [VERSION_COMPARE.md](VERSION_COMPARE.md) | Reference | Comparing sets of IFCs between deliveries |
| [CONFORMANCE_DOMAIN.md](CONFORMANCE_DOMAIN.md) · [CONFORMANCE_PATTERNS.md](CONFORMANCE_PATTERNS.md) | Reference | Domain model and engineering patterns for signed conformance reports |
| [CDE_VISION.md](CDE_VISION.md) · [CDE_ARCHITECTURE.md](CDE_ARCHITECTURE.md) · [CDE_ROADMAP.md](CDE_ROADMAP.md) | Plan | The delivery-conformance platform, phases F0–F6 |

## Embedding and integrations

| Doc | Kind | What it covers |
|---|---|---|
| [EMBED_URL_PARAMS.md](EMBED_URL_PARAMS.md) | Reference | Every URL parameter and `postMessage` event |
| [IFC_VIEWER_SDK.md](IFC_VIEWER_SDK.md) | Reference | The JS SDK API |
| [INTEGRATIONS.md](INTEGRATIONS.md) | Reference | Using the viewer from CDEs, dashboards and other tools |
| [INVITE_SYSTEM.md](INVITE_SYSTEM.md) | Reference | Personal invitation links and cookieless attribution |

## Maps and city context

| Doc | Kind | What it covers |
|---|---|---|
| [GIS_MAP_MODE.md](GIS_MAP_MODE.md) | Reference | Map mode: user and maintainer guide |
| [VERTICAL_INFRASTRUCTURE.md](VERTICAL_INFRASTRUCTURE.md) | Reference | Bridges, tunnels, metro and who owns each height |
| [CITY_DATA_SOURCES.md](CITY_DATA_SOURCES.md) | Reference | Which city data a browser can actually read |
| [GIS_MAP_INTEGRATION_PLAN.md](GIS_MAP_INTEGRATION_PLAN.md) · [TERRAIN_3D_IMPROVEMENT_PLAN.md](TERRAIN_3D_IMPROVEMENT_PLAN.md) | Plan | Original map and terrain plans |
| [GIS_DATA_SOURCES_RESEARCH.md](GIS_DATA_SOURCES_RESEARCH.md) | Research | Where the 3D city data comes from |
| [GIS_RENDER_QUALITY_FINDINGS.md](GIS_RENDER_QUALITY_FINDINGS.md) · [GIS_SCENE_CREDIBILITY_AUDIT.md](GIS_SCENE_CREDIBILITY_AUDIT.md) · [URBAN_3D_INFRASTRUCTURE_FINDINGS.md](URBAN_3D_INFRASTRUCTURE_FINDINGS.md) | Log | Render-quality audits and findings |
| [BARCELONA_RENDERING.md](BARCELONA_RENDERING.md) · [SHANGHAI_BRIDGE_RENDERING.md](SHANGHAI_BRIDGE_RENDERING.md) · [SHANGHAI_CITY_FIDELITY.md](SHANGHAI_CITY_FIDELITY.md) · [SHANGHAI_PARK_RENDERING.md](SHANGHAI_PARK_RENDERING.md) · [SHANGHAI_RAIL_RENDERING.md](SHANGHAI_RAIL_RENDERING.md) · [SHANGHAI_URBAN_FABRIC.md](SHANGHAI_URBAN_FABRIC.md) | Log | City-specific rendering fixes |
| [HOTEL_VELA_DRAWING_RECONSTRUCTION.md](HOTEL_VELA_DRAWING_RECONSTRUCTION.md) · [HOTEL_VELA_PODIUM_IMAGE_ANALYSIS.md](HOTEL_VELA_PODIUM_IMAGE_ANALYSIS.md) · [ORIENTAL_PEARL_RECONSTRUCTION.md](ORIENTAL_PEARL_RECONSTRUCTION.md) · [SHANGHAI_TOWER_RECONSTRUCTION.md](SHANGHAI_TOWER_RECONSTRUCTION.md) · [SWFC_RECONSTRUCTION.md](SWFC_RECONSTRUCTION.md) | Log | How the landmark reference IFCs were built |

## Reality capture and analyses

| Doc | Kind | What it covers |
|---|---|---|
| [POINT_CLOUD.md](POINT_CLOUD.md) | Reference | Point clouds: formats, alignment, LOD, analysis tab |
| [REALTIME_LIDAR_VIDEO.md](REALTIME_LIDAR_VIDEO.md) | Reference | Temporal LiDAR replay |
| [VIDEO_3D.md](VIDEO_3D.md) | Reference | Video, camera and screen sources in the 3D scene |
| [SOLAR_ANALYSIS.md](SOLAR_ANALYSIS.md) | Reference | Sun, shadow and passive impact with weather files |
| [FLOOD_SIMULATION.md](FLOOD_SIMULATION.md) | Reference | 2D rain-flood simulation on the GPU |
| [SLOPE_HAZARD.md](SLOPE_HAZARD.md) | Reference | Rain-triggered slope hazard |
| [POINT_CLOUD_PLAN.md](POINT_CLOUD_PLAN.md) · [SUN_MOON_STUDY_PLAN.md](SUN_MOON_STUDY_PLAN.md) | Plan | Original design notes |

## Digital twins

| Doc | Kind | What it covers |
|---|---|---|
| [DIGITAL_TWIN_PLATFORM.md](DIGITAL_TWIN_PLATFORM.md) | Reference | Overview: models on a map, live data, devices, scenes |
| [SCENE_FORMAT.md](SCENE_FORMAT.md) | Reference | The `ifc-viewer-scene` v1 JSON format |
| [TWIN_DATA_AUDIT.md](TWIN_DATA_AUDIT.md) · [TWIN_VALIDATION_REPORT.md](TWIN_VALIDATION_REPORT.md) | Log | Audit and validation of the twin programme |
| [TWIN_PREMIUM_ROADMAP.md](TWIN_PREMIUM_ROADMAP.md) | Plan | What would need a server (not built) |

## Content, SEO and blog

| Doc | Kind | What it covers |
|---|---|---|
| [BLOG_COMPONENTS.md](BLOG_COMPONENTS.md) · [BLOG_I18N.md](BLOG_I18N.md) · [BLOG_LANDING.md](BLOG_LANDING.md) | Reference | Blog blocks, translation pipeline and blog landing |
| [SEO_PRERENDER_PLAN.md](SEO_PRERENDER_PLAN.md) · [SHANGHAI_EDITORIAL_SEO.md](SHANGHAI_EDITORIAL_SEO.md) | Plan | Prerender plan (not built) and an editorial series |
| [marketing/](marketing/) | Plan | Campaign notes |

## Privacy and legal

| Doc | Kind | What it covers |
|---|---|---|
| [legal/GDPR_COMPLIANCE.md](legal/GDPR_COMPLIANCE.md) · [legal/LIA_ANALYTICS.md](legal/LIA_ANALYTICS.md) · [legal/STRATEGY_B_CONSENT_CONTINGENCY.md](legal/STRATEGY_B_CONSENT_CONTINGENCY.md) | Reference | GDPR measures, legitimate-interest assessment for analytics |
| [HANDOFF_COOKIE_CONSENT.md](HANDOFF_COOKIE_CONSENT.md) · [HANDOFF_PRIVACY_TERMS.md](HANDOFF_PRIVACY_TERMS.md) | Log | Hand-off notes for the consent banner and legal pages |
