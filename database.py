import sqlite3
import os
from datetime import datetime

DATABASE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'water_quality.db')

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create Water_Source table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Water_Source (
            source_id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            location TEXT NOT NULL,
            source_type TEXT NOT NULL CHECK(source_type IN ('Lake', 'River', 'Borewell')),
            latitude REAL NOT NULL,
            longitude REAL NOT NULL
        )
    ''')
    
    # Create Water_Readings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Water_Readings (
            reading_id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            pH REAL NOT NULL,
            turbidity REAL NOT NULL,
            tds REAL NOT NULL,
            temperature REAL NOT NULL,
            dissolved_oxygen REAL NOT NULL,
            conductivity REAL NOT NULL,
            timestamp TEXT NOT NULL,
            FOREIGN KEY (source_id) REFERENCES Water_Source(source_id)
        )
    ''')
    
    # Create Community_Reports table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Community_Reports (
            report_id INTEGER PRIMARY KEY AUTOINCREMENT,
            reporter_name TEXT NOT NULL,
            source_id INTEGER,
            issue_type TEXT NOT NULL CHECK(issue_type IN ('Bad smell', 'Dead fish', 'Industrial waste', 'Water discoloration')),
            description TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            image_filename TEXT,
            status TEXT DEFAULT 'Pending',
            timestamp TEXT NOT NULL,
            FOREIGN KEY (source_id) REFERENCES Water_Source(source_id)
        )
    ''')
    
    # Create Indexes for high-performance time series and source queries
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_readings_source_ts ON Water_Readings (source_id, timestamp DESC)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reports_source ON Community_Reports (source_id)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_reports_timestamp ON Community_Reports (timestamp DESC)')
    
    # Schema migration check: add status column if existing DB lacks it
    cursor.execute("PRAGMA table_info(Community_Reports)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'status' not in columns:
        cursor.execute("ALTER TABLE Community_Reports ADD COLUMN status TEXT DEFAULT 'Pending'")
    
    conn.commit()
    conn.close()

def get_all_sources():
    conn = get_db_connection()
    sources = [dict(row) for row in conn.execute('SELECT * FROM Water_Source').fetchall()]
    conn.close()
    return sources

def get_source_by_id(source_id):
    conn = get_db_connection()
    source = conn.execute('SELECT * FROM Water_Source WHERE source_id = ?', (source_id,)).fetchone()
    conn.close()
    return dict(source) if source else None

def add_source(name, location, source_type, latitude, longitude):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO Water_Source (name, location, source_type, latitude, longitude)
        VALUES (?, ?, ?, ?, ?)
    ''', (name, location, source_type, latitude, longitude))
    source_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return source_id

def get_readings_for_source(source_id, limit=None):
    conn = get_db_connection()
    query = 'SELECT * FROM Water_Readings WHERE source_id = ? ORDER BY timestamp DESC'
    params = [source_id]
    if limit:
        query += ' LIMIT ?'
        params.append(limit)
    readings = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    # Return chronologically ordered
    return readings[::-1]

def get_all_readings():
    conn = get_db_connection()
    readings = [dict(row) for row in conn.execute('SELECT * FROM Water_Readings ORDER BY timestamp ASC').fetchall()]
    conn.close()
    return readings

def add_reading(source_id, pH, turbidity, tds, temperature, dissolved_oxygen, conductivity, timestamp=None):
    if not timestamp:
        timestamp = datetime.utcnow().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO Water_Readings (source_id, pH, turbidity, tds, temperature, dissolved_oxygen, conductivity, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (source_id, pH, turbidity, tds, temperature, dissolved_oxygen, conductivity, timestamp))
    reading_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return reading_id

def get_all_reports():
    conn = get_db_connection()
    reports = [dict(row) for row in conn.execute('SELECT * FROM Community_Reports ORDER BY timestamp DESC').fetchall()]
    conn.close()
    return reports

def add_report(reporter_name, source_id, issue_type, description, latitude, longitude, image_filename=None, status='Pending'):
    timestamp = datetime.utcnow().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO Community_Reports (reporter_name, source_id, issue_type, description, latitude, longitude, image_filename, status, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (reporter_name, source_id, issue_type, description, latitude, longitude, image_filename, status, timestamp))
    report_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return report_id

def update_report_status(report_id, new_status):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        UPDATE Community_Reports SET status = ? WHERE report_id = ?
    ''', (new_status, report_id))
    rows_affected = cursor.rowcount
    conn.commit()
    conn.close()
    return rows_affected > 0
