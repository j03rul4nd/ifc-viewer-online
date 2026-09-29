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
