#!/usr/bin/env python3
"""
BodyJ4You Amazon Virtual Bundle report builder.

Takes an Amazon "virtual bundle" sales export CSV and produces:
  1. an .xlsx bundle report (full BUNDLES master left-joined, sorted by units,
     grand-total row) matching the historical "Bundle Report - MM.DD.YY" tabs.
  2. a self-contained .html dashboard (top sellers above a units threshold,
     product photos embedded from the reference-image library, each card
     linking to its Amazon listing).

No network and no LLM. Pure Python. Run it headless from a terminal / API.

Logic (locked, reverse-engineered from the historical workbook):
  - aggregate export rows by BUNDLE_ASIN: Units = sum(BUNDLES_SOLD),
    Sales = sum(TOTAL_SALES)
  - left-join every bundle in the BUNDLES master for SKU / MAIN / COMP 1 / COMP 2
  - Avg Price = Sales / Units
  - stable sort by Units descending (zero-sales bundles fall to the bottom in
    master order)
  - grand-total row (sum of Sales)
  - ASINs absent from the master (and from config new_asin_map) are dropped and
    listed in the console summary and an "Unmapped (dropped)" xlsx tab

Usage:
    python build_report.py EXPORT.csv [--outdir DIR] [--label "Mon D - Mon D, YYYY"]
                                      [--date MM.DD.YY] [--threshold N]
    python build_report.py --help

The CSV must have columns: DATE, BUNDLE_ASIN, TITLE, IS_VIRTUAL_MULTIPACK,
BUNDLES_SOLD, TOTAL_SALES  (extra columns are ignored).
"""

import argparse
import base64
import csv
import datetime as _dt
import io
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def load_config(path=None):
    cfg_path = path or os.path.join(HERE, "config.json")
    with open(cfg_path, encoding="utf-8") as f:
        return json.load(f)


