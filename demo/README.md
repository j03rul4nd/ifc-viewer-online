# CRAS Labs Point Cloud + IFC demo

Demo profesional y reproducible de un edificio real escaneado mediante TLS y
su IFC as-built correspondiente. Los datos proceden de
[Abreu et al., CRAS Labs @ FEUP](https://doi.org/10.5281/zenodo.7948116) y se
usan bajo CC BY 4.0 con la atribución y los cambios documentados en
[`LICENSE.md`](LICENSE.md).

![Alineación Point Cloud + IFC](captures/alignment-perspective.png)

## Resultado validado

- Original: **584,701,977 puntos**, 21 escaneos, RGB, intensidad y etiquetas 0–33.
- IFC: **IFC2X3**, metros, importado en Blender 4.5.12 mediante Bonsai.
- Transformación: rígida, nube→IFC, escala bloqueada en **1**.
- Muestra de calidad: **4,997,453 puntos**.
- Muestra web: **999,491 puntos**, 16.99 MB en PLY binario.
- Validación sobre 3,588,276 puntos estructurales: mediana **6.4 mm**,
  **93.76 %** a ≤5 cm y **96.70 %** a ≤10 cm de la superficie IFC más cercana.

Estas distancias no son una certificación de precisión de levantamiento. Incluyen
diferencias as-built/BIM, simplificación del modelo, oclusiones y error residual
de registro.

## Transformación medida

Coordenadas de origen y destino en metros, Z-up. Matriz 4×4 row-major:

```json
{
  "translation": [-9.8482110678, -0.3906303879, 1.2560517744],
  "rotationEulerXYZDegrees": [-0.0114655926, -0.0022945654, 0.7774680731],
  "scale": 1.0,
  "matrix4x4RowMajor": [
    [0.9999079366, -0.0135689530, -0.0000427594, -9.8482110678],
    [0.0135689613, 0.9999079175, 0.0001995505, -0.3906303879],
    [0.0000400477, -0.0002001123, 0.9999999792, 1.2560517744],
    [0.0, 0.0, 0.0, 1.0]
  ]
}
```

El resultado completo, los ICP intermedios y las métricas por clase están en
[`transformation.json`](transformation.json). En `pointcloud-web.ply` la matriz
ya está aplicada a XYZ. En Blender, el objeto conserva coordenadas de origen y
la matriz está aplicada como `matrix_world`, lo que permite auditarla.

## Estructura

```text
demo/
├── raw/
│   ├── pointcloud-original.zip       # original intacto, 4.267 GB
│   └── model-original.ifc            # original intacto, 67.6 MB
├── processed/
│   ├── pointcloud-clean.ply           # 4.997 M, marco CRAS
│   ├── pointcloud-web-source.ply      # 0.999 M, marco CRAS
│   ├── pointcloud-web.ply             # 0.999 M, marco IFC
│   ├── pointcloud-deviation-web.ply   # marco IFC, RGB = heatmap
│   ├── model.ifc                      # copia IFC intacta para web
│   ├── model-clean.ifc                # alias local de la misma copia intacta
│   ├── ifc-registration-mesh.ply      # intermedio de registro
│   ├── ifc-registration-surface.ply   # muestra de superficie IFC
│   └── *-stats.json
├── blender/
│   ├── alignment.blend
│   └── build-report.json
├── captures/
│   ├── alignment-perspective.png
│   ├── alignment-top.png
│   ├── alignment-front.png
│   ├── alignment-side.png
│   └── alignment-section.png
├── research.md
├── metadata.json
├── transformation.json
├── LICENSE.md
└── README.md
```

## Abrir y comprobar en Blender

Abre `demo/blender/alignment.blend`. La escena contiene:

- `PointCloud`: PLY de 999,491 vértices con RGB, `matrix_world` medida y Geometry Nodes para renderizar puntos.
- `IFC`: importación Bonsai con 281 objetos de malla y jerarquía/metadata IFC conservadas.
- `Reference`: cámara, iluminación y ejes del marco IFC.
- texto interno `CRAS_ALIGNMENT_README` con fuente, licencia y convención.

Las vistas Perspective, Top, Front, Side y Section se generaron desde esta misma
escena. La vista Section usa el far clipping de una cámara ortográfica para
mostrar media profundidad sin modificar geometría.

## Reproducir desde cero

Requisitos usados:

- Node.js del proyecto.
- Python con NumPy para el muestreo en streaming.
- Blender 4.5.12 LTS con Bonsai/IfcOpenShell.
- Open3D 0.19.0 instalado en el Python de Blender.

Desde la raíz del repositorio:

```powershell
node scripts/pointcloud-demo/download-cras.mjs

& 'C:\Users\joelb\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  scripts/pointcloud-demo/process_cras.py

& 'C:\tools\blender-4.5.12-windows-x64\4.5\python\bin\python.exe' -m pip install `
  --no-cache-dir -r scripts/pointcloud-demo/requirements.txt

& 'C:\tools\blender-4.5.12-windows-x64\blender.exe' --background `
  --python scripts/pointcloud-demo/extract_ifc_registration.py -- `
  --ifc demo/raw/model-original.ifc --output-dir demo/processed --sample-points 1000000

& 'C:\tools\blender-4.5.12-windows-x64\4.5\python\bin\python.exe' `
  scripts/pointcloud-demo/align_cras.py

Copy-Item demo/raw/model-original.ifc demo/processed/model.ifc

& 'C:\tools\blender-4.5.12-windows-x64\blender.exe' --background `
  --python scripts/pointcloud-demo/create_blender_scene.py --

& 'C:\Users\joelb\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' `
  scripts/pointcloud-demo/generate_metadata.py
```

El downloader usa rangos HTTP, comprueba tamaño y MD5, y nunca sobrescribe un
original ya verificado. El procesador lee los 26.75 GB de ASCII directamente
desde el ZIP, sin extraerlo. El muestreo es sistemático y determinista; no se
eliminaron outliers a ciegas porque los autores ya documentan la limpieza de
ruido no deseado.

## Usar en el visor web

Los archivos de despliegue están en `public/models/cras/`. Arranca la aplicación,
abre **CRAS Labs @ FEUP — As-Built** en la galería IFC y después **CRAS Labs @
FEUP — real Scan vs BIM** en Tools → Point cloud.

El panel incluye estos presets:

- Point Cloud
- IFC
- Overlay (IFC al 45 %)
- X-Ray
- Scan vs BIM
- slider continuo `POINT CLOUD ←→ IFC`

Los presets solo cambian visibilidad y opacidad; no tocan la transformación.
`pointcloud-deviation-web.ply` usa las mismas coordenadas y puede cargarse como
alternativa RGB para enseñar las bandas ≤2 cm, 2–5 cm, 5–10 cm y >10 cm.

## Decisiones y límites

- **PLY ahora, COPC al escalar:** 1 M de puntos cabe en un único PLY de 17 MB y
  evita infraestructura. Para el original de 584.7 M, generar COPC y servir
  HTTP Range es la opción correcta.
- **No hay CRS geodésico:** ambos archivos usan coordenadas locales métricas.
  El PLY web queda en el marco local IFC y el visor aplica su conversión Z-up→Y-up.
- **El IFC no se “limpió”:** `model.ifc` es byte-equivalente al original. Así se
  conservan placements, jerarquía y semántica; `model-clean.ifc` no implica una
  reconstrucción, solo el artefacto esperado por la estructura solicitada.
- **El heatmap no es QA contractual:** mide cercanía geométrica, no cumplimiento
  de tolerancias de obra.
- **Distribución web:** los datos permiten hospedaje y derivados bajo CC BY 4.0,
  pero la atribución y el aviso de cambios deben acompañarlos.

Consulta [`research.md`](research.md) para la comparación de seis candidatos y
[`metadata.json`](metadata.json) para tamaños, hashes, unidades y procedencia.
