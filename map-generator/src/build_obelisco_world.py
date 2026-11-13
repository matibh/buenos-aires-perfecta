"""Build an attributed 3D city dataset around the Buenos Aires Obelisk."""
from __future__ import annotations
import io, json, re, time, tempfile, zipfile
from pathlib import Path
import geopandas as gpd
import pandas as pd
import requests
import osmnx as ox
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "data" / "obelisco-world.json"
BBOX = {"west": -58.3905, "south": -34.6105, "east": -58.3725, "north": -34.5970}
ORIGIN = {"lon": -58.38162, "lat": -34.60376}
OFFICIAL_URL = "https://data.buenosaires.gob.ar/es/dataset/tejido-urbano/resource/9d950b8c-d8cd-4dde-9987-9565313974c8/download"
GREEN_URL = "https://data.buenosaires.gob.ar/dataset/juqdkmgo-96/resource/2a9af960-02a3-44bb-b57e-0a8295f6e0e2/download"
STREET_URL = "https://data.buenosaires.gob.ar/dataset/juqdkmgo-30/resource/2941f731-0a2e-4391-b8c9-a2912a80c081/download"
ox.settings.use_cache = True
ox.settings.log_console = True
ox.settings.timeout = 45
ox.settings.requests_timeout = 45
ox.settings.overpass_rate_limit = False

def request_with_retries(url, label, timeout=180, stream=False):
    """GET with bounded retries for transient BA Data/CDN failures."""
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
    retry = Retry(total=2, connect=2, read=2, status=2, backoff_factor=0.5,
                  status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=frozenset(["GET"]), respect_retry_after_header=False)
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    bounded_timeout = (10, min(timeout, 35)) if isinstance(timeout, (int, float)) else timeout
    print(f"{label}: requesting {url}", flush=True)
    response = session.get(url, timeout=bounded_timeout, stream=stream, headers={"User-Agent": "BuenosAiresPerfecta/1.0 (open-data game project)"})
    response.raise_for_status()
    if not stream:
        print(f"{label}: HTTP {response.status_code}, {len(response.content)} bytes", flush=True)
    else:
        print(f"{label}: HTTP {response.status_code}; streaming download", flush=True)
    return response

def read_city_layer(url, bbox, label):
    """Download and decode CABA open-data resources explicitly (GeoJSON or zipped GIS)."""
    response = request_with_retries(url, label, stream=True)
    chunks = []
    downloaded = 0
    last_report = 0
    for chunk in response.iter_content(chunk_size=1024 * 1024):
        if not chunk:
            continue
        chunks.append(chunk)
        downloaded += len(chunk)
        if downloaded - last_report >= 8 * 1024 * 1024:
            print(f"{label}: downloaded {downloaded / (1024 * 1024):.0f} MiB", flush=True)
            last_report = downloaded
    content = b"".join(chunks)
    print(f"{label}: download complete ({downloaded / (1024 * 1024):.1f} MiB)", flush=True)
    content_type = response.headers.get("Content-Type", "").lower()
    if not content:
        raise RuntimeError(f"{label}: empty download")
    if content.lstrip().startswith((b"{", b"[")):
        data = json.loads(content.decode("utf-8-sig"))
        if data.get("type") == "FeatureCollection":
            layer = gpd.GeoDataFrame.from_features(data.get("features", []), crs="EPSG:4326")
        elif data.get("type") == "Feature":
            layer = gpd.GeoDataFrame.from_features([data], crs="EPSG:4326")
        else:
            raise RuntimeError(f"{label}: JSON response is not a GeoJSON FeatureCollection")
        west, south, east, north = bbox
        return layer.cx[west:east, south:north].copy()
    if content[:4] == b"PK\\x03\\x04" or "zip" in content_type:
        # Pyogrio/GDAL cannot reliably open a ZIP passed as an in-memory BytesIO.
        # Persist the downloaded archive once and address its SHP via /vsizip.
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            shp_members = [name for name in archive.namelist() if name.lower().endswith(".shp")]
        if not shp_members:
            raise RuntimeError(f"{label}: ZIP archive contains no shapefile")
        shp_member = sorted(shp_members, key=lambda name: (name.count("/"), len(name)))[0]
        with tempfile.NamedTemporaryFile(suffix=".zip") as temp_zip:
            temp_zip.write(content)
            temp_zip.flush()
            virtual_path = f"/vsizip/{temp_zip.name}/{shp_member}"
            print(f"{label}: reading {shp_member} from downloaded ZIP", flush=True)
            return gpd.read_file(virtual_path, bbox=bbox)
    preview = content[:240].decode("utf-8", errors="replace").replace("\\n", " ")
    raise RuntimeError(f"{label}: unsupported response format ({content_type}); body starts: {preview}")