def load_master(cfg):
    """Return (ordered_list, map). Each entry: [asin, sku, main, comp1, comp2]."""
    import openpyxl

    wb = openpyxl.load_workbook(
        os.path.join(HERE, cfg["master_file"]), data_only=True, read_only=True
    )
    ws = wb[cfg["master_sheet"]]
    master, mmap = [], {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        asin = row[0]
        if not asin:
            continue
        asin = str(asin).strip()
        rec = [asin, row[1], row[2], row[3], row[4]]
        master.append(rec)
        mmap[asin] = rec
    # append config new_asin_map entries (SKU only, components unknown)
    for asin, sku in cfg.get("new_asin_map", {}).items():
        asin = asin.strip()
        if asin in mmap:
            continue
        rec = [asin, sku, None, None, None]
        master.append(rec)
        mmap[asin] = rec
    return master, mmap


def read_export(csv_path):
    """Aggregate the Amazon export by BUNDLE_ASIN."""
    agg = defaultdict(lambda: [0, 0.0])  # asin -> [units, sales]
    titles = {}
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"BUNDLE_ASIN", "BUNDLES_SOLD", "TOTAL_SALES"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise SystemExit(
                f"ERROR: export CSV is missing columns: {', '.join(sorted(missing))}\n"
                f"Found columns: {', '.join(reader.fieldnames or [])}"
            )
        dates = []
        for row in reader:
            asin = (row.get("BUNDLE_ASIN") or "").strip()
            if not asin:
                continue
            try:
                u = int(float(row.get("BUNDLES_SOLD") or 0))
            except ValueError:
                u = 0
            try:
                s = float(row.get("TOTAL_SALES") or 0)
            except ValueError:
                s = 0.0
            agg[asin][0] += u
            agg[asin][1] += s
            titles.setdefault(asin, (row.get("TITLE") or "").strip())
            d = (row.get("DATE") or "").strip()
            if d:
                dates.append(d)
    date_range = (min(dates), max(dates)) if dates else (None, None)
    return agg, titles, date_range


def _fmt_date_label(date_range):
    """'2026-06-17','2026-09-14' -> 'Jun 17 - Sep 14, 2026'."""
    lo, hi = date_range
    if not lo or not hi:
        return ""
    try:
        d1 = _dt.date.fromisoformat(lo)
        d2 = _dt.date.fromisoformat(hi)
    except ValueError:
        return f"{lo} to {hi}"
    if d1.year == d2.year:
        return f"{d1.strftime('%b %-d')} - {d2.strftime('%b %-d, %Y')}"
    return f"{d1.strftime('%b %-d, %Y')} - {d2.strftime('%b %-d, %Y')}"


def build_rows(master, agg):
    """Full master, left-joined, stable-sorted by units desc (master order tiebreak)."""
    rows = []
    for i, rec in enumerate(master):
        u, s = agg.get(rec[0], [0, 0.0])
        rows.append((rec, u, round(s, 2), i))
    rows.sort(key=lambda x: (-x[1], x[3]))
    return rows


def write_xlsx(rows, unmapped, agg, titles, new_map, out_path, tab_name):
    import openpyxl
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    HF = PatternFill("solid", fgColor="1F4E78")
    HFO = Font(name="Arial", bold=True, color="FFFFFF", size=11)
    F = Font(name="Arial", size=10)
    FB = Font(name="Arial", size=10, bold=True)
    NEW = PatternFill("solid", fgColor="FFF2CC")
    thin = Side(style="thin", color="D9D9D9")
    BD = Border(left=thin, right=thin, top=thin, bottom=thin)
    TOT = PatternFill("solid", fgColor="DDEBF7")

    wb = Workbook()
    ws = wb.active
    ws.title = tab_name[:31]
    ws.append(["BUNDLE_ASIN", "SKU", "MAIN", "COMP 1", "COMP 2", "Units", "Sales", "Avg Price"])
    for c in range(1, 9):
        x = ws.cell(1, c)
        x.fill, x.font, x.border = HF, HFO, BD
        x.alignment = Alignment(horizontal="center", vertical="center")

    r = 2
    for rec, u, s, _ in rows:
        is_new = rec[0] in new_map
        for c, v in enumerate(rec, 1):
            ws.cell(r, c, v)
        ws.cell(r, 6, u)
        ws.cell(r, 7, s)
        if u > 0:
            ws.cell(r, 8, f"=G{r}/F{r}")
        for c in range(1, 9):
            ws.cell(r, c).font = F
            ws.cell(r, c).border = BD
            if is_new:
                ws.cell(r, c).fill = NEW
        ws.cell(r, 6).number_format = "#,##0"
        ws.cell(r, 7).number_format = "#,##0.00"
        ws.cell(r, 8).number_format = "#,##0.00"
        r += 1
    last = r - 1
    ws.cell(r, 5, "TOTAL")
    ws.cell(r, 6, f"=SUM(F2:F{last})")
    ws.cell(r, 7, f"=SUM(G2:G{last})")
    for c in range(1, 9):
        ws.cell(r, c).fill = TOT
        if c in (5, 6, 7):
            ws.cell(r, c).font = FB
    ws.cell(r, 6).number_format = "#,##0"
    ws.cell(r, 7).number_format = "#,##0.00"
    ws.freeze_panes = "A2"
    for i, w in enumerate([14, 9, 16, 16, 16, 8, 11, 11], 1):
        ws.column_dimensions[chr(64 + i)].width = w

    if unmapped:
        ws2 = wb.create_sheet("Unmapped (dropped)")
        ws2.append(["BUNDLE_ASIN", "Units", "Sales", "TITLE", "NOTE"])
        for c in range(1, 6):
            x = ws2.cell(1, c)
            x.fill = PatternFill("solid", fgColor="C00000")
            x.font = HFO
            x.border = BD
        rr = 2
        for a in sorted(unmapped, key=lambda x: -agg[x][0]):
            ws2.cell(rr, 1, a)
            ws2.cell(rr, 2, agg[a][0])
            ws2.cell(rr, 3, round(agg[a][1], 2))
            ws2.cell(rr, 4, titles.get(a, ""))
            ws2.cell(rr, 5, "Not in master. Add ASIN:SKU to config.json new_asin_map.")
            for c in range(1, 6):
                ws2.cell(rr, c).font = F
                ws2.cell(rr, c).border = BD
            ws2.cell(rr, 3).number_format = "#,##0.00"
            rr += 1
        for w, col in zip([14, 8, 11, 70, 52], "ABCDE"):
            ws2.column_dimensions[col].width = w
        ws2.freeze_panes = "A2"

    wb.save(out_path)


def build_images(cfg):
    """ASIN -> data-URI, from reference_images/SKU_ASIN.png."""
    try:
        from PIL import Image
    except ImportError:
        print("  (Pillow not installed: HTML will show category tiles, no photos)")
        return {}
    d = os.path.join(HERE, cfg["reference_images_dir"])
    if not os.path.isdir(d):
        return {}
    mx = cfg.get("image_max_px", 560)
    q = cfg.get("image_jpeg_quality", 82)
    images = {}
    for fn in os.listdir(d):
        if not fn.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            continue
        asin = os.path.splitext(fn)[0].rsplit("_", 1)[-1]
        try:
            im = Image.open(os.path.join(d, fn)).convert("RGB")
            im.thumbnail((mx, mx))
            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=q, optimize=True)
            images[asin] = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception as e:
            print(f"  (skipped image {fn}: {e})")
    return images


OS_URL = "https://bodyj4you-ceo-dashboard.netlify.app/os/"


def os_assets(cfg):
    """BodyJ4You OS design language (os.css + os.js), inlined so the HTML stays self-contained.
    Local copy first (~/bodyj4you-os/site/os, or config os_dir), else the hub's live copy."""
    out = []
    d = os.path.expanduser(cfg.get("os_dir", "~/bodyj4you-os/site/os"))
    for name in ("os.css", "os.js"):
        p = os.path.join(d, name)
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as f:
                out.append(f.read())
            continue
        try:
            import urllib.request
            out.append(urllib.request.urlopen(OS_URL + name, timeout=30).read().decode("utf-8"))
        except Exception as e:
            print(f"  (OS design file {name} not found locally or online: {e}; page will be unstyled)")
            out.append("")
    return out


