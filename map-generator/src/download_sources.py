"""Download candidate CABA datasets and OSM features for the configured pilot area.

Raw source files are kept out of git. Every download is recorded with URL,
timestamp, byte size and outcome so the resulting audit remains traceable.
"""
from __future__ import annotations
import argparse, json, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen
import geopandas as gpd
import osmnx as ox

ROOT = Path(__file__).resolve().parents[1]
CABA_RESOURCES = {
    "caba_tejido_urbano": {
        "url": "https://data.buenosaires.gob.ar/en/dataset/tejido-urbano/resource/9d950b8c-d8cd-4dde-9987-9565313974c8/download",
        "path": "data/raw/caba/tejido_urbano.geojson",
    },
    "caba_parcelas": {
        "url": "https://data.buenosaires.gob.ar/el/dataset/parcelas/resource/8d8ffe66-9eb9-4f12-8f23-e1586a2d888d/download",
        "path": "data/raw/caba/parcelas.geojson",
    },
}

def download(url: str, destination: Path) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    request = Request(url, headers={"User-Agent": "BuenosAiresPerfecta-DataAudit/0.1"})
    last_error = None
    for attempt in range(3):
        try:
            with urlopen(request, timeout=180) as response, destination.open("wb") as output:
                while chunk := response.read(1024 * 1024):
                    output.write(chunk)
            sample = gpd.read_file(destination, rows=1)
            return {"status":"downloaded","url":url,"bytes":destination.stat().st_size,"sample_readable":not sample.empty}
        except Exception as exc:
            last_error = str(exc)
            destination.unlink(missing_ok=True)
            if attempt < 2: time.sleep(3 * (attempt + 1))
    return {"status":"error","url":url,"error":last_error}

def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config",default="config/palermo.json")
    args=parser.parse_args()
    config=json.loads((ROOT/args.config).read_text(encoding="utf-8"))
    result={"retrieved_at_utc":datetime.now(timezone.utc).isoformat(),"district":config["district"],
            "bbox_wgs84":config["bbox_wgs84"],"sources":{}}
    for source_id, source in CABA_RESOURCES.items():
        result["sources"][source_id]=download(source["url"],ROOT/source["path"])

    bbox=config["bbox_wgs84"]
    bounds=(bbox["west"],bbox["south"],bbox["east"],bbox["north"])
    osm_dir=ROOT/"data/raw/osm"
    osm_dir.mkdir(parents=True,exist_ok=True)
    try:
        tags={"building":True,"leisure":["park","garden","playground"],
              "natural":["tree","wood"],"amenity":True,"shop":True}
        features=ox.features_from_bbox(bounds,tags=tags)
        path=osm_dir/"palermo_features.geojson"
        features.to_file(path,driver="GeoJSON")
        result["sources"]["osm_features"]={"status":"downloaded","path":str(path.relative_to(ROOT)),
            "features":len(features),"geometry_types":sorted(map(str,features.geometry.geom_type.dropna().unique()))}
    except Exception as exc:
        result["sources"]["osm_features"]={"status":"error","error":str(exc)}
    try:
        graph=ox.graph_from_bbox(bounds,network_type="all",simplify=True,retain_all=True)
        _,edges=ox.graph_to_gdfs(graph)
        path=osm_dir/"palermo_roads.geojson"
        edges.to_file(path,driver="GeoJSON")
        result["sources"]["osm_roads"]={"status":"downloaded","path":str(path.relative_to(ROOT)),"features":len(edges)}
    except Exception as exc:
        result["sources"]["osm_roads"]={"status":"error","error":str(exc)}

    metadata=ROOT/"data/source-metadata.json"
    metadata.parent.mkdir(parents=True,exist_ok=True)
    metadata.write_text(json.dumps(result,indent=2,ensure_ascii=False),encoding="utf-8")
    print(json.dumps(result,indent=2,ensure_ascii=False))
    failed=[name for name,item in result["sources"].items() if item.get("status")!="downloaded"]
    if failed: raise SystemExit("Source download failures: "+", ".join(failed))

if __name__=="__main__": main()
