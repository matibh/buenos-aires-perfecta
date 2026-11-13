# Map generator
Pipeline geoespacial para el área piloto de Palermo Soho.

Python 3.11+ recomendado. Instalar dependencias con `pip install -r requirements.txt` y ejecutar `python -m src.inspect_sources --config config/palermo.json`.

El inspector valida únicamente los archivos que existan en `data/raw/`. La adquisición, inspección de licencias, reproyección y recorte serán pasos separados. No se incluyen todavía datasets ni geometrías reales.
