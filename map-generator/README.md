# Generador geoespacial del Obelisco

Pipeline geoespacial dedicado exclusivamente a construir el entorno jugable del Obelisco de Buenos Aires.

## Alcance

- Plaza de la República y el Obelisco.
- Avenida 9 de Julio y calles conectadas del área de trabajo.
- Edificios, alturas, espacios verdes, árboles y comercios cuando las fuentes permiten verificarlos.

## Ejecución

Requiere Python 3.11+ y las dependencias de `requirements.txt`.

Desde la raíz del repositorio:

```bash
pip install -r map-generator/requirements.txt
python map-generator/src/build_obelisco_world.py
```

El workflow de GitHub Actions ejecuta este generador y publica el juego únicamente si las validaciones de datos y la compilación finalizan correctamente.

## Criterios de datos

- Priorizar geometrías y alturas oficiales de CABA.
- Usar OpenStreetMap como fuente complementaria, identificando claramente los elementos que no cuentan con respaldo oficial.
- No sustituir silenciosamente datos oficiales faltantes por una aproximación OSM-only.
- Mantener trazabilidad de las fuentes, sus licencias y las transformaciones aplicadas.
