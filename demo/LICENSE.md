# Licencia, atribución y procedencia

## Datos originales

**Dataset:** *Indoor point cloud dataset for BIM related applications*

**Autores:** Nuno Abreu, Rayssa Souza, Andry Pinto, Anibal Matos y Miguel Pires

**Fuente:** <https://doi.org/10.5281/zenodo.7948116>

**Descriptor:** <https://doi.org/10.3390/data8060101>

**Licencia declarada del dataset:** Creative Commons Attribution 4.0
International — <https://creativecommons.org/licenses/by/4.0/>

CC BY 4.0 permite copiar, redistribuir, adaptar y usar comercialmente los datos,
siempre que se dé crédito adecuado, se enlace la licencia y se indiquen los
cambios. No implica respaldo de los autores a esta demo.

Nota de evidencia: el campo de licencia del registro web de Zenodo aparecía
vacío durante la verificación de 2026-08-19. El artículo descriptor, la ficha
institucional de la Universidade do Porto y la ficha de INESC TEC identifican
de forma explícita el dataset enlazado por el mismo DOI como CC BY 4.0. Se
conserva esta nota para que la cadena de procedencia sea auditable.

## Cambios realizados en este repositorio

- Descarga íntegra sin modificación y verificación MD5 de los dos originales.
- Muestreo sistemático determinista del ASCII original.
- Conversión a PLY binario little-endian.
- Conservación de XYZ, RGB, intensidad y etiqueta semántica.
- Intensidad convertida linealmente de 0–1 a 0–255.
- Alineación rígida calculada nube→IFC, con escala fija 1.
- Generación de una variante web con la transformación aplicada a XYZ.
- Generación de una variante heatmap derivada de distancia a superficie IFC.
- El IFC original no se modifica.

## Archivos de software

Los scripts y cambios de aplicación de este repositorio mantienen la licencia
propia del proyecto. Esta nota solo documenta los derechos y obligaciones de
los datos CRAS incorporados o derivados.
