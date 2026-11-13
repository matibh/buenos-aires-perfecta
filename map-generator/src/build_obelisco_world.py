"""Build an attributed, 3D-ready city dataset around the Buenos Aires Obelisk."""
from __future__ import annotations
import json, re
from pathlib import Path
import geopandas as gpd
import pandas as pd
import osmnx as ox

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "obelisco-world.json"
BBOX = {"west": -58.3905, "south": -34.6105, "east": -58.3725, "north": -34.5970}
ORIGIN = {"lon": -58.38162, "lat": -34.60376}
OFFICIAL_URL = "https://data.buenosaires.gob.ar/es/dataset/tejido-urbano/resource/9d950b8c-d8cd-4dde-9987-9565313974c8/download"
ox.settings.use_cache = True
ox.settings.log_console = True
ox.settings.timeout = 240
ox.settings.requests_timeout = 240
ox.settings.overpass_rate_limit = True

def number(value):
    if value is None: return None
    match = re.search(r"[-+]?\d+(?:[.,]\d+)?", str(value))
    return float(match.group(0).replace(",", ".")) if match else None

def load_official_heights():
    """Read CABA's official building-height layer, clipped to the Obelisco area."""
    west, south, east, north = (BBOX[k] for k in ("west", "south", "east", "north"))
    try:
        layer = gpd.read_file(OFFICIAL_URL, bbox=(west, south, east, north))
        if layer.crs is None:
            layer = layer.set_crs("EPSG:4326")
        elif layer.crs.to_epsg() != 4326:
            layer = layer.to_crs("EPSG:4326")
        layer = layer[layer.geometry.notna()].copy()
        height_fields = [c for c in layer.columns if re.search(r"altura|height|alt_m|metros", str(c), re.I)]
        floor_fields = [c for c in layer.columns if re.search(r"pisos|niveles|floors|levels", str(c), re.I)]
        if not height_fields and not floor_fields:
            print("CABA Tejido Urbano: no se identificó un campo de altura; OSM fallback retained.")
            return None, [], []
        print(f"CABA Tejido Urbano fields: {list(layer.columns)}")
        print(f"CABA height candidates: {height_fields}; floor candidates: {floor_fields}")
        return layer, height_fields, floor_fields
    except Exception as exc:
        print(f"WARNING: official CABA height layer unavailable ({exc}); OSM height tags and marked estimates will be used.")
        return None, [], []

def official_height_for(geom, layer, height_fields, floor_fields):
    if layer is None or geom is None:
        return None
    try:
        indexes = list(layer.sindex.query(geom, predicate="intersects"))
        best = None
        best_ratio = 0.0
        area = geom.area
        if area <= 0: return None
        for idx in indexes:
            candidate = layer.iloc[idx]
            overlap = geom.intersection(candidate.geometry).area
            ratio = overlap / area
            if ratio > best_ratio:
                best, best_ratio = candidate, ratio
        if best is None or best_ratio < 0.45:
            return None
        props = best
        for field in height_fields:
            value = number(props.get(field))
            if value is not None and 2.5 <= value <= 180:
                return round(value, 1), f"CABA Tejido Urbano · {field} (data through 2021)"
        for field in floor_fields:
            value = number(props.get(field))
            if value is not None and 1 <= value <= 55:
                return round(value * 3.15, 1), f"CABA Tejido Urbano · {field} × 3.15m"
    except Exception as exc:
        print(f"WARNING: official height match failed for one footprint: {exc}")
    return None

def height_for(tags, geom, official):
    official_layer, height_fields, floor_fields = official
    match = official_height_for(geom, official_layer, height_fields, floor_fields)
    if match: return match
    h = number(tags.get("height"))
    if h and 2.5 <= h <= 250: return round(h, 1), "OSM height tag"
    levels = number(tags.get("building:levels") or tags.get("levels"))
    if levels and 1 <= levels <= 80: return round(levels * 3.15, 1), "OSM levels × 3.15m estimate"
    return 9.5, "visual fallback estimate"

