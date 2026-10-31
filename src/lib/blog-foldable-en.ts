import type { BlogPost } from './blog-posts'

// The viewer on foldable and dual-screen phones (docs/DUAL_SCREEN.md). Written
// for someone searching from the device itself, so the check comes first and
// answers for the phone in their hand. Every behaviour described is the app's;
// the hardware limits are stated because they have not been tested on a device.
// Model names are public samples: reconstructions bundled with the app.

const shot = (name: string, width: number, height: number) => ({
  type: 'image' as const,
  src: `blog/images/${name}.jpg`,
  srcSet: [
    { src: `blog/images/${name}-800.jpg`, width: 800 },
    { src: `blog/images/${name}.jpg`, width: width * 2 },
  ],
  sizes: '(max-width: 860px) 100vw, 820px',
  width: width * 2,
  height: height * 2,
})

export const FOLDABLE_POSTS_EN: BlogPost[] = [
  {
    slug: 'foldable-phone-ifc-viewer',
    date: '2026-10-31',
    dateModified: '2026-10-31',
    author: 'IFC Viewer Team',
    category: 'Tools & comparisons',
    categorySlug: 'tools',
    title: 'An IFC and 3D Model Viewer for iPhone Duo, Galaxy Z Fold and Z Flip: Split Screen, No App',
    seoTitle: 'IFC Viewer for iPhone Duo, Z Fold, Z Flip: Split Screen',
    seoDescription: 'Render IFC 3D models on iPhone Duo, Galaxy Z Fold or Z Flip: model on one screen, data on the other, no app to install. Check your phone live.',
    excerpt: 'A viewer built for one screen treats a foldable as a big phone and runs the model straight through the hinge. This one reads the screens your browser reports and gives each a job. Check what it does on your device, then open a sample model.',
    readTimeMin: 6,
    keywords: ['IFC viewer iPhone Duo', 'IFC viewer Galaxy Z Fold', 'IFC viewer Z Flip', 'split screen 3D model viewer', 'render 3D models on foldable phone', 'foldable phone IFC viewer', 'BIM viewer foldable', 'dual screen BIM viewer', 'open IFC on phone', 'BIM on site mobile'],
    faqs: [
      { q: 'Can I open an IFC file on a foldable phone?', a: 'Yes. IFC Viewer Online runs in the browser, so there is nothing to install. Open the site, pick a file from the phone, and it is processed on the device rather than uploaded to a server.' },
      { q: 'Does it work on a Samsung Galaxy Z Fold or Google Pixel Fold?', a: 'It is built to. The viewer does not look for device names: it uses two screens when the browser reports two display segments, an API Chrome has shipped since version 138. We have tested this with emulated segments, not on physical phones yet, so the check in this article tells you what your own device reports.' },
      { q: 'Can a Galaxy Z Flip show a 3D model on one half and data on the other?', a: 'That is the tabletop layout: half-fold the phone and, if the browser reports two segments, the model takes the upper half and the data the lower one. Each half is small, so the Properties view in the pane is the most comfortable. We have tested this in an emulated Flip-sized format, not on the phone itself.' },
      { q: 'Why does my foldable show one screen when it is fully open?', a: 'A foldable lying flat has no seam to avoid, so the browser reports one segment. Half-fold it into book or tabletop posture, or use View → Split screen, which is offered on touch screens at least 720 px wide.' },
      { q: 'Does it work on the iPhone Duo?', a: 'It should, although we have not tested it on the phone yet. Open, its screen is wide enough for View → Split screen, which divides it in two. Automatic detection of the fold depends on two Safari 27.1 preview features that are off by default: Device Posture API and Viewport Segments API, under Settings > Apps > Safari > Advanced > Feature Flags.' },
      { q: 'Does the 3D model reload when I fold or unfold?', a: 'No. The same 3D view changes size, and your selection and the tree stay as they were.' },
    ],
    references: [
      { id: 'segments', title: 'Viewport Segments API', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API', note: 'The browser API that reports each screen and the gap between them.' },
      { id: 'posture', title: 'Device Posture API', source: 'W3C', url: 'https://www.w3.org/TR/device-posture/', note: 'How a page learns that a device has been folded.' },
      { id: 'safari', title: 'WebKit Features for Safari 27.1', source: 'WebKit', url: 'https://webkit.org/blog/18486/webkit-features-for-safari-27-1/', note: 'iPhone Duo viewport sizes and the foldable APIs behind feature flags.' },
      { id: 'chrome', title: 'Support foldable devices with the Viewport Segments API', source: 'Chrome for Developers', url: 'https://developer.chrome.com/blog/viewport-segments-api-shipped', note: 'The API ships from Chrome 138.' },
    ],
    content: [
      { type: 'p', text: 'A foldable phone is the first pocket device with enough glass for a building model and its data at once. But a viewer built for one screen treats it as a big phone: the model runs through the crease and every property you read covers the thing you were looking at. Here the 3D view takes one screen and the spatial tree and properties take the other, with nothing to install.' },
      {
        type: 'foldable-check',
        title: 'What it does on your device, right now',
        caption: 'Read live from your browser, on your device. If you are on a foldable, fold it and watch this change. The drawings show the layouts; they are not your screen.',
        labels: {
          live: 'Live reading',
          segments: 'Screens reported',
          viewport: 'Viewport',
          pointer: 'Input',
          touch: 'Touch',
          mouse: 'Mouse',
          verdicts: {
            'two-screens': 'Two screens detected. The model opens on one, its tree and properties on the other.',
            manual: 'One wide touch screen. It opens split in two, and half-folding gives you the real two-screen layout if your browser reports it.',
            phone: 'A phone-sized screen, so you get the normal phone app. If this is the cover screen of a foldable, open the phone and half-fold it.',
            desktop: 'A desktop browser, so one screen. Open this page on your foldable to see the difference, or follow the DevTools steps below.',
          },
          open: 'Open a sample model',
          openHint: 'A detailed IFC hotel model, free, no sign-up.',
          shapes: 'The three layouts',
          book: 'Book',
          tabletop: 'Tabletop',
          flat: 'Flat',
          viewer: '3D model',
          pane: 'Tree + properties',
          report: 'Did the split work on your device?',
          reportYes: 'It worked',
          reportNo: 'It did not',
          reportThanks: 'Thanks. That tells us which devices need work; we only record the answer and the number of screens, never your device.',
        },
      },
      { type: 'takeaways', items: [
        'Half-fold the phone and the model takes one screen, the tree and properties the other. Nothing sits on the hinge.',
        'It follows what the browser reports, not a list of phone models, so a new device works if its browser exposes the screens.',
        'One model, one 3D view: folding resizes it and does not reload anything.',
        'Files stay on your phone. It all runs in the browser, including validation.',
      ] },

      { type: 'h2', text: 'What each way of holding it gives you' },
      { type: 'table', headers: ['Posture', 'What you see', 'Good for'], rows: [
        ['Book (fold upright)', '3D on one side, tree and properties on the other', 'Walking a floor while checking what each element is'],
        ['Tabletop (fold flat on a surface)', '3D on top, data below', 'A site table or a meeting: the lower half is where your thumbs are'],
        ['Fully open', 'One screen; split available from View → Split screen', 'Looking at the whole model, or showing it to someone'],
        ['Closed (cover screen)', 'The normal phone app', 'A quick look, then open the phone without losing your place'],
      ] },
      { ...shot('foldable-ifc-viewer-book-posture', 1114, 720), alt: 'Hotel Vela IFC model in 3D on the left screen of a foldable, with the selected curtain wall and its properties on the right screen', caption: 'Book posture with a detailed hotel model: tap the facade and its data opens beside it. The real viewer, emulated in Chrome and shown on an illustrative device: not a photo, not a real product.' },
      { ...shot('foldable-ifc-viewer-federated-models', 1114, 720), alt: 'Architecture, structure and MEP models of Hotel Vela federated in 3D on one screen of a foldable, with the model tree on the other', caption: 'Three federated models, architecture, structure and MEP, with one tree beside them. Same emulation and illustrative device.' },

      { type: 'h2', text: 'iPhone Duo, Galaxy Z Fold and Z Flip: what each one gets' },
      { type: 'table', headers: ['Phone', 'Split screen today', 'What we know'], rows: [
        ['iPhone Duo', 'Manual, when open: View → Split screen. Automatic only with Safari feature flags on', 'Safari 27.1 viewport reaches 951 px wide; not yet tested on the phone'],
        ['Galaxy Z Fold, Pixel Fold', 'Automatic when half-folded, if the browser reports two segments; manual when open', 'Tested with emulated segments, not on the phone'],
        ['Galaxy Z Flip and other flip phones', 'Tabletop when half-folded, if the browser reports two segments', 'Tested in an emulated Flip-sized format, not on the phone'],
      ] },
      { type: 'p', text: ['Sizes and support come from ', { text: 'WebKit', cite: 'safari' }, ' and ', { text: 'Chrome', cite: 'chrome' }, '. Rendering is done by your phone, so very large models depend on its memory.'] },
      { ...shot('foldable-ifc-viewer-tabletop-posture', 720, 900), alt: 'Oriental Pearl Tower IFC model on the upper screen of a half-folded phone, with the tree and column properties on the lower screen', caption: 'Tabletop posture with the Oriental Pearl Tower: the model above the fold, the data under your thumbs. Emulated, on an illustrative device.' },
      { ...shot('foldable-ifc-viewer-flip-format', 360, 840), alt: 'Helsinki Central Station IFC model on the top half of a flip-format phone, with its tree and properties on the bottom half', caption: 'A flip-sized format, 360 px wide, with Helsinki Central Station. Emulated, on an illustrative device that represents no particular phone.' },

      { type: 'h2', text: 'Three things to try on the sample model' },
      { type: 'steps', items: [
        { title: 'Tap an element in 3D', body: 'Its properties appear on the other screen and the tree scrolls to its row, while the model stays fully visible.' },
        { title: 'Run the validation', body: 'The results open over the second screen, not under the model, so the 3D view keeps its full height while you step through the issues.' },
        { title: 'Swap the screens', body: 'If your thumb or the light favours the other side, swap them from the panel header. The choice is remembered, along with which view you prefer.' },
      ] },
      { ...shot('foldable-ifc-viewer-validation-second-screen', 1114, 720), alt: 'Validation results for the Shanghai World Financial Center IFC model on the second screen, with the full tower in 3D on the first', caption: 'Validating a 12.8 MB tower: 720 issues and how to fix them on one screen, the whole building on the other. Emulated, on an illustrative device.' },
      { type: 'callout', variant: 'tip', text: 'On a desktop? Open Chrome DevTools, turn on the device toolbar and pick a foldable such as Surface Duo. Use its fold control, and the check above should change.' },

      { type: 'h2', text: 'What we have and have not tested' },
      { type: 'p', text: ['The layouts were checked in Chromium with emulated segments and real IFC files: book, tabletop, swapping, and returning to one screen with the same 3D view and selection. We have not yet run them on a physical foldable, so real hinge sizes and posture changes are unverified. That is what the question in the check above is for. The ', { text: 'Viewport Segments API', cite: 'segments' }, ' and ', { text: 'Device Posture API', cite: 'posture' }, ' are also still young: in Safari they are a preview behind flags, and may change.'] },
      { type: 'tool', id: 'validator', why: 'Once the model is open, check it: the score, the issues and how to fix them, all on the phone.' },
    ],
  },
]