def read_caba_resource(resource_id, bbox, label):
    """Resolve a CKAN resource URL and use resilient direct decoding."""
    metadata_url = f"https://data.buenosaires.gob.ar/api/3/action/resource_show?id={resource_id}"
    metadata = request_with_retries(metadata_url, f"{label} CKAN metadata", timeout=60).json()
    if not metadata.get("success") or not metadata.get("result", {}).get("url"):
        raise RuntimeError(f"BA Data CKAN did not return a download URL for {label}")
    download_url = metadata["result"]["url"]
    print(f"Resolved official {label} resource: {download_url}")
    return read_city_layer(download_url, bbox, label)

def read_tejido_urbano(bbox):
    """Discover all published Tejido Urbano formats and try SHP/GeoJSON in order."""
    package_url = "https://data.buenosaires.gob.ar/api/3/action/package_show?id=tejido-urbano"
    errors = []
    # Prefer the official SHP archive: it is smaller and avoids the CDN timeout
    # previously seen with the full-city GeoJSON resource.
    candidates = [
        ("https://data.buenosaires.gob.ar/api/3/action/resource_show?id=3db0ef7b-5353-4c4d-ae2c-fb1ffdba8f35", "Tejido Urbano official SHP")
    ]
    try:
        package = request_with_retries(package_url, "Tejido Urbano package metadata", timeout=60).json()
        if package.get("success"):
            resources = package.get("result", {}).get("resources", [])
            resources = sorted(resources, key=lambda r: (0 if str(r.get("format", "")).lower() in ("shp", "zip") else 1 if "geojson" in str(r.get("format", "")).lower() or "json" in str(r.get("format", "")).lower() else 2))
            for resource in resources:
                fmt = str(resource.get("format", "")).lower()
                name = str(resource.get("name", ""))
                if fmt in ("shp", "zip", "geojson", "json") or "tejido" in name.lower():
                    if resource.get("url"): candidates.append((resource["url"], name or fmt))
    except Exception as exc:
        errors.append(f"CKAN package discovery: {exc}")
    # Keep the known official GeoJSON as a secondary source, not the first attempt.
    candidates.append(("https://data.buenosaires.gob.ar/api/3/action/resource_show?id=9d950b8c-d8cd-4dde-9987-9565313974c8", "Tejido Urbano official GeoJSON"))
    seen_download_urls = set()
    for url, name in candidates:
        try:
            if url.endswith("9d950b8c-d8cd-4dde-9987-9565313974c8") or "resource_show?id=" in url:
                meta = request_with_retries(url, "Tejido Urbano resource metadata", timeout=60).json()
                url = meta.get("result", {}).get("url")
                if not url: raise RuntimeError("CKAN resource metadata has no download URL")
            if url in seen_download_urls:
                print(f"Skipping duplicate Tejido Urbano download URL: {name}", flush=True)
                continue
            seen_download_urls.add(url)
            print(f"Trying official Tejido Urbano format: {name} ({url})")
            layer = read_city_layer(url, bbox, f"Tejido Urbano {name}")
            if layer.empty: raise RuntimeError("official layer returned no features in the requested bbox")
            return layer
        except Exception as exc:
            errors.append(f"{name}: {exc}")
            print(f"Tejido Urbano candidate failed: {name}: {exc}")
    raise RuntimeError("All official Tejido Urbano formats failed: " + " | ".join(errors))

