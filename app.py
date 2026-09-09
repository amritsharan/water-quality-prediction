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

import io
import csv
from flask import Response

# Endpoint to get/create readings
@app.route('/api/readings', methods=['GET', 'POST'])
def handle_readings():
    if request.method == 'GET':
        source_id = request.args.get('source_id')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if not source_id:
            return jsonify({"error": "source_id parameter is required"}), 400
        readings = database.get_readings_for_source(int(source_id))
        
        # Apply date filtering if provided
        if start_date:
            readings = [r for r in readings if r['timestamp'][:10] >= start_date]
        if end_date:
            readings = [r for r in readings if r['timestamp'][:10] <= end_date]
        
        # Calculate risk scores on the fly for history
        for r in readings:
            r['risk_score'], r['severity'] = models.calculate_risk_score_and_severity(
                r['pH'], r['turbidity'], r['tds'], 
                r['temperature'], r['dissolved_oxygen'], r['conductivity']
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

# CSV Export: Historical Readings
@app.route('/api/export/readings', methods=['GET'])
def export_readings_csv():
    source_id = request.args.get('source_id')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not source_id:
        return jsonify({"error": "source_id is required"}), 400
        
    source = database.get_source_by_id(int(source_id))
    source_name = source['name'] if source else f"source_{source_id}"
    readings = database.get_readings_for_source(int(source_id))
    
    if start_date:
        readings = [r for r in readings if r['timestamp'][:10] >= start_date]
    if end_date:
        readings = [r for r in readings if r['timestamp'][:10] <= end_date]
        
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Reading ID', 'Source ID', 'Timestamp', 'pH', 'Turbidity (NTU)', 'TDS (mg/L)', 'Temp (°C)', 'DO (mg/L)', 'Conductivity', 'Risk Score', 'Severity'])
    
    for r in readings:
        risk, sev = models.calculate_risk_score_and_severity(r['pH'], r['turbidity'], r['tds'], r['temperature'], r['dissolved_oxygen'], r['conductivity'])
        writer.writerow([r['reading_id'], r['source_id'], r['timestamp'], r['pH'], r['turbidity'], r['tds'], r['temperature'], r['dissolved_oxygen'], r['conductivity'], risk, sev])
        
    output.seek(0)
    clean_filename = f"{source_name.replace(' ', '_').lower()}_readings.csv"
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
    )

# CSV Export: AI Forecast Predictions
@app.route('/api/export/predict', methods=['GET'])
def export_predict_csv():
    source_id = request.args.get('source_id')
    algorithm = request.args.get('algorithm', 'rf')
    
    if not source_id:
        return jsonify({"error": "source_id is required"}), 400
        
    source = database.get_source_by_id(int(source_id))
    source_name = source['name'] if source else f"source_{source_id}"
    preds = models.predict_future(int(source_id), days=7, algorithm=algorithm)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Forecast Day', 'Timestamp', 'Predicted pH', 'Predicted Turbidity (NTU)', 'Predicted TDS (mg/L)', 'Predicted Temp (°C)', 'Predicted DO (mg/L)', 'Risk Score', 'Severity'])
    
    for p in preds:
        writer.writerow([p['day'], p['timestamp'], p['pH'], p['turbidity'], p['tds'], p['temperature'], p['dissolved_oxygen'], p['risk_score'], p['severity']])
        
    output.seek(0)
    clean_filename = f"{source_name.replace(' ', '_').lower()}_ai_forecast.csv"
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={"Content-Disposition": f"attachment; filename={clean_filename}"}
    )

# CSV Export: Community Reports
@app.route('/api/export/reports', methods=['GET'])
def export_reports_csv():
    reports = database.get_all_reports()
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Report ID', 'Reporter Name', 'Source ID', 'Issue Type', 'Description', 'Latitude', 'Longitude', 'Status', 'Timestamp'])
    
    for r in reports:
        writer.writerow([r['report_id'], r['reporter_name'], r['source_id'] or '', r['issue_type'], r['description'], r['latitude'], r['longitude'], r.get('status', 'Pending'), r['timestamp']])
        
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={"Content-Disposition": "attachment; filename=community_reports.csv"}
    )

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
                unique_filename = f"{uuid.uuid4().hex}_{filename}"
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], unique_filename))
                image_filename = unique_filename
                
        sid = int(source_id) if source_id else None
        
        rid = database.add_report(
            reporter_name, sid, issue_type, description, 
            float(latitude), float(longitude), image_filename
        )
        return jsonify({"message": "Report submitted successfully", "report_id": rid}), 201

# Endpoint to update report status (Pending, Investigating, Resolved)
@app.route('/api/reports/<int:report_id>/status', methods=['PATCH'])
def update_report_status_route(report_id):
    data = request.get_json() or {}
    new_status = data.get('status')
    
    if new_status not in ['Pending', 'Investigating', 'Resolved']:
        return jsonify({"error": "Invalid status value"}), 400
        
    updated = database.update_report_status(report_id, new_status)
    if not updated:
        return jsonify({"error": "Report not found"}), 404
        
    return jsonify({"message": f"Report #{report_id} status updated to '{new_status}'"}), 200

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

# System Health & Diagnostic Status Endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    try:
        sources_count = len(database.get_all_sources())
        readings_count = len(database.get_all_readings())
        reports_count = len(database.get_all_reports())
        binaries_exist = False
        if os.path.exists(models.MODELS_DIR):
            binaries_exist = len(os.listdir(models.MODELS_DIR)) > 0
        
        return jsonify({
            "status": "healthy",
            "database": "connected",
            "total_sources": sources_count,
            "total_readings": readings_count,
            "total_reports": reports_count,
            "models_trained": binaries_exist,
            "timestamp": datetime.now().isoformat()
        }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
