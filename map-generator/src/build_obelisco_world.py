"""Build a compact, attributed 3D-ready OSM dataset for the Obelisco level."""
from __future__ import annotations
import json, math, re
from pathlib import Path
import osmnx as ox

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "obelisco-world.json"
# About 1.6 x 1.5 km around Plaza de la República: several walkable blocks.
BBOX = {"west": -58.3905, "south": -34.6105, "east": -58.3725, "north": -34.5970}
ORIGIN = {"lon": -58.38162, "lat": -34.60376}
ox.settings.use_cache = True
ox.settings.log_console = True
ox.settings.timeout = 240
ox.settings.requests_timeout = 240
ox.settings.overpass_rate_limit = True

def number(value):
    if value is None: return None
    match = re.search(r"[-+]?\d+(?:[.,]\d+)?", str(value))
    return float(match.group(0).replace(",", ".")) if match else None

def height_for(tags):
    h = number(tags.get("height"))
    if h and 2.5 <= h <= 250: return round(h, 1), "OSM height tag"
    levels = number(tags.get("building:levels") or tags.get("levels"))
    if levels and 1 <= levels <= 80: return round(levels * 3.15, 1), "OSM levels × 3.15m estimate"
    # Conservative visual fallback only; explicitly marked as estimated.
    return 9.5, "visual fallback estimate"

def ring(coords):
    return [[round(float(x), 7), round(float(y), 7)] for x, y in coords]

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
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
    counts = {"buildings": 0, "roads": 0, "green": 0, "trees": 0}
    for _, row in gdf.iterrows():
        geom = row.geometry
        tags_row = {k: row.get(k) for k in ("building","height","building:levels","levels","name","highway","leisure","landuse","natural","width","surface","amenity","shop") if row.get(k) is not None}
        if tags_row.get("building") and geom.geom_type in ("Polygon", "MultiPolygon"):
            h, source = height_for(tags_row)
            polys = [geom] if geom.geom_type == "Polygon" else list(geom.geoms)
            polygons = []
            for poly in polys:
                if poly.area < 0.00000000002: continue
                polygons.append(ring(poly.exterior.coords))
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
        "source":"OpenStreetMap contributors",
        "license":"ODbL 1.0",
        "attribution":"© OpenStreetMap contributors",
        "retrievedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "bbox":BBOX, "origin":ORIGIN, "counts":counts, "features":features
    }
    OUT.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False),encoding="utf-8")
    print(json.dumps({"output":str(OUT.relative_to(ROOT)),"bytes":OUT.stat().st_size,"counts":counts},ensure_ascii=False))
    if counts["buildings"] < 30 or counts["roads"] < 30:
        raise SystemExit("OSM extract unexpectedly sparse; refusing to publish an incomplete level.")

if __name__ == "__main__": main()
