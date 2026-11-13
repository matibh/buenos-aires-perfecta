"""Inspect local geospatial inputs and write a machine-readable report."""
import argparse, json
from pathlib import Path
import geopandas as gpd
ROOT=Path(__file__).resolve().parents[1]
def inspect(source):
    path=ROOT/source["path"]
    if not path.exists(): return {"id":source["id"],"status":"missing","path":str(path)}
    try:
        gdf=gpd.read_file(path)
        return {"id":source["id"],"status":"ok","features":len(gdf),"crs":str(gdf.crs) if gdf.crs else None,
          "geometry_types":sorted(map(str,gdf.geometry.geom_type.dropna().unique())),
          "invalid_geometries":int((~gdf.geometry.is_valid).sum()),"null_geometries":int(gdf.geometry.isna().sum()),
          "bounds_in_source_crs":gdf.total_bounds.tolist() if not gdf.empty else None,"columns":list(gdf.columns)}
    except Exception as exc: return {"id":source["id"],"status":"error","error":str(exc)}
def main():
    p=argparse.ArgumentParser();p.add_argument("--config",default="config/palermo.json");a=p.parse_args()
    cfg=json.loads((ROOT/a.config).read_text(encoding="utf-8"))
    report={"district":cfg["district"],"bbox_wgs84":cfg["bbox_wgs84"],"inputs":[inspect(s) for s in cfg["sources"]]}
    out=ROOT/"reports"/"source_inspection.json";out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8");print(json.dumps(report,indent=2,ensure_ascii=False))
if __name__=="__main__":main()