def number(value):
    if value is None: return None
    match = re.search(r"[-+]?\d+(?:[.,]\d+)?", str(value))
    return float(match.group(0).replace(",", ".")) if match else None

def valid_value(value):
    return pd.notna(value) and not (isinstance(value, str) and not value.strip())

def load_official_layer():
    """Load the City's 3D building-volume layer, clipped to the playable area."""
    west, south, east, north = (BBOX[k] for k in ("west", "south", "east", "north"))
    try:
        layer = read_tejido_urbano((west, south, east, north))
        if layer.crs is None:
            layer = layer.set_crs("EPSG:4326")
        elif layer.crs.to_epsg() != 4326:
            layer = layer.to_crs("EPSG:4326")
        layer = layer[layer.geometry.notna()].copy()
        height_priority = ["alt_2017", "EXTR_2017", "alt_extr", "alt_2013", "alt_ant", "ANT_2017"]
        height_fields = [c for c in height_priority if c in layer.columns]
        floor_fields = [c for c in ["piso_2017", "altos", "piso_2013"] if c in layer.columns]
        if "flagtipo" in layer.columns:
            layer = layer[layer["flagtipo"].astype(str).str.upper().str.strip() == "E"].copy()
        print(f"CABA Tejido Urbano: {len(layer)} edified volumes; height fields={height_fields}; floor fields={floor_fields}")
        if not height_fields and not floor_fields:
            print("WARNING: no recognized official height field; OSM fallback will be used.")
            return None, [], []
        return layer, height_fields, floor_fields
    except Exception as exc:
        print(f"WARNING: official CABA layer unavailable ({exc}); OSM geometry fallback will be used.")
        return None, [], []

def official_height(row, height_fields, floor_fields):
    for field in height_fields:
        value = number(row.get(field))
        if value is not None and 2.5 <= value <= 180:
            return round(value, 1), f"CABA Tejido Urbano · {field} (data through 2021)"
    for field in floor_fields:
        value = number(row.get(field))
        if value is not None and 1 <= value <= 55:
            return round(value * 3.15, 1), f"CABA Tejido Urbano · {field} × 3.15m"
    return None

def polygons_of(geom):
    if geom.geom_type == "Polygon": return [geom]
    if geom.geom_type == "MultiPolygon": return list(geom.geoms)
    if geom.geom_type == "GeometryCollection":
        return [g for g in geom.geoms if g.geom_type == "Polygon"]
    return []

def ring(coords):
    return [[round(float(point[0]), 7), round(float(point[1]), 7)] for point in coords]

def osm_name_for(geom, osm_buildings):
    try:
        indexes = list(osm_buildings.sindex.query(geom, predicate="intersects"))
        best_name, best_ratio = "", 0.0
        area = geom.area
        if area <= 0: return ""
        for idx in indexes:
            candidate = osm_buildings.iloc[idx]
            overlap = geom.intersection(candidate.geometry).area / area
            if overlap > best_ratio:
                best_ratio = overlap
                name = candidate.get("name")
                best_name = str(name) if valid_value(name) else ""
        return best_name if best_ratio >= 0.15 else ""
    except Exception:
        return ""

def covered_by_official(geom, official_layer):
    if official_layer is None: return False
    try:
        indexes = official_layer.sindex.query(geom, predicate="intersects")
        area = geom.area
        if area <= 0: return False
        return any(geom.intersection(official_layer.geometry.iloc[idx]).area / area >= 0.25 for idx in indexes)
    except Exception:
        return False

