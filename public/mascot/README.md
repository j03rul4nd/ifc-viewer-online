# Bimo — mascota de producto

Mascota 3D rigueada para marketing, blog, vídeos de lanzamiento y (en el futuro)
asistente de ayuda. Todo se genera de forma procedural desde
`scripts/blender/build-mascot.py`, así que se puede iterar el diseño en código.

| Archivo | Qué es |
|---|---|
| `bimo.blend` | Escena editable: malla, esqueleto, shape keys, 11 acciones de cuerpo + 11 acciones de cara (`face_*`) |
| `bimo.glb` | Export glTF con skin, morph targets y 11 clips de animación |
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

## Emociones

`idle, happy, excited, curious, thinking, sad, surprised, love, sleepy, wave, angry`

Cada una es un clip en bucle del cuerpo + un preset facial (shape keys
`EyeBlink, EyeHappy, EyeSad, EyeAngry, EyeWide, EyeUp, MouthSmile, MouthFrown,
MouthOpen, MouthO, CheekPuff`, más rubor, brillo y tinte de ojos). En web las
transiciones mezclan los clips con `crossFadeTo` (0.55 s) y la cara con muelles
ligeramente sub-amortiguados, más un "pop" de squash al cambiar, parpadeo
aleatorio y mirada que sigue al cursor.

## Paleta

Cuerpo perla `#EEF0FB` con subsurface índigo, extremidades `#5E6AD2`, antena
`#8B93E8`, visor cristal `#0B0C16` — los mismos tokens que `src/index.css`, para
que encaje tanto en el tema oscuro como en el claro.
