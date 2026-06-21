import math
import random
from datetime import datetime, timedelta
import database

def seed():
    print("Initializing database...")
    database.init_db()
    
    # Check if sources already exist to prevent duplicate seeding
    existing_sources = database.get_all_sources()
    if existing_sources:
        print("Database already seeded. Skipping...")
        return
        
    print("Seeding water sources...")
    sources = [
        {"name": "Lake Union", "location": "Central Seattle", "source_type": "Lake", "lat": 47.6321, "lng": -122.3364},
        {"name": "Duwamish River", "location": "South Seattle", "source_type": "River", "lat": 47.5583, "lng": -122.3331},
        {"name": "Green Lake", "location": "North Seattle", "source_type": "Lake", "lat": 47.6798, "lng": -122.3259},
        {"name": "Cedar River Source", "location": "Renton", "source_type": "River", "lat": 47.4789, "lng": -122.2031},
        {"name": "West Seattle Aquifer", "location": "West Seattle", "source_type": "Borewell", "lat": 47.5611, "lng": -122.3858}
    ]
    
    source_ids = []
    for s in sources:
        sid = database.add_source(s["name"], s["location"], s["source_type"], s["lat"], s["lng"])
        source_ids.append((sid, s["name"]))
        
    print(f"Created sources: {source_ids}")
    
    # Generate historical daily readings for the past 90 days
    print("Generating 90-day daily readings...")
    start_date = datetime.now() - timedelta(days=90)
    
    for sid, name in source_ids:
        # Base values for each source
        if name == "Lake Union":
            base_ph = 7.4
            base_turb = 1.2
            base_tds = 180.0
            base_do = 8.5
        elif name == "Duwamish River":
            base_ph = 7.1
            base_turb = 2.5
            base_tds = 320.0
            base_do = 7.2
        elif name == "Green Lake":
            base_ph = 7.8
            base_turb = 1.8
            base_tds = 220.0
            base_do = 8.8
        elif name == "Cedar River Source":
            base_ph = 7.2
            base_turb = 0.6
            base_tds = 80.0
            base_do = 9.8
        else:  # West Seattle Aquifer (Borewell)
            base_ph = 6.9
            base_turb = 0.3
            base_tds = 480.0 # Naturally high TDS
            base_do = 5.8     # Groundwater usually has lower DO
            
        for day in range(91):
            date_val = start_date + timedelta(days=day)
            timestamp_str = date_val.isoformat()
            
            # Seasonal/daily temperature variations (sinusoidal)
            temp = 12.0 + 8.0 * math.sin(2 * math.pi * day / 365) + random.uniform(-1.0, 1.0)
            
            # Dissolved oxygen goes down as temperature goes up
            do = base_do - (temp - 12.0) * 0.15 + random.uniform(-0.4, 0.4)
            do = max(2.0, min(14.0, do))
            
            # Random walks with minor trends
            ph = base_ph + random.uniform(-0.15, 0.15)
            turb = max(0.1, base_turb + random.uniform(-0.3, 0.3))
            tds = max(20.0, base_tds + random.uniform(-10.0, 10.0))
            
            # Add specific anomalous events to make predictions/rules interesting
            # 1. Duwamish River has an industrial discharge runoff simulation at day 60-63
            if name == "Duwamish River" and 60 <= day <= 63:
                ph -= 1.8         # pH drops to ~5.3
                turb += 6.5       # Turbidity spikes to ~9.0 NTU
                tds += 190.0      # TDS spikes to ~510 mg/L
                do -= 3.0         # DO drops critically
                
            # 2. West Seattle Aquifer has a slow mineral seepage rise towards the end (days 80 to 90)
            if name == "West Seattle Aquifer" and day >= 80:
                tds += (day - 80) * 3.5 # TDS gradually increases beyond the 500 mg/L threshold (reaching ~525)
                
            # Conductivity closely follows TDS
            cond = tds * 1.56 + random.uniform(-15.0, 15.0)
            
            database.add_reading(
                source_id=sid,
                pH=round(ph, 2),
                turbidity=round(turb, 2),
                tds=round(tds, 1),
                temperature=round(temp, 1),
                dissolved_oxygen=round(do, 2),
                conductivity=round(cond, 1),
                timestamp=timestamp_str
            )
            
    # Add initial community reports matching the anomalies
    print("Seeding community reports...")
    
    # Report matching the Duwamish River runoff anomaly at day 60
    duwamish_id = [sid for sid, name in source_ids if name == "Duwamish River"][0]
    report_date_1 = (start_date + timedelta(days=60, hours=10)).isoformat()
    
    # We will simulate reports with timestamps and directly modify their insert timestamps in seed
    # However, since add_report uses datetime.utcnow(), we will implement a direct insert for seeding custom times,
    # or just use add_report and let it be current. Actually, a direct insert helper in seed is better so we can backdate it.
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO Community_Reports (reporter_name, source_id, issue_type, description, latitude, longitude, image_filename, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', ("Jane Doe", duwamish_id, "Water discoloration", 
          "The river looks murky brown and there is a chemical slick near the industrial park.", 
          47.5590, -122.3325, "mock_discoloration.jpg", report_date_1))
          
    # Another report near Green Lake (generic report of dead fish near the shore)
    greenlake_id = [sid for sid, name in source_ids if name == "Green Lake"][0]
    report_date_2 = (start_date + timedelta(days=75, hours=15)).isoformat()
    cursor.execute('''
        INSERT INTO Community_Reports (reporter_name, source_id, issue_type, description, latitude, longitude, image_filename, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', ("Mark Smith", greenlake_id, "Dead fish", 
          "Found a few dead fish near the swimming area. Algae seems quite thick today.", 
          47.6812, -122.3240, "mock_dead_fish.jpg", report_date_2))
          
    conn.commit()
    conn.close()
    
    print("Database seeding completed successfully.")

if __name__ == "__main__":
    seed()