def write_html(data, images, date_label, out_path, cfg, date_end=""):
    with open(os.path.join(HERE, cfg["template_file"]), encoding="utf-8") as f:
        html = f.read()
    css, js = os_assets(cfg)
    html = html.replace("__OSCSS__", css.replace("</style", "<\\/style"))
    html = html.replace("__OSJS__", js.replace("</script", "<\\/script"))
    html = html.replace("__DATA__", json.dumps(data))
    html = html.replace("__IMAGES__", json.dumps(images))
    html = html.replace("__DATELABEL__", date_label or "")
    html = html.replace("__DATAEND__", date_end or "")
    html = html.replace("__THRESHOLD__", str(int(cfg.get("noticeable_threshold", 3))))
    html = html.replace("__SOLDCOUNT__", str(len(data)))
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


def main():
    ap = argparse.ArgumentParser(description="Build the BodyJ4You bundle report from an Amazon export CSV.")
    ap.add_argument("csv", help="Amazon virtual-bundle export CSV")
    ap.add_argument("--outdir", default=".", help="output directory (default: current dir)")
    ap.add_argument("--label", default=None, help='date label for HTML header (default: derived from CSV dates)')
    ap.add_argument("--date", default=None, help="MM.DD.YY stamp for file/tab names (default: latest CSV date)")
    ap.add_argument("--threshold", type=int, default=None, help="default noticeable units cut for HTML (default: config)")
    ap.add_argument("--config", default=None, help="path to config.json")
    args = ap.parse_args()

    if not os.path.isfile(args.csv):
        raise SystemExit(f"ERROR: CSV not found: {args.csv}")

    cfg = load_config(args.config)
    if args.threshold is not None:
        cfg["noticeable_threshold"] = args.threshold

    master, mmap = load_master(cfg)
    new_map = cfg.get("new_asin_map", {})
    agg, titles, date_range = read_export(args.csv)

    label = args.label or _fmt_date_label(date_range)
    if args.date:
        stamp = args.date
    elif date_range[1]:
        stamp = _dt.date.fromisoformat(date_range[1]).strftime("%m.%d.%y")
    else:
        stamp = _dt.date.today().strftime("%m.%d.%y")

    os.makedirs(args.outdir, exist_ok=True)
    tab = f"Bundle Report - {stamp}"
    xlsx_path = os.path.join(args.outdir, f"{tab}.xlsx")
    html_path = os.path.join(args.outdir, f"{tab}.html")

    rows = build_rows(master, agg)
    unmapped = [a for a in agg if a not in mmap and agg[a][0] > 0]

    write_xlsx(rows, unmapped, agg, titles, new_map, xlsx_path, tab)

    data = []
    for a in agg:
        u, s = agg[a]
        if u <= 0 or a not in mmap:
            continue
        _, M, C1, C2 = mmap[a][0], mmap[a][2], mmap[a][3], mmap[a][4]
        sku = mmap[a][1]
        comps = " + ".join([c for c in (M, C1, C2) if c])
        data.append({"asin": a, "sku": sku or "", "comps": comps, "main": M or "",
                     "units": u, "sales": round(s, 2), "avg": round(s / u, 2),
                     "title": titles.get(a, "")})
    data.sort(key=lambda x: (-x["units"], -x["sales"]))

    images = build_images(cfg)
    write_html(data, images, label, html_path, cfg, date_end=date_range[1] or "")

    mapped_u = sum(d["units"] for d in data)
    mapped_s = sum(d["sales"] for d in data)
    thr = cfg["noticeable_threshold"]
    noticeable = [d for d in data if d["units"] >= thr]
    have_img = sum(1 for d in noticeable if d["asin"] in images)

    print(f"Window        : {label or 'n/a'}")
    print(f"XLSX          : {xlsx_path}")
    print(f"HTML          : {html_path}")
    print(f"Mapped sold   : {len(data)} bundles | {mapped_u} units | ${mapped_s:,.2f}")
    print(f"Noticeable {thr}+ : {len(noticeable)} bundles | photos for {have_img}/{len(noticeable)}")
    if unmapped:
        du = sum(agg[a][0] for a in unmapped)
        ds = sum(agg[a][1] for a in unmapped)
        print(f"Dropped       : {len(unmapped)} unmapped ASINs | {du} units | ${ds:,.2f}  (see 'Unmapped' tab)")
        for a in sorted(unmapped, key=lambda x: -agg[x][0]):
            print(f"                {a}  {agg[a][0]}u  ${agg[a][1]:,.2f}  {titles.get(a,'')[:46]}")
    missing_img = [d["sku"] for d in noticeable if d["asin"] not in images]
    if missing_img:
        print(f"No photo (tile): {', '.join(missing_img)}  (add SKU_ASIN.png to reference_images/)")


if __name__ == "__main__":
    main()
