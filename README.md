# 🌊 Water Quality Monitoring & Prediction System

A state-of-the-art, full-stack web application for real-time water safety monitoring, chemical anomaly detection, multi-parameter AI forecasting, CSV data exporting, community incident management, and interactive geospatial mapping.

---

## 🌟 Key Features & Accomplishments (Phases 1 - 6)

### 🤖 1. Multi-Parameter AI Forecasting & Uncertainty Bounds (Phase 1)
- **Data-Driven Regressors**: Autoregressive ML models trained on Random Forest and Linear Regression algorithms for all 5 core parameters (**pH**, **Turbidity**, **TDS**, **Temperature**, **Dissolved Oxygen**).
- **Validation Metrics**: Live Mean Absolute Error (MAE) validation checks comparing Random Forest vs. Linear Regression performance, automatically recommending the optimal algorithm per parameter.
- **7-Day Predictions & Confidence Bands**: Time-series forecast graphs rendering 95% statistical confidence intervals alongside historical actuals.

### 📊 2. Historical Date Range Filtering & CSV Data Exporters (Phase 2)
- **Custom Date Pickers**: Interactive Start Date and End Date pickers on historical parameter trend charts.
- **Multi-Format CSV Exporters**:
  - `/api/export/readings?source_id=<id>`: Formatted CSV export of historical sensor readings.
  - `/api/export/predict?source_id=<id>&algorithm=<algo>`: 7-day AI forecast predictions CSV download.
  - `/api/export/reports`: Incident report database dump in CSV format.

### 🚨 3. Community Incident Status Lifecycle & Real-Time Feed (Phase 3)
- **Incident Lifecycle**: Track citizen report states (`Pending` ➔ `Investigating` ➔ `Resolved`).
- **Interactive Feed Search**: Real-time keyword search (by reporter name or issue description) and filter dropdowns (by status and issue type).
- **One-Click State Transitions**: `PATCH /api/reports/<id>/status` endpoint powering instant status change buttons on incident cards.

### ⚡ 4. High-Performance SQL Indexing & Optimized Queries (Phase 4)
- **Composite Indexing**: Composite SQLite indexes on `Water_Readings (source_id, timestamp DESC)` and `Community_Reports` for sub-millisecond query latency across time-series trends and map layers.

### 📡 5. IoT Auto-Streaming Mode & WHO/EPA Water Safety Guide (Phase 5)
- **IoT Live Telemetry Engine**: Toggle auto-streaming mode to simulate live sensor telemetry ingestion every 3.5 seconds to `POST /api/readings`.
- **Dynamic UI Propagation**: Automatic real-time updates across dashboard KPIs, Leaflet map nodes, and heatmap intensity overlays.
- **WHO & EPA Safety Guide**: Interactive reference guide modal detailing safe ranges, danger thresholds, and ecological impacts for pH, TDS, Turbidity, DO, and Conductivity.

### 📄 6. System Health Diagnostic API & Executive PDF Summary Reports (Phase 6)
- **Diagnostic Endpoint**: `GET /api/health` providing real-time system status checks (database connection, total sources, readings, reports, and ML binary readiness).
- **Printable Executive Summary**: High-contrast, styled PDF executive report layout triggered directly via browser print (`window.print()`).

### 🔐 7. User Authentication Guard & Interaction History Timeline
- **Authentication Guard**: Secure session-based registration, login, and logout (`/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`). Prevents unauthenticated access via a modal guard overlay.
- **Activity & Access History Logging**: Automatically logs user events (Sign In, Sign Out, Account Registration, Ingested Sensor Telemetry, AI Forecasts, Incident Reports) into `User_Activity_Logs` SQLite table.
- **User History Timeline View**: Interactive timeline table view (`GET /api/user/history`) enabling users to review their complete usage history and access timestamps.

---

## 🛠️ Technology Stack

- **Backend**: Python 3.11+, Flask Web Framework, SQLite3 Database, NumPy, Pandas, Scikit-learn, Joblib
- **Frontend**: HTML5, Vanilla CSS3 (Custom Dark Glassmorphism Theme), Vanilla JavaScript (ES6+ SPA architecture)
- **Visualization**: Leaflet.js (Geospatial Mapping with CARTO Dark Tiles & Leaflet-Heat), Chart.js (Interactive Line, Doughnut, and Bar Charts), FontAwesome 6 Icons, Google Fonts (Inter & Outfit)

---

## 📁 Project Architecture

```
water-quality-prediction/
├── app.py                   # Main Flask REST API controllers & CSV export handlers
├── database.py              # SQLite database manager, schemas, & composite index migrations
├── models.py                # Scikit-learn ML pipeline (RF & LR regressors, MAE evaluation, rules engine)
├── seed_data.py             # 90-day time-series historical data generator
├── test_app.py              # Comprehensive automated unit test suite (100% pass rate)
├── model_binaries/          # Trained scikit-learn regressor model binaries (.joblib)
├── templates/
│   └── index.html           # Single Page Application HTML shell & WHO/EPA standards modal
└── static/
    ├── css/
    │   └── styles.css       # Premium glassmorphic dark design system & @media print styles
    └── js/
        └── app.js           # SPA router, Leaflet map engine, Chart.js managers, & IoT auto-streamer
```

---

## 🚀 Setup & Execution Guide

### 1. Prerequisites & Installation
Ensure Python 3.11+ is installed on your system.

```bash
# Clone or navigate to the project directory
cd "water quality prediction"

# Install required packages
pip install -r requirements.txt
```

### 2. Launch Development Server
```bash
python app.py
```
*On initial startup, the system automatically creates `water_quality.db`, migrates indexes, seeds 90 days of historical sensor data, and trains all multi-parameter machine learning regressors.*

### 3. Open Web Dashboard
Navigate to the local web server URL in your browser:
```
http://localhost:5000
```

### 4. Run Automated Test Suite
To verify database operations, rules engine, ML forecasting, status transitions, and health check APIs:
```bash
python -m unittest test_app.py
```

---

## 🔌 API Reference Endpoint Summary

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/sources` | Fetch all monitored water sources with latest readings & alerts |
| `POST` | `/api/sources` | Register a new global water source with coordinates |
| `GET` | `/api/readings` | Fetch historical sensor readings for a source (supports `start_date` & `end_date`) |
| `POST` | `/api/readings` | Ingest new IoT sensor reading and trigger model retraining |
| `GET` | `/api/predict` | 7-day AI forecasts (`source_id`, `algorithm='rf'\|'lr'`) |
| `GET` | `/api/metrics` | Fetch ML model validation MAE evaluation scores |
| `GET` | `/api/reports` | Fetch citizen incident reports |
| `POST` | `/api/reports` | Submit citizen report with multipart photo evidence upload |
| `PATCH` | `/api/reports/<id>/status` | Update incident status (`Pending`, `Investigating`, `Resolved`) |
| `GET` | `/api/analytics` | Dashboard aggregate analytics (safety distribution, monthly trends) |
| `GET` | `/api/health` | System diagnostic health check status |
| `GET` | `/api/export/readings` | Export historical readings to CSV |
| `GET` | `/api/export/predict` | Export 7-day ML predictions to CSV |
| `GET` | `/api/export/reports` | Export incident reports to CSV |

---

## 📄 License
This project is open-source under the MIT License.
