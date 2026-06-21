# Q-NEXUS | Water Quality Monitoring & Prediction System

A modern, full-stack Web Application designed to monitor water safety indices, automatically flag chemical thresholds, forecast future contaminants using scikit-learn models, and enable community incident reporting with geolocated mapping.

## Features

- **Interactive Dashboard**: Sleek glassmorphic dark-theme SPA visualizing regional safety averages, monthly risk trends, and real-time parameters (pH, Turbidity, TDS, DO).
- **Interactive Leaflet Map**: Geolocated water sources (color-coded by safety class) and citizen reported incidents overlays. Supports panning, zoom, popup popup reports, and click coordinates selection.
- **AI Forecasting engine**: Autoregressive $AR(3)$ models using Random Forest Regressor & Linear Regression to forecast pH/TDS trends 7 days into the future.
- **Model Accuracy Metrics**: Live Mean Absolute Error (MAE) validation checks comparing models and suggesting the most accurate forecasting algorithm.
- **Simulate IoT Node**: Push mock metrics dynamically to update map nodes and retrain ML weights on the fly.
- **Register Global Sites**: Dynamically register a new water source anywhere in the world and center the map.
- **Community Reporting**: Citizen reporting form with GPS Geolocation, issue classification, description, and evidence photo uploads.

## Project Structure

```
├── app.py                   # Main Flask API routing & controllers
├── database.py              # SQLite database manager & schemas
├── seed_data.py             # 90-day time-series historical data generator
├── models.py                # ML prediction pipelines (classification & regression)
├── test_app.py              # Automated unit test suite
├── templates/
│   └── index.html           # SPA Dashboard HTML structure
└── static/
    ├── css/
    │   └── styles.css       # Premium glassmorphism dark styles
    └── js/
        └── app.js           # Client-side routing, Chart.js, & Leaflet overlays
```

## Setup & Running Instructions

### 1. Install Dependencies
Make sure you have Python 3.11+ installed. Run:
```bash
pip install -r requirements.txt
```

### 2. Run the Server
Launch the Flask development server:
```bash
python app.py
```
*Note: The server will automatically initialize the database schema, seed the 90-day historical readings, and train/evaluate the scikit-learn model binaries on startup.*

### 3. Open the Dashboard
Open your web browser and navigate to:
```
http://localhost:5000
```

### 4. Running Automated Tests
To run the automated unittest verification:
```bash
python -m unittest test_app.py
```
