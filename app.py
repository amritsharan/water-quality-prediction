import os
import uuid
from datetime import datetime
import numpy as np
from flask import Flask, request, jsonify, render_template, send_from_directory
from werkzeug.utils import secure_filename
import database
import models
import seed_data

app = Flask(__name__)

# Configure upload folder
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# Setup Database & Models on startup
with app.app_context():
    database.init_db()
    # Check if we need to seed
    if len(database.get_all_sources()) == 0:
        print("Seeding database...")
        seed_data.seed()
        print("Training models...")
        models.train_all_models()

# Render front-end SPA
@app.route('/')
def index():
    return render_template('index.html')

# Endpoint to get/create water sources
@app.route('/api/sources', methods=['GET', 'POST'])
def handle_sources():
    if request.method == 'GET':
        sources = database.get_all_sources()
        # Attach latest reading and status to each source
        for source in sources:
            readings = database.get_readings_for_source(source['source_id'], limit=1)
            if readings:
                latest = readings[0]
                risk, severity = models.calculate_risk_score_and_severity(
                    latest['pH'], latest['turbidity'], latest['tds'], 
                    latest['temperature'], latest['dissolved_oxygen'], latest['conductivity']
                )
                source['latest_reading'] = latest
                source['risk_score'] = risk
                source['severity'] = severity
                
                # Dynamic alerts checking Layer 4 rules
                alerts = []
                if latest['pH'] < 6.5 or latest['pH'] > 8.5:
                    alerts.append(f"pH level ({latest['pH']}) is outside normal range (6.5 - 8.5)")
                if latest['tds'] > 500:
                    alerts.append(f"TDS ({latest['tds']} mg/L) exceeds safe limit (>500 mg/L)")
                if latest['turbidity'] > 5.0:
                    alerts.append(f"Turbidity ({latest['turbidity']} NTU) exceeds safe limit (>5 NTU)")
                if latest['dissolved_oxygen'] < 4.0:
                    alerts.append(f"Dissolved Oxygen ({latest['dissolved_oxygen']} mg/L) is critically low (<4 mg/L)")
                source['alerts'] = alerts
            else:
                source['latest_reading'] = None
                source['risk_score'] = 0.0
                source['severity'] = "Safe"
                source['alerts'] = []
        return jsonify(sources)
        
    elif request.method == 'POST':
        data = request.get_json() or {}
        name = data.get('name')
        location = data.get('location')
        source_type = data.get('source_type')
        latitude = data.get('latitude')
        longitude = data.get('longitude')
        
        if not (name and location and source_type and latitude and longitude):
            return jsonify({"error": "Missing required fields"}), 400
            
        if source_type not in ['Lake', 'River', 'Borewell']:
            return jsonify({"error": "Invalid source type"}), 400
            
        sid = database.add_source(name, location, source_type, float(latitude), float(longitude))
        return jsonify({"message": "Source added successfully", "source_id": sid}), 201

# Endpoint to get/create readings
@app.route('/api/readings', methods=['GET', 'POST'])
def handle_readings():
    if request.method == 'GET':
        source_id = request.args.get('source_id')
        if not source_id:
            return jsonify({"error": "source_id parameter is required"}), 400
        readings = database.get_readings_for_source(int(source_id))
        
        # Calculate risk scores on the fly for history
        for r in readings:
            r['risk_score'], r['severity'] = models.calculate_risk_score_and_severity(
                r['pH'], r['turbidity'], r['tds'], r['temperature'], r['dissolved_oxygen'], r['conductivity']
            )
        return jsonify(readings)
        
    elif request.method == 'POST':
        data = request.get_json() or {}
        source_id = data.get('source_id')
        ph = data.get('pH')
        turbidity = data.get('turbidity')
        tds = data.get('tds')
        temp = data.get('temperature')
        do = data.get('dissolved_oxygen')
        cond = data.get('conductivity')
        
        if None in [source_id, ph, turbidity, tds, temp, do, cond]:
            return jsonify({"error": "Missing sensor fields"}), 400
            
        rid = database.add_reading(
            int(source_id), float(ph), float(turbidity), float(tds),
            float(temp), float(do), float(cond)
        )
        
        # Trigger model retraining to incorporate the new sensor data
        models.train_all_models()
        
        return jsonify({"message": "Sensor reading added successfully", "reading_id": rid}), 201

