# Map generator

Pipeline geoespacial para el área piloto de Palermo Soho.

## Auditoría automatizada

El workflow `.github/workflows/palermo-data-audit.yml` descarga fuentes candidatas y genera un informe como artefacto de GitHub Actions. También puede ejecutarse manualmente desde la pestaña **Actions**.

Para ejecución local con Python 3.11+:

```bash
pip install -r requirements.txt
python -m src.download_sources --config config/palermo.json
python -m src.inspect_sources --config config/palermo.json
```

Los archivos originales se guardan bajo `data/raw/` y están excluidos de Git. El workflow conserva los informes y metadatos como artefacto temporal; no publica datasets crudos en el repositorio.

## Fuentes y límites

- GeoJSON candidatos de Tejido Urbano y Parcelas del portal de datos de Buenos Aires.
- OpenStreetMap se consulta mediante Overpass a través de OSMnx para edificios, parques, árboles, comercios, amenities y red vial.
- Las consultas pueden fallar por límites o disponibilidad del servicio. Un fallo queda registrado y no se interpreta como ausencia de objetos.
- Descargar un archivo no demuestra que esté completo ni que sus campos de altura sean utilizables; eso se valida en el informe.
