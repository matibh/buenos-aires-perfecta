# Buenos Aires Perfecta

Un mundo 3D jugable ambientado en Buenos Aires, construido a partir de datos geográficos abiertos y verificables.

## Alcance actual

El único sector en desarrollo es el **Obelisco y su entorno inmediato**, incluyendo Plaza de la República, la Avenida 9 de Julio y las calles circundantes.

## Estado del proyecto

- Base web creada con Three.js, TypeScript y Vite.
- Generador geoespacial específico para construir el mundo del Obelisco.
- Integración de fuentes oficiales de CABA y OpenStreetMap, con validaciones para evitar publicar geometría incompleta o aproximaciones no verificadas.
- La fidelidad de edificios, alturas, comercios y mobiliario se valida mediante auditorías de datos y pruebas visuales.

## Estructura

- `game/`: juego web Three.js + TypeScript.
- `map-generator/`: construcción del entorno geográfico del Obelisco.
- `docs/`: plan técnico, fuentes y criterios de fidelidad.
- `.github/workflows/`: construcción y despliegue del mundo del Obelisco.

## Desarrollo

Requiere Node.js 20+:

```bash
npm install
npm run dev
```

## Construcción del mundo

El workflow **Build and deploy Buenos Aires Perfecta** ejecuta el generador geoespacial del Obelisco cuando cambian sus fuentes o su implementación. La publicación se realiza únicamente después de superar las validaciones y la compilación del juego.

## Fuentes y licencias

Cada fuente conserva sus condiciones de uso y atribución. La combinación de datos oficiales de CABA y OpenStreetMap requiere respetar sus respectivas licencias antes de distribuir datos derivados o assets del juego.
