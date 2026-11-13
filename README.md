# Buenos Aires Perfecta

Un mundo 3D jugable ambientado en Buenos Aires, construido a partir de datos geográficos abiertos y verificables.

## Estado actual

- Base web creada con Three.js, TypeScript y Vite.
- Blockout 3D esquemático para validar cámara y escala visual; **no representa todavía edificios ni calles relevados**.
- Área piloto definida en Palermo Soho, alrededor de Plaza Armenia / Plaza Serrano.
- Pipeline inicial para descargar y auditar fuentes candidatas de CABA y OpenStreetMap.
- La geometría real, las alturas y la cobertura todavía deben validarse con el primer informe de datos.

## Área piloto

Extensión de trabajo inicial:

- Norte: Scalabrini Ortiz
- Sur: Uriarte
- Este: Costa Rica
- Oeste: Honduras
- BBox WGS84: west `-58.4335`, south `-34.5925`, east `-58.4225`, north `-34.5850`

## Estructura

- `game/`: juego web Three.js + TypeScript.
- `map-generator/`: descarga, inspección y procesamiento geoespacial.
- `docs/`: plan técnico, fuentes y licencias.
- `.github/workflows/`: auditoría automatizada de fuentes en GitHub Actions.

## Desarrollo del juego

Requiere Node.js 20+:

```bash
npm install
npm run dev
```

## Auditoría de datos

El workflow **Palermo source data audit** se ejecuta al actualizar el pipeline geográfico y puede lanzarse manualmente desde GitHub Actions. Descarga fuentes candidatas de CABA y consulta OpenStreetMap; genera informes como artefactos temporales. Los datasets crudos no se versionan en Git.

Ver [map-generator/README.md](map-generator/README.md), [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) y [docs/TECHNICAL_PLAN.md](docs/TECHNICAL_PLAN.md).

## Licencias

Cada fuente conserva sus condiciones de uso y atribución. La combinación de CABA y OpenStreetMap requiere revisar sus licencias antes de distribuir datos derivados o assets del juego.
