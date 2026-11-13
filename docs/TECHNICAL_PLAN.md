# Plan técnico

## Coordenadas
Conservar el CRS declarado por cada fuente e inspeccionarlo antes de transformar. Para Palermo se espera trabajar en EPSG:5348 (POSGAR 2007 / Argentina 6), sujeto a validar definición, área de uso y CRS de origen. Después de reproyectar, restar un origen local cercano al centro del área piloto para mantener coordenadas pequeñas en Three.js.

## Pipeline
1. Validar metadatos, licencia, CRS y cobertura.
2. Leer campos necesarios y recortar al área piloto.
3. Reparar geometrías inválidas registrando conteos antes/después.
4. Normalizar huellas de edificios y procedencia de alturas.
5. Procesar calles, veredas, parcelas, árboles y puntos de interés en capas separadas.
6. Exportar GLB por chunks y un manifiesto JSON.
7. Validar mallas, límites, atributos faltantes y alineación visual.

## Procedencia de alturas
Etiquetar cada altura como atributo de fuente, derivada de niveles, inferida o estimada. Nunca mezclar estimaciones con mediciones sin distinguirlas.

## Runtime
Three.js + TypeScript, carga GLB por chunk, InstancedMesh para elementos repetidos, frustum culling y LOD por distancia. La generación geoespacial se mantiene fuera del runtime del navegador.
