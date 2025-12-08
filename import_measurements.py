  import csv, sqlite3
  from datetime import datetime

  CSV_PATH = "/opt/energy_dashboard/energy_report_JAN_FAIT_ALL.csv"
  DB_PATH = "/opt/energy_dashboard/data/energy.db"
  COL_TS = "Datetime_15min"
  COL_PROD = "Výroba FVE (kWh)"
  COL_CONS = "Odběr ČEZ (kWh)"
  COL_IMPORT = "Dokup elektřiny z ČEZ (kWh)"

  def fnum(val):
      if not val: return 0.0
      try: return float(val.replace(",", "."))
      except Exception: return 0.0

  conn = sqlite3.connect(DB_PATH)
  c = conn.cursor()
  c.execute("DROP TABLE IF EXISTS measurements")
  c.execute("""
  CREATE TABLE IF NOT EXISTS measurements (
    timestamp TEXT PRIMARY KEY,
    production_kwh REAL,
    consumption_kwh REAL
  )
  """)

  rows = []
  with open(CSV_PATH, newline="", encoding="utf-8") as f:
      reader = csv.DictReader(f, delimiter=";")
      for row in reader:
          ts_raw = (row.get(COL_TS) or "").strip()
          if not ts_raw:
              continue
          try:
              ts_iso = datetime.strptime(ts_raw, "%Y-%m-%d %H:%M:%S").isoformat()
          except ValueError:
              continue
          prod_val = fnum(row.get(COL_PROD))
          cons_val = fnum(row.get(COL_CONS))
          imp_val = fnum(row.get(COL_IMPORT))
          consumption = cons_val + imp_val
          if prod_val == 0 and consumption == 0:
              continue
          rows.append((ts_iso, prod_val, consumption))

  c.executemany(
      "INSERT OR REPLACE INTO measurements (timestamp, production_kwh, consumption_kwh) VALUES (?,?,?)",
      rows,
  )
  conn.commit()
  print(f"Imported rows: {len(rows)}")
  conn.close()
  PY