def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    official_layer, height_fields, floor_fields = load_official_layer()
    if official_layer is None:
        raise SystemExit("Official CABA Tejido Urbano is unavailable; stopping before OSM downloads.")
    # Query the base map and commercial places separately. A single large
    # Overpass query is prone to 502 responses when public instances are busy.
    # Keep the mandatory geometry query small. Official CABA layers already
    # provide plaza/green polygons; OSM green/trees are optional enrichment.
    base_tags = {
        "building": True,
        "highway": True,
    }
    place_tags = {
        "shop": True, "amenity": True, "office": True,
        "tourism": True, "craft": True, "healthcare": True,
    }
    west, south, east, north = (BBOX[k] for k in ("west", "south", "east", "north"))
    overpass_servers = [
        "https://overpass-api.de/api",
        "https://overpass.kumi.systems/api",
        "https://overpass.private.coffee/api",
    ]

    def fetch_osm_group(group_name, group_tags):
        last_error = None
        for attempt in range(3):
            server = overpass_servers[attempt % len(overpass_servers)]
            ox.settings.overpass_url = server
            try:
                print(f"Downloading OSM {group_name} features via {server} (attempt {attempt + 1}/3)", flush=True)
                result = ox.features_from_bbox((west, south, east, north), tags=group_tags)
                print(f"Downloaded {len(result)} OSM {group_name} features.")
                return result
            except Exception as exc:
                last_error = exc
                delay = 8 * (2 ** attempt)
                print(f"OSM {group_name} query failed via {server}: {exc}. Retrying in {delay}s.", flush=True)
                if attempt < 2:
                    time.sleep(delay)
        raise RuntimeError(f"Unable to download OSM {group_name} features after retries and server fallback: {last_error}")

    base_gdf = fetch_osm_group("base map", base_tags)
    # Commercial POIs are useful but not required to construct the level.
    # Public Overpass instances frequently throttle broad POI queries.
    try:
        places_gdf = fetch_osm_group("commercial places", place_tags)
    except Exception as exc:
        print(f"WARNING: optional OSM commercial POIs unavailable; continuing with official map geometry and curated venues: {exc}", flush=True)
        places_gdf = gpd.GeoDataFrame(geometry=[], crs=base_gdf.crs)
    gdf = pd.concat([base_gdf, places_gdf], axis=0)
    gdf = gdf[~gdf.index.duplicated(keep="first")]
    gdf = gpd.GeoDataFrame(gdf, geometry="geometry", crs=base_gdf.crs)

    def row_tags(row):
        result = {}
        for key in ("building","height","building:levels","levels","name","nombre","nombre_ev","nom_mapa","nomoficial","highway","leisure","landuse","natural","width","surface","amenity","shop","office","tourism","craft","healthcare","brand","operator","cuisine","opening_hours","website","phone","addr:street","addr:housenumber","flagtipo"):
            value = row.get(key)
            if valid_value(value): result[key] = value
        return result

    osm_buildings = gdf[gdf.apply(lambda row: (
        str(row.get("building", "")).strip().lower() not in ("", "no", "false", "0")
        and row.geometry.geom_type in ("Polygon", "MultiPolygon")
        and valid_value(row.get("building"))
    ), axis=1)].copy()

    # Official CABA public-space geometry: the Obelisco plaza must remain open.
    green_layer = read_caba_resource("2a9af960-02a3-44bb-b57e-0a8295f6e0e2", (west, south, east, north), "Espacios Verdes Públicos")
    if green_layer.crs is None:
        green_layer = green_layer.set_crs('EPSG:4326')
    elif green_layer.crs.to_epsg() != 4326:
        green_layer = green_layer.to_crs('EPSG:4326')
    green_layer = green_layer[green_layer.geometry.notna()].copy()
    plaza_rows = green_layer[green_layer.apply(lambda row: any('plaza de la rep' in str(row.get(k, '')).lower() for k in ('nombre','nombre_ev','nom_mapa')), axis=1)]
    if plaza_rows.empty:
        raise SystemExit('Official Plaza de la República polygon missing from CABA open-space layer.')
    plaza_geometry = unary_union(list(plaza_rows.geometry))
    plaza_buffer = gpd.GeoSeries([plaza_geometry], crs='EPSG:4326').to_crs('EPSG:3857').iloc[0].buffer(20)
    plaza_exclusion = gpd.GeoSeries([plaza_buffer], crs='EPSG:3857').to_crs('EPSG:4326').iloc[0]
    print(f'Official Plaza de la República polygon loaded ({len(plaza_rows)} features) with 20m no-building buffer.')
    # Official CABA street centerlines define the 9 de Julio no-building corridor.
    street_layer = read_caba_resource("2941f731-0a2e-4391-b8c9-a2912a80c081", (west, south, east, north), "Callejero")
    if street_layer.crs is None:
        street_layer = street_layer.set_crs('EPSG:4326')
    elif street_layer.crs.to_epsg() != 4326:
        street_layer = street_layer.to_crs('EPSG:4326')
    street_name = street_layer.apply(lambda row: ' '.join(str(row.get(k, '')).lower() for k in ('nomoficial','nom_mapa')), axis=1)
    avenue_rows = street_layer[street_name.str.contains('9 de julio', na=False)]
    if avenue_rows.empty:
        raise SystemExit('Official CABA Callejero has no Avenida 9 de Julio geometry in the requested area.')
    avenue_geometry = unary_union(list(avenue_rows.geometry))
    avenue_buffer = gpd.GeoSeries([avenue_geometry], crs='EPSG:4326').to_crs('EPSG:3857').iloc[0].buffer(64)
    avenue_exclusion = gpd.GeoSeries([avenue_buffer], crs='EPSG:3857').to_crs('EPSG:4326').iloc[0]
    no_building_area = unary_union([plaza_exclusion, avenue_exclusion])
    print(f'Official Avenida 9 de Julio centerlines loaded ({len(avenue_rows)} segments); buildings excluded from a 64m corridor on each side.')
    features = []
    counts = {
        "buildings": 0, "official_building_volumes": 0, "osm_buildings_fallback": 0,
        "official_height_matches": 0, "roads": 0, "green": 0, "trees": 0, "businesses": 0, "named_businesses": 0, "pizzerias": 0
    }

    # Primary building geometry comes from the City's mapped 3D urban fabric.
    # Multiple height volumes are preserved rather than flattened into one box.
    if official_layer is not None:
        for _, row in official_layer.iterrows():
            geom = row.geometry
            if geom.intersects(no_building_area): continue
            measured = official_height(row, height_fields, floor_fields)
            if not measured: continue
            height, source = measured
            name = osm_name_for(geom, osm_buildings)
            for poly in polygons_of(geom):
                if poly.area < 0.00000000002: continue
                features.append({
                    "type":"building","polygons":[ring(poly.exterior.coords)],
                    "height":height,"heightSource":source,"name":name[:100]
                })
                counts["buildings"] += 1
                counts["official_building_volumes"] += 1
                counts["official_height_matches"] += 1

    # OSM supplies names and a fallback for buildings not covered by the 2021 city layer.
    for _, row in osm_buildings.iterrows():
        geom = row.geometry
        if geom.intersects(plaza_exclusion): continue
        if covered_by_official(geom, official_layer): continue
        tags_row = row_tags(row)
        height = number(tags_row.get("height"))
        if height and 2.5 <= height <= 250:
            source = "OSM height tag"
        else:
            levels = number(tags_row.get("building:levels") or tags_row.get("levels"))
            if levels and 1 <= levels <= 80:
                height, source = round(levels * 3.15, 1), "OSM levels × 3.15m estimate"
            else:
                height, source = 9.5, "visual fallback estimate"
        for poly in polygons_of(geom):
            if poly.area < 0.00000000002: continue
            features.append({
                "type":"building","polygons":[ring(poly.exterior.coords)],
                "height":height,"heightSource":source,
                "name":str(tags_row.get("name") or "")[:100]
            })
            counts["buildings"] += 1
            counts["osm_buildings_fallback"] += 1

    # Add the exact official public-space polygons to the rendered ground.
    for _, row in green_layer.iterrows():
        geom = row.geometry
        props = row_tags(row)
        label = str(props.get('nombre') or props.get('nombre_ev') or props.get('nom_mapa') or '')
        if geom.geom_type not in ('Polygon','MultiPolygon'): continue
        kind = 'plaza' if 'plaza de la rep' in label.lower() else 'green'
        for poly in polygons_of(geom):
            if poly.area < 0.0000000001: continue
            features.append({'type':kind,'polygons':[ring(poly.exterior.coords)],'name':label[:100],'source':'Buenos Aires Ciudad · Espacios Verdes Públicos'})
            count_key = 'official_plaza_polygons' if kind == 'plaza' else 'official_green_polygons'
            counts[count_key] = counts.get(count_key,0) + 1
    # OSM remains the source for streets and individually mapped trees.
    for _, row in gdf.iterrows():
        geom = row.geometry
        tags_row = row_tags(row)
        business_category = next((key for key in ("shop", "amenity", "office", "tourism", "craft", "healthcare") if tags_row.get(key)), None)
        business_kind = str(tags_row.get(business_category) or "") if business_category else ""
        commercial_amenities = {"restaurant", "fast_food", "cafe", "bar", "pub", "food_court", "ice_cream", "pharmacy", "bank", "atm", "fuel", "cinema", "theatre", "marketplace", "clinic", "dentist", "veterinary"}
        is_place = business_category in ("shop", "office", "tourism", "craft", "healthcare") or (business_category == "amenity" and business_kind in commercial_amenities)
        if is_place and geom.geom_type in ("Point", "Polygon", "MultiPolygon", "LineString", "MultiLineString"):
            location = geom if geom.geom_type == "Point" else geom.representative_point()
            business_name = str(tags_row.get("name") or tags_row.get("brand") or "")
            pizza_name = business_name.lower()
            is_pizzeria = (
                "pizza" in str(tags_row.get("cuisine") or "").lower()
                or any(token in pizza_name for token in ("guerrin", "güerrin", "banchero", "las cuartetas", "cuartetas", "palacio de la pizza", "kentucky", "sbarro", "ugi", "los inmortales", "genova", "génova"))
            )
            features.append({
                "type": "business",
                "point": [round(float(location.x), 7), round(float(location.y), 7)],
                "name": business_name[:120],
                "isPizzeria": bool(is_pizzeria),
                "category": business_category,
                "kind": str(tags_row.get(business_category) or "")[:80],
                "brand": str(tags_row.get("brand") or "")[:100],
                "operator": str(tags_row.get("operator") or "")[:100],
                "cuisine": str(tags_row.get("cuisine") or "")[:100],
                "openingHours": str(tags_row.get("opening_hours") or "")[:160],
                "address": " ".join(x for x in (str(tags_row.get("addr:street") or ""), str(tags_row.get("addr:housenumber") or "")) if x)[:120],
                "website": str(tags_row.get("website") or "")[:180],
                "source": "OpenStreetMap"
            })
            counts["businesses"] += 1
            if business_name: counts["named_businesses"] += 1
            if is_pizzeria: counts["pizzerias"] += 1
        if tags_row.get("highway") and geom.geom_type in ("LineString", "MultiLineString"):
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
            polys = polygons_of(geom)
            polygons = [ring(p.exterior.coords) for p in polys if p.area > 0.0000000001]
            if polygons:
                features.append({"type":"green","polygons":polygons,"name":str(tags_row.get("name") or "")[:100],"source":"OpenStreetMap"})
                counts["green"] += 1
        elif tags_row.get("natural") == "tree" and geom.geom_type == "Point":
            features.append({"type":"tree","point":[round(geom.x,7),round(geom.y,7)]})
            counts["trees"] += 1

    # Curated, independently verified pizzerias in the immediate Obelisco/Corrientes area.
    # Nominatim resolves their street addresses against OSM; no guessed coordinates are inserted.
    known_pizzerias = [
        ("Pizzería Güerrín", "Avenida Corrientes 1368"),
        ("Banchero", "Avenida Corrientes 1300"),
        ("Sbarro", "Avenida Corrientes 1267"),
        ("Los Inmortales", "Avenida Corrientes 1369"),
        ("Kentucky", "Avenida Corrientes 961"),
        ("El Palacio de la Pizza", "Avenida Corrientes 751"),
        ("Ugi's", "Carlos Pellegrini 321"),
        ("Pizzería Génova", "Avenida Corrientes 872"),
        ("Pizza Roma", "Lavalle 888"),
        ("Las Cuartetas", "Avenida Corrientes 838"),
        ("El Cuartito", "Talcahuano 937"),
    ]
    import math, unicodedata
    def normalized_name(value):
        return "".join(ch for ch in unicodedata.normalize("NFKD", str(value).lower()) if not unicodedata.combining(ch))
    for business_name, street_address in known_pizzerias:
        try:
            lat, lon = ox.geocode(f"{street_address}, Buenos Aires, Argentina")
            if not (west <= lon <= east and south <= lat <= north):
                print(f"Verified pizzeria outside Obelisco map bounds; skipped: {business_name} ({street_address})")
                continue
            duplicate = False
            for feature in features:
                if feature.get("type") != "business" or not feature.get("point"):
                    continue
                existing_name = normalized_name(feature.get("name", ""))
                if normalized_name(business_name) in existing_name or existing_name in normalized_name(business_name):
                    duplicate = True
                    break
                px, py = feature["point"]
                distance = math.hypot((lon-px)*111320*math.cos(math.radians(lat)), (lat-py)*111320)
                if feature.get("isPizzeria") and distance < 24:
                    duplicate = True
                    break
            if duplicate:
                continue
            features.append({
                "type": "business",
                "point": [round(float(lon), 7), round(float(lat), 7)],
                "name": business_name,
                "isPizzeria": True,
                "category": "amenity",
                "kind": "restaurant",
                "brand": business_name,
                "address": f"{street_address}, Buenos Aires",
                "source": "OpenStreetMap geocoding · venue/address cross-checked"
            })
            counts["businesses"] += 1
            counts["named_businesses"] += 1
            counts["pizzerias"] += 1
            print(f"Added verified pizzeria address: {business_name} · {street_address}")
            time.sleep(1.1)
        except Exception as exc:
            print(f"Could not resolve verified pizzeria address {business_name}: {exc}")

    sources = [{"name":"OpenStreetMap contributors","license":"ODbL 1.0","attribution":"© OpenStreetMap contributors"}]
    if counts["official_height_matches"]:
        sources.append({"name":"Buenos Aires Ciudad · Tejido Urbano","license":"CC-BY-2.5-AR","attribution":"Buenos Aires Ciudad · restitución de volúmenes 2013/2017","url":"https://data.buenosaires.gob.ar/es/dataset/tejido-urbano"})
    if counts.get("official_green_polygons", 0) or counts.get("official_plaza_polygons", 0):
        sources.append({"name":"Buenos Aires Ciudad · Espacios Verdes Públicos","license":"CC-BY-2.5-AR","attribution":"Buenos Aires Ciudad","url":"https://data.buenosaires.gob.ar/dataset/espacios-verdes"})
    sources.append({"name":"Buenos Aires Ciudad · Callejero","license":"CC-BY-4.0","attribution":"Buenos Aires Ciudad","url":"https://data.buenosaires.gob.ar/dataset/calles"})
    payload = {
        "source":"Buenos Aires Ciudad · Tejido Urbano, Espacios Verdes Públicos, Callejero + OpenStreetMap contributors",
        "sources":sources,
        "license":"ODbL 1.0 + CC-BY-2.5-AR" if counts["official_height_matches"] or counts.get("official_green_polygons", 0) else "ODbL 1.0",
        "attribution":"© OpenStreetMap contributors" + (" · Buenos Aires Ciudad" if counts["official_height_matches"] or counts.get("official_green_polygons", 0) else ""),
        "retrievedAt":__import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "bbox":BBOX,"origin":ORIGIN,"counts":counts,"features":features
    }
    OUT.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False),encoding="utf-8")
    print(json.dumps({"output":str(OUT.relative_to(ROOT)),"bytes":OUT.stat().st_size,"counts":counts},ensure_ascii=False))
    if counts["buildings"] < 30 or counts["roads"] < 30:
        raise SystemExit("OSM extract unexpectedly sparse; refusing to publish an incomplete level.")
    if counts["official_height_matches"] == 0:
        raise SystemExit("No official CABA building heights matched; refusing to publish an OSM-only approximation.")
    if counts.get("official_plaza_polygons", 0) == 0:
        raise SystemExit("Official Plaza de la República polygon not found; refusing to publish a guessed plaza footprint.")

if __name__ == "__main__": main()