# Endpoint for AI Predictions
@app.route('/api/predict', methods=['GET'])
def handle_predict():
    source_id = request.args.get('source_id')
    algorithm = request.args.get('algorithm', 'rf') # 'rf' or 'lr'
    
    if not source_id:
        return jsonify({"error": "source_id is required"}), 400
        
    preds = models.predict_future(int(source_id), days=7, algorithm=algorithm)
    return jsonify(preds)

# Endpoint for Model Evaluation Metrics
@app.route('/api/metrics', methods=['GET'])
def get_model_metrics():
    return jsonify(models.get_model_metrics())

# Endpoint for community reports with image upload support
@app.route('/api/reports', methods=['GET', 'POST'])
def handle_reports():
    if request.method == 'GET':
        reports = database.get_all_reports()
        return jsonify(reports)
        
    elif request.method == 'POST':
        reporter_name = request.form.get('reporter_name', 'Anonymous')
        source_id = request.form.get('source_id')
        issue_type = request.form.get('issue_type')
        description = request.form.get('description')
        latitude = request.form.get('latitude')
        longitude = request.form.get('longitude')
        
        if not (issue_type and description and latitude and longitude):
            return jsonify({"error": "Missing required fields"}), 400
            
        if issue_type not in ['Bad smell', 'Dead fish', 'Industrial waste', 'Water discoloration']:
            return jsonify({"error": "Invalid issue type"}), 400
            
        # Handle file upload
        image_filename = None
        if 'image' in request.files:
            file = request.files['image']
            if file and file.filename != '' and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                # Append a unique ID to prevent collisions
                unique_filename = f"{uuid.uuid4().hex}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
                image_filename = unique_filename
                
        sid = int(source_id) if source_id else None
        
        rid = database.add_report(
            reporter_name, sid, issue_type, description, 
            float(latitude), float(longitude), image_filename
        )
        return jsonify({"message": "Report submitted successfully", "report_id": rid}), 201

# Endpoint to serve uploaded images safely
@app.route('/static/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# Endpoint for dashboard aggregate analytics
@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    sources = database.get_all_sources()
    readings = database.get_all_readings()
    reports = database.get_all_reports()
    
    # Calculate safety counts
    safety_counts = {"Safe": 0, "Moderate": 0, "Unsafe": 0}
    total_alerts = 0
    active_alerts_list = []
    
    for s in sources:
        s_readings = database.get_readings_for_source(s['source_id'], limit=1)
        if s_readings:
            latest = s_readings[0]
            _, sev = models.calculate_risk_score_and_severity(
                latest['pH'], latest['turbidity'], latest['tds'], 
                latest['temperature'], latest['dissolved_oxygen'], latest['conductivity']
            )
            safety_counts[sev] += 1
            
            # Count alerts
            alerts = []
            if latest['pH'] < 6.5 or latest['pH'] > 8.5:
                alerts.append(f"{s['name']}: pH is {latest['pH']}")
            if latest['tds'] > 500:
                alerts.append(f"{s['name']}: TDS is {latest['tds']} mg/L")
            if latest['turbidity'] > 5.0:
                alerts.append(f"{s['name']}: Turbidity is {latest['turbidity']} NTU")
            if latest['dissolved_oxygen'] < 4.0:
                alerts.append(f"{s['name']}: Dissolved Oxygen is {latest['dissolved_oxygen']} mg/L")
                
            total_alerts += len(alerts)
            active_alerts_list.extend(alerts)
        else:
            safety_counts["Safe"] += 1
            
    # Calculate monthly average WQI
    # For a simple representation, we'll calculate monthly average Risk Score
    monthly_data = {}
    for r in readings:
        try:
            # Extract month (YYYY-MM)
            dt = datetime.fromisoformat(r['timestamp'])
            month_str = dt.strftime('%b %Y')
            
            risk, _ = models.calculate_risk_score_and_severity(
                r['pH'], r['turbidity'], r['tds'], r['temperature'], r['dissolved_oxygen'], r['conductivity']
            )
            
            if month_str not in monthly_data:
                monthly_data[month_str] = []
            monthly_data[month_str].append(risk)
        except Exception:
            continue
            
    # Format monthly averages
    monthly_averages = []
    for month, scores in monthly_data.items():
        monthly_averages.append({
            "month": month,
            "avg_risk_score": round(float(np.mean(scores)), 1)
        })
    # Sort chronologically (since our readings are sorted by timestamp)
    # The order will naturally match insertion order which is chronological
    
    return jsonify({
        "safety_distribution": safety_counts,
        "total_sources": len(sources),
        "total_alerts": total_alerts,
        "active_alerts": active_alerts_list,
        "total_reports": len(reports),
        "monthly_risk_trends": monthly_averages
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
