// Jednotné migrace pro všechny databázové přístupy (API i CLI skripty).
export function applyMigrations(db: any) {
  let version = db.pragma("user_version", { simple: true }) as number;

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS spot_price_payloads (
        date TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS spot_price_points (
        timestamp TEXT NOT NULL,
        resolution_minutes INTEGER NOT NULL,
        price_eur_mwh REAL,
        price_eur_kwh REAL,
        price_czk_kwh REAL,
        source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timestamp, resolution_minutes)
      );

      CREATE TABLE IF NOT EXISTS solax_readings (
        timestamp TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL,
        pv_output REAL,
        battery_soc REAL,
        battery_power REAL,
        grid_feed_in REAL,
        grid_import REAL,
        source TEXT DEFAULT 'solax',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timestamp, interval_minutes, source)
      );

      CREATE TABLE IF NOT EXISTS tigo_readings (
        timestamp TEXT NOT NULL,
        interval_minutes INTEGER NOT NULL,
        string_a REAL,
        string_b REAL,
        string_c REAL,
        string_d REAL,
        total REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (timestamp, interval_minutes)
      );
    `);
    version = 1;
    db.pragma("user_version = 1");
  }

  if (version < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS spot_prices (
        timestamp TEXT PRIMARY KEY,
        price_czk_kwh REAL,
        source TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        fve_power_kw REAL,
        orientation TEXT,
        tilt_deg REAL,
        battery_capacity_kwh REAL,
        battery_efficiency REAL,
        tariff_type TEXT,
        tariff_price REAL,
        tariff_nt REAL,
        tariff_vt REAL,
        backend_url TEXT,
        inverter_api_key TEXT,
        spot_api TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        system_id TEXT,
        name TEXT,
        payload TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    version = 2;
    db.pragma("user_version = 2");
  }

  if (version < 3) {
    migrateMeasurements(db);
    version = 3;
    db.pragma("user_version = 3");
  }
}

function migrateMeasurements(db: any) {
  const measurementsExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='measurements'")
    .get() as { name?: string } | undefined;

  if (!measurementsExists?.name) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS measurements (
        timestamp TEXT PRIMARY KEY,
        production_kwh REAL,
        consumption_kwh REAL,
        grid_import_kwh REAL,
        grid_export_kwh REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    return;
  }

  const columns = db.prepare("PRAGMA table_info(measurements)").all() as Array<{ name: string }>;
  const has = (name: string) => columns.some((col) => col.name === name);

  db.exec(`
    CREATE TABLE IF NOT EXISTS measurements_v3 (
      timestamp TEXT PRIMARY KEY,
      production_kwh REAL,
      consumption_kwh REAL,
      grid_import_kwh REAL,
      grid_export_kwh REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const selectParts = [
    "timestamp",
    has("production_kwh") ? "production_kwh" : "NULL AS production_kwh",
    has("consumption_kwh") ? "consumption_kwh" : "NULL AS consumption_kwh",
    has("grid_import_kwh") ? "grid_import_kwh" : "NULL AS grid_import_kwh",
    has("grid_export_kwh") ? "grid_export_kwh" : "NULL AS grid_export_kwh",
  ];

  db.exec(`
    INSERT OR REPLACE INTO measurements_v3 (timestamp, production_kwh, consumption_kwh, grid_import_kwh, grid_export_kwh)
    SELECT ${selectParts.join(", ")} FROM measurements WHERE timestamp IS NOT NULL
  `);

  db.exec("DROP TABLE IF EXISTS measurements");
  db.exec("ALTER TABLE measurements_v3 RENAME TO measurements");
}
