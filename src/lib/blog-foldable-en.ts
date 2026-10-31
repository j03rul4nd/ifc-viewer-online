import type { BlogPost } from './blog-posts'

// The viewer on foldable and dual-screen phones (docs/DUAL_SCREEN.md). Written
// for someone searching from the device itself, so the check comes first and
// answers for the phone in their hand. Every behaviour described is the app's;
// the hardware limits are stated because they have not been tested on a device.

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
    title: 'An IFC Viewer for Foldable Phones: the Model on One Screen, Its Data on the Other',
    seoTitle: 'IFC Viewer for Foldable Phones: BIM on Two Screens',
    seoDescription: 'Open IFC models on a foldable or dual-screen phone: 3D on one screen, tree and properties on the other, no app to install. Check your device live.',
    excerpt: 'A viewer built for one screen treats a foldable as a big phone and runs the model straight through the hinge. This one reads the screens your browser reports and gives each a job. Check what it does on your device, then open a sample model.',
    readTimeMin: 5,
    keywords: ['foldable phone IFC viewer', 'BIM viewer foldable', 'IFC viewer Galaxy Z Fold', 'IFC viewer Pixel Fold', 'dual screen BIM viewer', 'IFC viewer Android', 'open IFC on phone', 'BIM on site mobile'],
    faqs: [
      { q: 'Can I open an IFC file on a foldable phone?', a: 'Yes. IFC Viewer Online runs in the browser, so there is nothing to install. Open the site, pick a file from the phone, and it is processed on the device rather than uploaded to a server.' },
      { q: 'Does it work on a Samsung Galaxy Z Fold or Google Pixel Fold?', a: 'The viewer does not look for device names. It uses two screens when the browser reports two display segments, which Chromium-based browsers can do on Android foldables. We have tested this with emulated segments, not on physical phones yet, so the check in this article tells you what your own device reports.' },
      { q: 'Why does my foldable show one screen when it is fully open?', a: 'A foldable lying flat has no seam to avoid, so the browser reports one segment. Half-fold it into book or tabletop posture, or use View → Split screen, which is offered on touch screens at least 720 px wide.' },
      { q: 'Will it work on a foldable iPhone?', a: 'Safari does not expose display segments today, so an iPhone or iPad cannot tell the viewer where a hinge is. Wide touch screens still get the manual split; the automatic one would need WebKit to implement the API.' },
      { q: 'Does the 3D model reload when I fold or unfold?', a: 'No. The same 3D view changes size, and your selection and the tree stay as they were.' },
    ],
    references: [
      { id: 'segments', title: 'Viewport Segments API', source: 'MDN Web Docs', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Viewport_segments_API', note: 'The browser API that reports each screen and the gap between them.' },
      { id: 'posture', title: 'Device Posture API', source: 'W3C', url: 'https://www.w3.org/TR/device-posture/', note: 'How a page learns that a device has been folded.' },
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
          openHint: 'A real IFC house, free, no sign-up.',
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
      { ...shot('foldable-ifc-viewer-book-posture', 1114, 720), alt: 'IFC Viewer Online split across two screens: the Duplex model in 3D on the left and the spatial tree with properties on the right', caption: 'Book posture: two 540 px screens and a 34 px hinge. The real viewer and sample model, emulated in Chrome and shown on an illustrative device: not a photo, not a real product.' },
      { ...shot('foldable-ifc-viewer-tabletop-posture', 720, 900), alt: 'IFC Viewer Online in tabletop posture with the 3D model on the upper screen and the model data on the lower screen', caption: 'Tabletop posture, emulated the same way: the model above the fold, the data under your thumbs.' },

      { type: 'h2', text: 'Three things to try on the sample model' },
      { type: 'steps', items: [
        { title: 'Tap an element in 3D', body: 'Its properties appear on the other screen and the tree scrolls to its row, while the model stays fully visible.' },
        { title: 'Run the validation', body: 'The results open over the second screen, not under the model, so the 3D view keeps its full height while you step through the issues.' },
        { title: 'Swap the screens', body: 'If your thumb or the light favours the other side, swap them from the panel header. The choice is remembered, along with which view you prefer.' },
      ] },
      { type: 'callout', variant: 'tip', text: 'On a desktop? Open Chrome DevTools, turn on the device toolbar and pick a foldable such as Surface Duo. Use its fold control, and the check above should change.' },

      { type: 'h2', text: 'What we have and have not tested' },
      { type: 'p', text: ['The layouts were checked in Chromium with emulated segments and a real IFC file: book, tabletop, swapping, and returning to one screen with the same 3D view and selection. We have not yet run them on a physical foldable, so real hinge sizes and posture changes are unverified. That is what the question in the check above is for. The ', { text: 'Viewport Segments API', cite: 'segments' }, ' and ', { text: 'Device Posture API', cite: 'posture' }, ' are also not everywhere: Safari has neither, so iPhones and iPads get the normal app and, on wide touch screens, the manual split.'] },
      { type: 'tool', id: 'validator', why: 'Once the model is open, check it: the score, the issues and how to fix them, all on the phone.' },
    ],
  },
]
