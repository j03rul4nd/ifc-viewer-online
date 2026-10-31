# Sketch studio (`/sketch`)

Draw in 3D with a pen or a finger, on a phone first. Strokes land on a drawing
plane you can move, turn and take from the drawing. Everything runs and stays in
the browser: IndexedDB, no account, no server.

## What it does

| Area | Behaviour |
|---|---|
| Ink | Pen, pencil, marker, straight line, eraser. Weight follows pressure, in screen pixels. One Euro smoothing; coalesced pen samples are used when the browser gives them. |
| Hold to straighten | Pausing at the end of a stroke turns it into a straight line, snapped to the plane's axes when close. |
| Plane | Ground, front, side, facing the camera. Slide along the normal, rotate 15° per axis. The plane tool takes it from a stroke point or a model face. Edge-on planes refuse input and offer the fix. |
| View | Compass (drag to orbit, tap an axis), top/front/right/3D, parallel projection, fit, saved views. Distance fades strokes so a wire sketch reads as 3D. |
| Organise | Pages with thumbnails, layers (hide, lock), undo and redo. |
| References | Image board (library, camera, paste, drop) docked or floating. Images can be placed on the plane to trace, with opacity. A live plan and elevation of the sketch. |
| Context | *View → 3D sketch* in the viewer sends every open model to the studio in a new tab, which also keeps the viewer open for Split View. A GLB file works too. Models are saved with the sketch, on this device. Faces can set the drawing plane. |
| Export | PNG, SVG (real paths), sketch file, replay video where MediaRecorder allows. |

## Input rules (`lib/sketch/gestures.ts`)

Pen always draws and switches fingers to navigation. One finger draws until then.
Two fingers orbit and pinch, three pan. Two and three finger taps undo and redo.
A second finger within 160 ms cancels the first finger's stroke. A palm-sized
contact is ignored once a pen is in use.

## Layout (`lib/sketch/layout.ts`)

Read from the studio's own box on every resize. No device is named. Apple's
guidance for iPhone Duo is the same: size classes and live window size, because a
fold can resize the app mid-session.

- Regular (at least 600×480): tool rail on the side the user picks, page strip.
- Compact: one row of tools under the thumb, the rest in a sheet.
- References dock beside or below the drawing when both fit, otherwise float.
- Browsers reporting viewport segments split at the hinge. WebKit does not report
  them (`docs/DUAL_SCREEN.md`), and a flat inner screen has no seam to avoid.

iOS Split View and a second Safari window are only a smaller box here. Windows
share IndexedDB and refresh each other through a BroadcastChannel; the last save
wins, so simultaneous drawing in two windows of the same sketch is not merged.

## Not validated

Tested in desktop Chromium with synthetic pen events at emulated sizes. **Not run
on an iPhone Duo, an Apple Pencil, or any physical foldable.** Apple says Pencil
support on iPhone Duo arrives "later this year". Latency, palm size, Safari's
`getCoalescedEvents`, canvas video recording and storage limits on iOS are
unmeasured. Do not claim them until they are.

## Known limits

- Stored stroke weight is screen-space: it does not scale with zoom.
- SVG uses each stroke's average weight.
- Handoff stops above 300 MB of GLB. The figure is a guess at what a phone holds, not a measurement.
- Strokes are 32-bit floats: on a model with UTM coordinates in its vertices they will jitter.
- The context is one per browser, not per sketch or page.
- Tilt and Pencil hover are not used.