def ring(coords):
    return [[round(float(x), 7), round(float(y), 7)] for x, y in coords]

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    official = load_official_heights()
    tags = {
        "building": True,
        "highway": True,
        "leisure": ["park", "garden", "playground"],
        "landuse": ["grass", "forest", "recreation_ground"],
        "natural": ["tree", "wood"],
    }
    west, south, east, north = (BBOX[k] for k in ("west", "south", "east", "north"))
    gdf = ox.features_from_bbox((west, south, east, north), tags=tags)
    gdf = gdf[gdf.geometry.notna()].copy()
    features = []
    counts = {"buildings": 0, "roads": 0, "green": 0, "trees": 0, "official_height_matches": 0}
    for _, row in gdf.iterrows():
        geom = row.geometry
        tags_row = {}
        for key in ("building","height","building:levels","levels","name","highway","leisure","landuse","natural","width","surface","amenity","shop"):
            value = row.get(key)
            if pd.notna(value) and not (isinstance(value, str) and not value.strip()):
                tags_row[key] = value
        building_tag = str(tags_row.get("building", "")).strip().lower()
        is_building = bool(building_tag) and building_tag not in ("no", "false", "0")
        if is_building and geom.geom_type in ("Polygon", "MultiPolygon"):
            h, source = height_for(tags_row, geom, official)
            if source.startswith("CABA Tejido Urbano"): counts["official_height_matches"] += 1
            polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
            polygons = [ring(poly.exterior.coords) for poly in polys if poly.area >= 0.00000000002]
            if polygons:
                features.append({"type":"building","polygons":polygons,"height":h,"heightSource":source,"name":str(tags_row.get("name") or "")[:100]})
                counts["buildings"] += 1
        elif tags_row.get("highway") and geom.geom_type in ("LineString", "MultiLineString"):
            lines = [geom] if geom.geom_type == "LineString" else list(geom.geoms)
            for line in lines:
                if len(line.coords) < 2: continue
                highway = str(tags_row["highway"])
                name = str(tags_row.get("name") or "")
                width = number(tags_row.get("width"))
                if width is None:
                    if "9 de Julio" in name: width = 28
                    elif highway in ("motorway","trunk","primary"): width = 26
                    elif highway in ("secondary","tertiary"): width = 17
                    elif highway in ("residential","unclassified","living_street"): width = 10
                    elif highway in ("pedestrian","footway","path","steps"): width = 4
                    else: width = 8
                features.append({"type":"road","line":ring(line.coords),"width":min(max(width,2),100),"highway":highway,"name":name[:100]})
                counts["roads"] += 1
        elif (tags_row.get("leisure") or tags_row.get("landuse") in ("grass","forest","recreation_ground") or tags_row.get("natural") == "wood") and geom.geom_type in ("Polygon","MultiPolygon"):
            polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
            polygons = [ring(p.exterior.coords) for p in polys if p.area > 0.0000000001]
            if polygons:
                features.append({"type":"green","polygons":polygons,"name":str(tags_row.get("name") or "")[:100]})
                counts["green"] += 1
        elif tags_row.get("natural") == "tree" and geom.geom_type == "Point":
            features.append({"type":"tree","point":[round(geom.x,7),round(geom.y,7)]})
            counts["trees"] += 1

    payload = {
        "source":"OpenStreetMap contributors + Buenos Aires Ciudad, Tejido Urbano",
        "sources":[
            {"name":"OpenStreetMap contributors","license":"ODbL 1.0","attribution":"© OpenStreetMap contributors"},
            {"name":"Buenos Aires Ciudad · Tejido Urbano","license":"CC-BY-2.5-AR","attribution":"Buenos Aires Ciudad · datos hasta 2021","url":"https://data.buenosaires.gob.ar/es/dataset/tejido-urbano"}
        ],
        "license":"ODbL 1.0 + CC-BY-2.5-AR",
        "attribution":"© OpenStreetMap contributors · Buenos Aires Ciudad",
        "retrievedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "bbox":BBOX,"origin":ORIGIN,"counts":counts,"features":features
    }
    OUT.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False),encoding="utf-8")
    print(json.dumps({"output":str(OUT.relative_to(ROOT)),"bytes":OUT.stat().st_size,"counts":counts},ensure_ascii=False))
    if counts["buildings"] < 30 or counts["roads"] < 30:
        raise SystemExit("OSM extract unexpectedly sparse; refusing to publish an incomplete level.")

if __name__ == "__main__": main()
