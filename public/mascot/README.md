# Bimo — mascota de producto

Mascota 3D rigueada para marketing, blog, vídeos de lanzamiento y (en el futuro)
asistente de ayuda. Todo se genera de forma procedural desde
`scripts/blender/build-mascot.py`, así que se puede iterar el diseño en código.

| Archivo | Qué es |
|---|---|
| `bimo.blend` | Escena editable: malla, esqueleto, shape keys, 27 acciones de cuerpo + acciones de cara (`face_*`) |
| `bimo.glb` | Export glTF con skin, morph targets y 27 clips de animación |
| `mascot.json` | Emociones, nombres de morphs y pesos faciales por emoción (lo usa el visor web) |
| `index.html` | Visor Three.js: PBR físico + shaders GLSL, bloom, transiciones con muelles |
| `renders/` | Stills en Cycles (fondo de la marca) listos para blog/redes |

## Regenerar

```bash
npm run mascot          # .blend + .glb + mascot.json
npm run mascot:render   # + renders Cycles (SAMPLES=128 STILLS=happy,sad ...)
```

## Esqueleto

`root → body → head → antenna.1 → antenna.2`, `body → arm.L / arm.R`, `root → foot.L / foot.R`.
El cuerpo es un único volumen blando: `head` controla los 2/3 superiores con pesos
suaves, `body` el squash & stretch (conserva volumen).

## Animaciones (27)

| Grupo | Clips | Uso típico |
|---|---|---|
| Emociones (bucle) | `idle happy excited love laugh shy curious surprised sad angry sleepy` | blog, redes, reacciones |
| Estados de producto (bucle) | `listening talking thinking loading confused error point_left point_right wave dance` | asistente, onboarding, tooltips, estados vacíos |
| Momentos (una vez) | `hello celebrate nod shake wink jump` | entrada, éxito, confirmación, funnels |

Los "momentos" se reproducen una vez y vuelven solos al bucle anterior.

## Expresiones (shape keys)

`EyeBlink EyeHappy EyeSad EyeAngry EyeWide EyeUp EyeDown EyeSmall EyeHeart
EyeWinkL EyeWinkR EyeLookL EyeLookR MouthSmile MouthFrown MouthOpen MouthO
MouthCat (ω) MouthFlat CheekPuff`, más rubor, brillo y tinte de ojos por emoción
(`mascot.json → face`). Los ojos llevan dos brillos que se ocultan al parpadear,
guiñar o poner corazones.

## API del visor

```js
bimo.play('celebrate')   // cualquier clip
bimo.say(3000)           // habla (boca procedural) N ms y vuelve al estado anterior
bimo.list()              // { loops, oneshots }
bimo.state               // clip actual
```

El visor añade parpadeo aleatorio, ojos y cabeza que siguen al cursor, "pop"
de squash al cambiar y transiciones con muelles.

## Paleta

Cuerpo perla `#EEF0FB` con subsurface índigo, extremidades `#5E6AD2`, antena
`#8B93E8`, visor cristal `#0B0C16` — los mismos tokens que `src/index.css`, para
que encaje tanto en el tema oscuro como en el claro.

## Real-time 3D in the product (full quality)

The product uses the real GLB with its skeleton, not a copy:

- **`bimo.opt.glb`**: `bimo.glb` compressed with meshopt and quantization (`npm run mascot:optimize`). It's about 570 KB on disk and about 200 KB over the network, against 2.7 MB for the original.
- **Load policy** (`src/components/mascot/bimoLoadPolicy.ts`):
  - The SVG always paints first. It's what Google indexes and what low-end devices, Save-Data users and prefers-reduced-data users see.
  - The 3D loads only on a capable device (WebGL2 without a performance caveat, ≥4 GB RAM, not on 2G).
  - It waits until the page has finished loading and the browser is idle, so it doesn't affect LCP, TBT or INP.
  - It only loads if that Bimo is on screen and there's one of the 3 live slots per page free. The ones that go offscreen give up their slot.
- **QA**: `?bimo3d=1` forces the 3D and `?bimo3d=0` forces the SVG.
- Every `<Bimo>` of 48 px or more upgrades itself to 3D. That covers blog blocks, UploadOverlay and similar surfaces.

### Stage components (`BimoStage.tsx`)

| Component | Use |
|---|---|
| `BimoStage` | Large 3D Bimo with SVG poster, speech bubble and part-by-part interaction |
| `BimoHero` | Hero: title, copy and actions next to a large Bimo |
| `BimoCover` | Cover card (banner 3:1 or card 1.91:1) |
| `BimoSection` | Split section; Bimo plays a "moment" when entering the viewport |
| `BimoState` | States: `notFound`, `unsupported`, `docs`, `offline`, `error`, `empty`, `comingSoon`, `success` (texts in `common.json → mascot.states`, 10 languages) |

```tsx
<BimoState kind="notFound" detail={path} actions={[{ label: t('home'), href: '/', primary: true }]} fullPage />
<BimoHero eyebrow="Docs" title="Validate IFC in 3 steps" clip="point_right" say="I'll show you!" />
```

### Micro-reactions and interaction (`bimoRuntime.ts`)

```ts
bimo.micro('boing' | 'flinch' | 'giggle' | 'shiver' | 'perk' | 'nod' | 'tilt' | 'squish' | 'heart' | 'glance' | 'twitch' | 'blink' | 'doubleBlink', strength?)
bimo.setAutonomy(false)                             // turns off autonomous behaviour
bimo.setExpression({ EyeWide: 0.6, MouthO: 0.4 })   // held over the clip; null to release
bimo.pulse('EyeHeart', 1)                           // decays on its own
bimo.pick(clientX, clientY)                         // 'antenna' | 'face' | 'head' | 'body' | 'arm' | 'foot' | null
bimo.lookAtElement(el) / bimo.lookAtClient(x, y)
```

In `BimoStage`, clicking each part reacts differently:

- antenna: boing;
- face: giggle;
- head: tilt;
- body: squish;
- arm: wave;
- foot: jump.

Stroking the head triggers `heart`.

### Life (`bimoLife.ts`)

So he never feels like a repeating loop on screens where people stay for minutes:

- **Rig**: `root → body → spine → head` (the spine lets the body bend in an S), plus arms, feet and a 2-bone antenna.
- **Long idles**: `idle`, `idle_look` (9 s, looks around and up at his antenna) and `idle_shift` (7 s, shifts weight and taps a foot).
- **Ambient moments**: `look_around`, `sigh`, `stretch` and `yawn`.
- **Director**: while he's idle, it rotates the idle variants and drops in moments and small gestures at irregular intervals (mostly every 5–11 s).
  - With no input for 45 s he yawns; at 80 s he dozes off.
  - Any pointer, scroll or key wakes him with a start.
  - It never replaces a clip chosen by the component; outside the idle family it only adds small gestures.
- **Organic motion**:
  - breathing with an inhale, exhale and rest whose rate depends on his energy (the energy of the current emotion);
  - sway and head drift driven by fractal noise instead of sines;
  - each loop cycle plays at a slightly different speed.
- **Secondary physics**:
  - a soft body that squashes when he lands;
  - spine and head that trail behind the body (overlap);
  - loose arms, each tuned slightly differently;
  - a spring-chain antenna;
  - inertia when the page scrolls.
- **Environment**:
  - a light follows the cursor, so the highlights glide over the pearl shell and the visor;
  - a fast pointer pass nearby startles him.
- **Micro-reactions as sequences**: anticipation → action → follow-through → settle. For example, `boing` looks up and crouches, then the antenna whips, then he giggles.
