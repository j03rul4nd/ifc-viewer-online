# Colour system

Applied across the app, generators and generated pages.

**Why not what we had:** `#5E6AD2` is the indigo of Linear and of the AI-generated
look around it; near-black with a blue cast and Radix status colours complete the
same scale as many competitors.

**Roles, in order of loudness:**

| Level | Role | Dark | Light |
|---|---|---|---|
| 0 | Canvas | `#100f0c` | `#f4f3f0` |
| 1 | Panel | `#181714` | `#fefdfc` |
| 2 | Raised | `#21201d` | `#e9e8e4` |
| 3 | Line | `#34332e` | `#d5d4d0` |
| 4 | Text, tertiary | `#94928d` | `#65635e` |
| 5 | Text, secondary | `#b2b1ab` | `#4e4d48` |
| 6 | Text, primary | `#ecebe7` | `#1c1b16` |
| A | Accent: actions, links, selection only | `#55cac3` | `#00696a` |
| S | Status: only when something has that state | ok `#6fc884`, warn `#f2af48`, danger `#f66e60` | ok `#206b38`, warn `#915c08`, danger `#af2b25` |

**Source values in OKLCH.** Neutrals: hue 95, chroma about .006 (concrete, not blue
slate). Accent: verdigris, hue about 190, the oxidised copper of building facades.
All listed text and accent pairs measure at least 5.4:1 (WCAG 2.2 AA).

**Rules:** colour means something or it is not there. No gradients on UI. Text on the
accent is computed, because brands choose any colour. Brand overrides replace the
accent and neutrals, never the status meanings.

**On the main site** `--accent` is the fill, `#0a8481` (white text 4.5:1, 4.2:1 on the dark canvas), and `--accent-2`, `#55cac3`, is accent text on dark. The tracking widget keeps `#55cac3` as its one accent with computed text. Light theme uses `#00696a`.

**Left on purpose:** blue where it means water or a discipline, categorical data colours, SDK syntax highlighting. **Not changed:** raster images (covers, screenshots, OG cards), ebooks, the mascot model.
