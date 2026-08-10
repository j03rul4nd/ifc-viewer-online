// ─── mesh-decoders ────────────────────────────────────────────────────────────
// Draco geometry and KTX2 texture decoding for glTF imports.
//
// ── Why this is not optional
// Draco is THE compression people use to put a glTF on the web — it is what
// every "optimise for web" export button reaches for, and Blender, Polycam and
// most pipelines offer it. Without a decoder those files do not arrive degraded,
// they fail to parse outright, and the user has no way to tell a corrupt file
// from an unsupported one.
//
// ── Why the decoders are shared and never disposed per import
// DRACOLoader spins up a worker pool the first time it decodes anything.
// Creating one per import would start a fresh pool per file and leak it, because
// nothing in the import path is a natural owner of that lifetime. One module
// instance, reused, is the shape that matches how they are actually used —
// the same reasoning as `loadLazPerf` in the point cloud reader.
//
// ── Why the files are served rather than bundled
// Both decoders are a JS wrapper plus a sibling .wasm that the wrapper fetches
// by relative path. Bundling would break that relationship, so they are copied
// out of `node_modules/three` at build time and served from `/decoders/` — see
// the `copyThreeDecoders` plugin in vite.config.ts. That also keeps them pinned
// to the three version actually installed, rather than to a CDN that will one
// day serve a mismatched build.

import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { createLogger } from '../logger'

const log = createLogger('MeshDecoders')

export const DRACO_PATH = '/decoders/draco/'
export const BASIS_PATH = '/decoders/basis/'

let draco: DRACOLoader | null = null
let ktx2: KTX2Loader | null = null

/**
 * The shared Draco decoder.
 *
 * Pinned to the WASM build rather than letting three fall back to the 512 kB
 * JavaScript one. This app already requires WebAssembly — web-ifc is WASM, and
 * nothing here works without it — so the fallback could only ever be dead weight
 * in the bundle for a browser that cannot run the viewer anyway.
 */
export function getDracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader()
    draco.setDecoderPath(DRACO_PATH)
    draco.setDecoderConfig({ type: 'wasm' })
  }
  return draco
}

/**
 * The shared KTX2 transcoder.
 *
 * Needs the renderer, because a KTX2 texture is transcoded into whichever
 * compressed format THIS GPU supports — there is no single right answer, and
 * `detectSupport` is what picks. Called on every get rather than once: the
 * viewer's renderer is recreated when the scene is torn down, and a transcoder
 * holding a dead renderer's capabilities would pick a format the live one
 * cannot upload.
 */
export function getKtx2Loader(renderer: THREE.WebGLRenderer | null): KTX2Loader {
  if (!ktx2) {
    ktx2 = new KTX2Loader()
    ktx2.setTranscoderPath(BASIS_PATH)
  }
  if (renderer) {
    try {
      ktx2.detectSupport(renderer)
    } catch (e) {
      // A detection failure must cost compressed textures, not the import.
      log.warn('KTX2 support detection failed; compressed textures may not load:', e)
    }
  }
  return ktx2
}

/**
 * Release the decoder workers.
 *
 * Called when the mesh system is disposed. Not called per import — see the
 * header. `dispose()` terminates DRACOLoader's worker pool; leaving it running
 * holds a handful of workers alive for the life of the tab.
 */
export function disposeDecoders(): void {
  try { draco?.dispose() } catch { /* already gone */ }
  try { ktx2?.dispose() } catch { /* already gone */ }
  draco = null
  ktx2 = null
}

/** Test seam: whether a decoder has been instantiated. */
export function decodersActive(): { draco: boolean; ktx2: boolean } {
  return { draco: draco !== null, ktx2: ktx2 !== null }
}
