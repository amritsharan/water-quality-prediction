// App State
let appState = {
    activeTab: 'dashboard',
    sources: [],
    reports: [],
    selectedTrendSourceId: null,
    selectedTrendParam: 'pH',
    map: null,
    mapMarkers: [],
    predictionData: [],
    isHeatmapActive: false,
    heatmapLayer: null,
    selectionMarker: null,
    autoStreamTimer: null
};

// Chart References
let activeCharts = {
    trend: null,
    distribution: null,
    monthlyRisk: null,
    predPh: null,
    predTurb: null,
    predTds: null,
    predDo: null
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initDate();
    initTabs();
    initForms();
    initStandardsModal();
    initAutoStream();
    loadDashboardData();
});

// Setup Current Date
function initDate() {
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', options);
}

// Tab Switching Routing
function initTabs() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.view-panel');
    const viewTitle = document.getElementById('view-title');
    const viewSubtitle = document.getElementById('view-subtitle');

    const tabMetadata = {
        dashboard: {
            title: "Dashboard Overview",
            subtitle: "Real-time water quality indices, anomalies, and aggregate data."
        },
        map: {
            title: "Interactive Pollution Map",
            subtitle: "Geospatial coordinate mapping of water sources and citizen reports."
        },
        predictions: {
            title: "AI Quality Forecasting",
            subtitle: "Time-series parameter predictions driven by Random Forest & Linear Regression."
        },
        reports: {
            title: "Community Reporting Hub",
            subtitle: "Citizen science reports of visible pollution incidents and anomalies."
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const tabId = item.getAttribute('data-tab');
            if (!tabId) return; // Skip non-tab items (e.g. Safety Standards modal trigger)
            
            e.preventDefault();
            
            navItems.forEach(n => n.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            
            item.classList.add('active');
            const targetPanel = document.getElementById(`${tabId}-view`);
            if (targetPanel) targetPanel.classList.add('active');
            
            // Update Headers
            if (tabMetadata[tabId]) {
                viewTitle.textContent = tabMetadata[tabId].title;
                viewSubtitle.textContent = tabMetadata[tabId].subtitle;
            }
            
            appState.activeTab = tabId;
            
            // Tab Specific Refreshes
            if (tabId === 'dashboard') {
                loadDashboardData();
            } else if (tabId === 'map') {
                setTimeout(initMap, 100); // Small delay to let container size evaluate
            } else if (tabId === 'predictions') {
                loadPredictionSources();
                loadModelMetrics();
            } else if (tabId === 'reports') {
                loadReportsFeed();
            }
        });
    });
}

// Setup Form Listeners & Upload Previews
function initForms() {
    // Date filter controls
    const applyFilterBtn = document.getElementById('apply-date-filter-btn');
    const resetFilterBtn = document.getElementById('reset-date-filter-btn');
    
    if (applyFilterBtn) {
        applyFilterBtn.onclick = (e) => {
            e.preventDefault();
            loadTrendChartData();
            showToast("Date filter applied to historical trends!", "info");
        };
    }
    if (resetFilterBtn) {
        resetFilterBtn.onclick = (e) => {
            e.preventDefault();
            document.getElementById('start-date-filter').value = '';
            document.getElementById('end-date-filter').value = '';
            loadTrendChartData();
            showToast("Date filters cleared.", "info");
        };
    }

    // CSV Export buttons
    const exportReadingsBtn = document.getElementById('export-readings-csv-btn');
    if (exportReadingsBtn) {
        exportReadingsBtn.onclick = (e) => {
            e.preventDefault();
            if (!appState.selectedTrendSourceId) return;
            const startDate = document.getElementById('start-date-filter')?.value || '';
            const endDate = document.getElementById('end-date-filter')?.value || '';
            let exportUrl = `/api/export/readings?source_id=${appState.selectedTrendSourceId}`;
            if (startDate) exportUrl += `&start_date=${startDate}`;
            if (endDate) exportUrl += `&end_date=${endDate}`;
            window.location.href = exportUrl;
            showToast("Downloading Water Readings CSV...", "success");
        };
    }

    const exportPredsBtn = document.getElementById('export-predictions-csv-btn');
    if (exportPredsBtn) {
        exportPredsBtn.onclick = (e) => {
            e.preventDefault();
            const sourceId = document.getElementById('pred-source-select').value;
            const algorithm = document.getElementById('pred-algo-select').value;
            if (!sourceId) {
                showToast("Please select a water source first.", "warning");
                return;
            }
            window.location.href = `/api/export/predict?source_id=${sourceId}&algorithm=${algorithm}`;
            showToast("Downloading AI Forecast CSV...", "success");
        };
    }

    const exportReportsBtn = document.getElementById('export-reports-csv-btn');
    if (exportReportsBtn) {
        exportReportsBtn.onclick = (e) => {
            e.preventDefault();
            window.location.href = '/api/export/reports';
            showToast("Downloading Community Incident Reports CSV...", "success");
        };
    }

    // Print Executive Summary PDF Report
    const printReportBtn = document.getElementById('print-executive-report-btn');
    if (printReportBtn) {
        printReportBtn.onclick = (e) => {
            e.preventDefault();
            window.print();
        };
    }

    // Evidence Image Upload Design change listener
    const fileInput = document.getElementById('rep-image');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const fileNameDisplay = document.querySelector('.file-name-display');
            if (fileInput.files.length > 0) {
                fileNameDisplay.textContent = fileInput.files[0].name;
                fileNameDisplay.style.color = '#3b82f6';
            } else {
                fileNameDisplay.textContent = "No file selected";
                fileNameDisplay.style.color = 'var(--text-muted)';
            }
        });
    }

    // Geolocation autofill
    const getLocBtn = document.getElementById('get-location-btn');
    if (getLocBtn) {
        getLocBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                getLocBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude.toFixed(4);
                        const lng = position.coords.longitude.toFixed(4);
                        document.getElementById('rep-lat').value = lat;
                        document.getElementById('rep-lng').value = lng;
                        
                        // Also autofill new global source coordinates if form is present
                        if (document.getElementById('new-lat')) {
                            document.getElementById('new-lat').value = lat;
                            document.getElementById('new-lng').value = lng;
                        }
                        
                        getLocBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
                    },
                    (error) => {
                        console.error(error);
                        alert("Geolocation failed or permitted. Center of Seattle defaults set.");
                        document.getElementById('rep-lat').value = "47.6062";
                        document.getElementById('rep-lng').value = "-122.3321";
                        if (document.getElementById('new-lat')) {
                            document.getElementById('new-lat').value = "47.6062";
                            document.getElementById('new-lng').value = "-122.3321";
                        }
                        getLocBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
                    }
                );
            } else {
                alert("Geolocation not supported by this browser.");
            }
        });
    }

    // Map Sidebar Tabs toggler
    const tabSim = document.getElementById('map-tab-sim');
    const tabAdd = document.getElementById('map-tab-add');
    const panelSim = document.getElementById('map-panel-sim');
    const panelAdd = document.getElementById('map-panel-add');
    
    if (tabSim && tabAdd) {
        tabSim.onclick = (e) => {
            e.preventDefault();
            tabSim.classList.add('active');
            tabAdd.classList.remove('active');
            panelSim.classList.remove('hidden');
            panelAdd.classList.add('hidden');
        };
        
        tabAdd.onclick = (e) => {
            e.preventDefault();
            tabAdd.classList.add('active');
            tabSim.classList.remove('active');
            panelAdd.classList.remove('hidden');
            panelSim.classList.add('hidden');
        };
    }

    // Community Report Submit Form
    const reportForm = document.getElementById('community-report-form');
    if (reportForm) {
        reportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData();
            formData.append('reporter_name', document.getElementById('rep-name').value || 'Anonymous');
            formData.append('source_id', document.getElementById('rep-source').value);
            formData.append('issue_type', document.getElementById('rep-issue').value);
            formData.append('latitude', document.getElementById('rep-lat').value);
            formData.append('longitude', document.getElementById('rep-lng').value);
            formData.append('description', document.getElementById('rep-desc').value);
            
            const fileField = document.getElementById('rep-image');
            if (fileField.files.length > 0) {
                formData.append('image', fileField.files[0]);
            }

            fetch('/api/reports', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert("Error submitting report: " + data.error);
                } else {
                    alert("Incident report successfully submitted!");
                    reportForm.reset();
                    document.querySelector('.file-name-display').textContent = "No file selected";
                    loadReportsFeed();
                }
            })
            .catch(err => console.error("Error submitting report:", err));
        });
    }

    // IoT Simulator form
    const iotForm = document.getElementById('iot-simulator-form');
    if (iotForm) {
        iotForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const payload = {
                source_id: parseInt(document.getElementById('sim-source-select').value),
                pH: parseFloat(document.getElementById('sim-ph').value),
                turbidity: parseFloat(document.getElementById('sim-turb').value),
                tds: parseFloat(document.getElementById('sim-tds').value),
                temperature: parseFloat(document.getElementById('sim-temp').value),
                dissolved_oxygen: parseFloat(document.getElementById('sim-do').value),
                conductivity: parseFloat(document.getElementById('sim-cond').value)
            };

            fetch('/api/readings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) {
                    alert("Error pushing IoT readings: " + data.error);
                } else {
                    alert("IoT sensor metrics ingested successfully! Recalculating AI weights...");
                    // Reload map data
                    if (appState.isHeatmapActive) {
                        renderHeatmap();
                    } else {
                        initMap();
                    }
                }
            })
            .catch(err => console.error("Error posting IoT sensor:", err));
        });
    }

    // Add Global Source form submit
    const addForm = document.getElementById('add-source-form');
    if (addForm) {
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const lat = parseFloat(document.getElementById('new-lat').value);
            const lng = parseFloat(document.getElementById('new-lng').value);
            const sourceName = document.getElementById('new-name').value;
            
            const sourcePayload = {
                name: sourceName,
                location: document.getElementById('new-region').value,
                source_type: document.getElementById('new-type').value,
                latitude: lat,
                longitude: lng
            };

            // 1. Create the source
            fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sourcePayload)
            })
            .then(res => res.json())
            .then(sourceData => {
                if (sourceData.error) {
                    alert("Error registering source: " + sourceData.error);
                    return;
                }
                
                const newSourceId = sourceData.source_id;
                
                // 2. Submit the baseline reading values
                const tds = parseFloat(document.getElementById('new-tds').value);
                const readingPayload = {
                    source_id: newSourceId,
                    pH: parseFloat(document.getElementById('new-ph').value),
                    turbidity: parseFloat(document.getElementById('new-turb').value),
                    tds: tds,
                    temperature: parseFloat(document.getElementById('new-temp').value),
                    dissolved_oxygen: 8.5, // Standard baseline DO
                    conductivity: tds * 1.56 // Estimate conductivity
                };

                return fetch('/api/readings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(readingPayload)
                })
                .then(res => res.json())
                .then(readingData => {
                    if (readingData.error) {
                        alert("Error registering baseline readings: " + readingData.error);
                    } else {
                        alert(`Water source "${sourceName}" registered globally! Recalculating AI classifiers...`);
                        addForm.reset();
                        
                        // Refresh all lists and flying map to new coordinates
                        loadDashboardData();
                        
                        // Shift tab back to simulator
                        tabSim.click();
                        
                        setTimeout(() => {
                            // Fly Map
                            if (appState.map) {
                                appState.map.setView([lat, lng], 13);
                            }
                            initMap();
                        }, 500);
                    }
                });
            })
            .catch(err => console.error("Error adding global source:", err));
        });
    }
}

// Global dashboard retrieval
function loadDashboardData() {
    // 1. Fetch Analytics Overview
    fetch('/api/analytics')
        .then(res => res.json())
        .then(data => {
            // Populate metrics
            document.getElementById('total-sources-val').textContent = data.total_sources;
            document.getElementById('active-alerts-val').textContent = data.total_alerts;
            document.getElementById('citizen-reports-val').textContent = data.total_reports;
            
            // Adjust alert state icons
            const alertsIcon = document.getElementById('alerts-status-icon');
            if (data.total_alerts > 0) {
                alertsIcon.className = "metric-icon red";
                // Show alerts banner
                const banner = document.getElementById('dashboard-alerts-banner');
                const list = document.getElementById('dashboard-alerts-list');
                list.innerHTML = "";
                data.active_alerts.forEach(alertText => {
                    const li = document.createElement('li');
                    li.textContent = alertText;
                    list.appendChild(li);
                });
                banner.classList.remove('hidden');
            } else {
                alertsIcon.className = "metric-icon blue";
                document.getElementById('dashboard-alerts-banner').classList.add('hidden');
            }

            // Draw Safety Distribution Chart (Doughnut)
            drawSafetyDistribution(data.safety_distribution);

            // Draw Monthly Risk index chart
            drawMonthlyRiskChart(data.monthly_risk_trends);
        })
        .catch(err => console.error("Error loading analytics:", err));

    // 2. Fetch Sources list
    fetch('/api/sources')
        .then(res => res.json())
        .then(sources => {
            appState.sources = sources;
            
            // Calculate Avg WQI/Safety Score
            if (sources.length > 0) {
                let validScores = sources.map(s => s.risk_score);
                let avgScore = validScores.reduce((a, b) => a + b, 0) / validScores.length;
                let formattedScore = (100 - avgScore).toFixed(1); // Safety score is inverse of risk
                document.getElementById('avg-wqi-val').textContent = formattedScore;
                
                const wqiLabel = document.getElementById('avg-wqi-label');
                const wqiIcon = document.getElementById('wqi-status-icon');
                if (formattedScore > 70) {
                    wqiLabel.textContent = "Region aggregate: Clean";
                    wqiIcon.className = "metric-icon green";
                } else if (formattedScore > 40) {
                    wqiLabel.textContent = "Region aggregate: Fair";
                    wqiIcon.className = "metric-icon yellow";
                } else {
                    wqiLabel.textContent = "Region aggregate: Unsafe";
                    wqiIcon.className = "metric-icon red";
                }
            }
            
            // Populate trends selectors
            const selectEl = document.getElementById('trend-source-select');
            const currentSelected = selectEl.value;
            selectEl.innerHTML = "";
            sources.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.source_id;
                opt.textContent = `${s.name} (${s.location})`;
                selectEl.appendChild(opt);
            });
            
            if (currentSelected && sources.some(s => s.source_id == currentSelected)) {
                selectEl.value = currentSelected;
            } else if (sources.length > 0) {
                selectEl.value = sources[0].source_id;
            }
            
            appState.selectedTrendSourceId = selectEl.value;
            
            // Bind trend selectors
            selectEl.onchange = () => {
                appState.selectedTrendSourceId = selectEl.value;
                loadTrendChartData();
            };
            
            // Setup Parameter toggle buttons
            const paramButtons = document.querySelectorAll('[data-param]');
            paramButtons.forEach(btn => {
                // Clear existing listeners
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                
                newBtn.addEventListener('click', (e) => {
                    document.querySelectorAll('[data-param]').forEach(b => b.classList.remove('active'));
                    newBtn.classList.add('active');
                    appState.selectedTrendParam = newBtn.getAttribute('data-param');
                    loadTrendChartData();
                });
            });

            // Initial load of trend chart
            loadTrendChartData();
        })
        .catch(err => console.error("Error loading sources list:", err));
}

// Render line chart for historical trends
function loadTrendChartData() {
    if (!appState.selectedTrendSourceId) return;
    
    const startDate = document.getElementById('start-date-filter')?.value || '';
    const endDate = document.getElementById('end-date-filter')?.value || '';
    
    let url = `/api/readings?source_id=${appState.selectedTrendSourceId}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;
    
    fetch(url)
        .then(res => res.json())
        .then(readings => {
            const labels = readings.map(r => {
                const d = new Date(r.timestamp);
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            });
            
            const param = appState.selectedTrendParam;
            const dataValues = readings.map(r => r[param]);
            
            let labelName = param;
            let strokeColor = '#3b82f6';
            let fillColor = 'rgba(59, 130, 246, 0.1)';
            
            if (param === 'pH') {
                labelName = "pH Level";
                strokeColor = '#10b981';
                fillColor = 'rgba(16, 185, 129, 0.05)';
            } else if (param === 'turbidity') {
                labelName = "Turbidity (NTU)";
                strokeColor = '#8b5cf6';
                fillColor = 'rgba(139, 92, 246, 0.05)';
            } else if (param === 'tds') {
                labelName = "Total Dissolved Solids (mg/L)";
                strokeColor = '#f59e0b';
                fillColor = 'rgba(245, 158, 11, 0.05)';
            } else if (param === 'dissolved_oxygen') {
                labelName = "Dissolved Oxygen (mg/L)";
                strokeColor = '#06b6d4';
                fillColor = 'rgba(6, 182, 212, 0.05)';
            }

            if (activeCharts.trend) {
                activeCharts.trend.destroy();
            }

            const ctx = document.getElementById('parameter-trend-chart').getContext('2d');
            activeCharts.trend = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: labelName,
                        data: dataValues,
                        borderColor: strokeColor,
                        backgroundColor: fillColor,
                        borderWidth: 2,
                        tension: 0.3,
                        fill: true,
                        pointRadius: 2,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        x: {
                            grid: { color: 'rgba(255, 255, 255, 0.03)' },
                            ticks: { color: 'var(--text-secondary)', maxTicksLimit: 12 }
                        },
                        y: {
                            grid: { color: 'rgba(255, 255, 255, 0.03)' },
                            ticks: { color: 'var(--text-secondary)' }
                        }
                    }
                }
            });
        })
        .catch(err => console.error("Error loading readings for trend:", err));
}

// Safety Distribution Doughnut
function drawSafetyDistribution(distribution) {
    if (activeCharts.distribution) {
        activeCharts.distribution.destroy();
    }
    const ctx = document.getElementById('safety-distribution-chart').getContext('2d');
    activeCharts.distribution = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Safe', 'Moderate', 'Unsafe'],
            datasets: [{
                data: [distribution.Safe, distribution.Moderate, distribution.Unsafe],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#f3f4f6', boxWidth: 12, font: { family: 'Inter' } }
                }
            },
            cutout: '65%'
        }
    });
}

// Monthly risk bar chart
function drawMonthlyRiskChart(trends) {
    if (activeCharts.monthlyRisk) {
        activeCharts.monthlyRisk.destroy();
    }
    
    // Sort chronological: months should load correct sequence
    const labels = trends.map(t => t.month);
    const dataValues = trends.map(t => t.avg_risk_score);

    const ctx = document.getElementById('monthly-risk-chart').getContext('2d');
    activeCharts.monthlyRisk = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Aggregate Risk Score',
                data: dataValues,
                backgroundColor: 'rgba(59, 130, 246, 0.65)',
                hoverBackgroundColor: 'var(--primary)',
                borderColor: 'var(--primary)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: 'var(--text-secondary)' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: 'var(--text-secondary)' },
                    suggestedMax: 100
                }
            }
        }
    });
}

// Helper to show modern visual toast notifications
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    
    let icon = '<i class="fa-solid fa-circle-info" style="color: var(--primary);"></i>';
    if (type === 'success') {
        icon = '<i class="fa-solid fa-circle-check" style="color: var(--success);"></i>';
        toast.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 15px rgba(16, 185, 129, 0.15)';
    } else if (type === 'warning') {
        icon = '<i class="fa-solid fa-triangle-exclamation" style="color: var(--warning);"></i>';
        toast.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        toast.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 15px rgba(245, 158, 11, 0.15)';
    }
    
    toast.innerHTML = `
        ${icon}
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove from DOM
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// Flash highlight style to coordinate inputs
function highlightInputs(inputIds) {
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('highlight-flash');
            setTimeout(() => {
                el.classList.remove('highlight-flash');
            }, 1000);
        }
    });
}

// Seamlessly update coordinate inputs across the app
function updateCoordinatesInForms(lat, lng) {
    const fields = [
        { id: 'rep-lat', val: lat },
        { id: 'rep-lng', val: lng },
        { id: 'new-lat', val: lat },
        { id: 'new-lng', val: lng }
    ];
    
    const updatedIds = [];
    fields.forEach(field => {
        const el = document.getElementById(field.id);
        if (el) {
            el.value = field.val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            updatedIds.push(field.id);
        }
    });
    
    highlightInputs(updatedIds);
}

// Leaflet Map Init & Render
function initMap() {
    if (appState.map) {
        // Map already initialized. Clear markers and redraw
        appState.mapMarkers.forEach(m => appState.map.removeLayer(m));
        appState.mapMarkers = [];
        renderMapMarkers();
        return;
    }
    
    // Create map centered in Seattle
    appState.map = L.map('pollution-map', {
        zoomControl: false
    }).setView([47.6062, -122.3321], 11);
    
    L.control.zoom({ position: 'bottomright' }).addTo(appState.map);

    // Dark tiles from CARTO
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(appState.map);

    // Map click handler to prefill report Lat/Lng coordinates with drag support
    appState.map.on('click', (e) => {
        const lat = e.latlng.lat.toFixed(6);
        const lng = e.latlng.lng.toFixed(6);
        
        updateCoordinatesInForms(lat, lng);
        
        // Update or create a visual, draggable selection marker
        if (appState.selectionMarker) {
            appState.selectionMarker.setLatLng(e.latlng);
        } else {
            appState.selectionMarker = L.marker(e.latlng, {
                draggable: true,
                title: "Selected Location"
            }).addTo(appState.map);
            
            // Handle real-time dragging updates
            appState.selectionMarker.on('drag', (event) => {
                const draggedLatLng = event.latlng || event.target.getLatLng();
                updateCoordinatesInForms(draggedLatLng.lat.toFixed(6), draggedLatLng.lng.toFixed(6));
            });
            
            appState.selectionMarker.on('dragend', (event) => {
                const draggedLatLng = event.target.getLatLng();
                showToast(`Location updated to [${draggedLatLng.lat.toFixed(6)}, ${draggedLatLng.lng.toFixed(6)}]`, 'success');
            });
        }
        
        showToast(`Selected coordinates [${lat}, ${lng}] loaded into forms!`, 'success');
    });

    // Setup Toggle Heatmap event
    const heatBtn = document.getElementById('toggle-heatmap-btn');
    if (heatBtn) {
        // Reset states if map reinstantiated
        appState.isHeatmapActive = false;
        appState.heatmapLayer = null;
        heatBtn.className = "btn btn-secondary w-full";
        heatBtn.innerHTML = '<i class="fa-solid fa-fire-flame-curved" style="color: var(--warning);"></i> Toggle Heatmap Overlay';

        heatBtn.onclick = (e) => {
            e.preventDefault();
            appState.isHeatmapActive = !appState.isHeatmapActive;
            if (appState.isHeatmapActive) {
                heatBtn.className = "btn btn-primary w-full";
                heatBtn.innerHTML = '<i class="fa-solid fa-circle-nodes"></i> Show Marker Overlay';
                // Remove existing markers from map
                appState.mapMarkers.forEach(m => appState.map.removeLayer(m));
                renderHeatmap();
            } else {
                heatBtn.className = "btn btn-secondary w-full";
                heatBtn.innerHTML = '<i class="fa-solid fa-fire-flame-curved" style="color: var(--warning);"></i> Toggle Heatmap Overlay';
                // Remove heatmap layer
                if (appState.heatmapLayer) {
                    appState.map.removeLayer(appState.heatmapLayer);
                    appState.heatmapLayer = null;
                }
                // Redraw standard markers
                renderMapMarkers();
            }
        };
    }

    renderMapMarkers();
}

function renderMapMarkers() {
    // 1. Plot Water sources
    fetch('/api/sources')
        .then(res => res.json())
        .then(sources => {
            // Update IoT simulation select as well
            const simSelect = document.getElementById('sim-source-select');
            simSelect.innerHTML = "";
            
            sources.forEach(s => {
                // Populate simulator dropdown
                const opt = document.createElement('option');
                opt.value = s.source_id;
                opt.textContent = `${s.name} (${s.location})`;
                simSelect.appendChild(opt);
                
                // Color by safety severity
                let markerColor = 'var(--success)';
                if (s.severity === 'Moderate') markerColor = 'var(--warning)';
                if (s.severity === 'Unsafe') markerColor = 'var(--danger)';
                
                // Create circles
                const marker = L.circleMarker([s.latitude, s.longitude], {
                    radius: 11,
                    fillColor: markerColor,
                    color: '#fff',
                    weight: 1.5,
                    fillOpacity: 0.8
                }).addTo(appState.map);
                
                // Clicking a source marker also auto-populates the forms
                marker.on('click', () => {
                    const lat = s.latitude.toFixed(6);
                    const lng = s.longitude.toFixed(6);
                    updateCoordinatesInForms(lat, lng);
                    
                    // Auto-select this source in the report form dropdown
                    const repSourceSelect = document.getElementById('rep-source');
                    if (repSourceSelect) {
                        repSourceSelect.value = s.source_id;
                        repSourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    // Sync the draggable selection marker position
                    if (appState.selectionMarker) {
                        appState.selectionMarker.setLatLng([s.latitude, s.longitude]);
                    } else {
                        appState.selectionMarker = L.marker([s.latitude, s.longitude], {
                            draggable: true,
                            title: "Selected Location"
                        }).addTo(appState.map);
                        
                        appState.selectionMarker.on('drag', (event) => {
                            const draggedLatLng = event.latlng || event.target.getLatLng();
                            updateCoordinatesInForms(draggedLatLng.lat.toFixed(6), draggedLatLng.lng.toFixed(6));
                        });
                        appState.selectionMarker.on('dragend', (event) => {
                            const draggedLatLng = event.target.getLatLng();
                            showToast(`Location updated to [${draggedLatLng.lat.toFixed(6)}, ${draggedLatLng.lng.toFixed(6)}]`, 'success');
                        });
                    }
                    
                    showToast(`Selected source "${s.name}" coordinates loaded into forms!`, 'success');
                });
                
                // Detailed popup details
                const reading = s.latest_reading;
                let readingDetails = "<em>No reading data</em>";
                let alertSection = "";
                
                if (reading) {
                    readingDetails = `
                        <div class="map-popup-row"><strong>pH:</strong> <span>${reading.pH}</span></div>
                        <div class="map-popup-row"><strong>Turbidity:</strong> <span>${reading.turbidity} NTU</span></div>
                        <div class="map-popup-row"><strong>TDS:</strong> <span>${reading.tds} mg/L</span></div>
                        <div class="map-popup-row"><strong>Temp:</strong> <span>${reading.temperature} °C</span></div>
                        <div class="map-popup-row"><strong>DO:</strong> <span>${reading.dissolved_oxygen} mg/L</span></div>
                    `;
                }
                
                if (s.alerts && s.alerts.length > 0) {
                    alertSection = `
                        <div class="popup-alerts">
                            <strong><i class="fa-solid fa-triangle-exclamation"></i> Alerts:</strong>
                            <ul>${s.alerts.map(a => `<li>${a}</li>`).join('')}</ul>
                        </div>
                    `;
                }
                
                const popupContent = `
                    <div class="map-popup">
                        <div class="map-popup-header">
                            <h4>${s.name}</h4>
                            <span class="badge ${s.severity.toLowerCase()}">${s.severity} (Score: ${s.risk_score})</span>
                        </div>
                        ${readingDetails}
                        ${alertSection}
                        <button class="btn btn-sm btn-primary w-full" style="margin-top: 10px;" onclick="quickPredict(${s.source_id})">
                            <i class="fa-solid fa-brain"></i> AI Forecasts
                        </button>
                    </div>
                `;
                
                marker.bindPopup(popupContent);
                appState.mapMarkers.push(marker);
            });
        })
        .catch(err => console.error("Error plotting map sources:", err));

    // 2. Plot Community Reports
    fetch('/api/reports')
        .then(res => res.json())
        .then(reports => {
            reports.forEach(r => {
                // Purple warning warning marker icons
                const repMarker = L.circleMarker([r.latitude, r.longitude], {
                    radius: 7,
                    fillColor: 'var(--purple)',
                    color: '#fff',
                    weight: 1,
                    fillOpacity: 0.9
                }).addTo(appState.map);
                
                // Clicking a report marker also auto-populates the forms
                repMarker.on('click', () => {
                    const lat = r.latitude.toFixed(6);
                    const lng = r.longitude.toFixed(6);
                    updateCoordinatesInForms(lat, lng);
                    
                    // Match associated source if any
                    const repSourceSelect = document.getElementById('rep-source');
                    if (repSourceSelect) {
                        repSourceSelect.value = r.source_id || '';
                        repSourceSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    // Sync the draggable selection marker position
                    if (appState.selectionMarker) {
                        appState.selectionMarker.setLatLng([r.latitude, r.longitude]);
                    } else {
                        appState.selectionMarker = L.marker([r.latitude, r.longitude], {
                            draggable: true,
                            title: "Selected Location"
                        }).addTo(appState.map);
                        
                        appState.selectionMarker.on('drag', (event) => {
                            const draggedLatLng = event.latlng || event.target.getLatLng();
                            updateCoordinatesInForms(draggedLatLng.lat.toFixed(6), draggedLatLng.lng.toFixed(6));
                        });
                        appState.selectionMarker.on('dragend', (event) => {
                            const draggedLatLng = event.target.getLatLng();
                            showToast(`Location updated to [${draggedLatLng.lat.toFixed(6)}, ${draggedLatLng.lng.toFixed(6)}]`, 'success');
                        });
                    }
                    
                    showToast(`Selected report coordinates loaded into forms!`, 'success');
                });

                let imageHtml = "";
                if (r.image_filename) {
                    imageHtml = `<img src="/static/uploads/${r.image_filename}" style="width: 100%; border-radius: 4px; max-height: 80px; object-fit: cover; margin-top: 8px;" />`;
                }

                const popupContent = `
                    <div class="map-popup">
                        <div class="map-popup-header">
                            <h4 style="color: var(--purple)"><i class="fa-solid fa-circle-exclamation"></i> Citizen Incident</h4>
                            <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: var(--purple);">${r.issue_type}</span>
                        </div>
                        <p style="font-size: 11px; margin-bottom: 6px;">${r.description}</p>
                        <div class="map-popup-row" style="font-size: 10px; color: var(--text-muted);">
                            <strong>By:</strong> <span>${r.reporter_name}</span>
                        </div>
                        <div class="map-popup-row" style="font-size: 10px; color: var(--text-muted);">
                            <strong>Reported:</strong> <span>${new Date(r.timestamp).toLocaleDateString()}</span>
                        </div>
                        ${imageHtml}
                    </div>
                `;
                
                repMarker.bindPopup(popupContent);
                appState.mapMarkers.push(repMarker);
            });
        })
        .catch(err => console.error("Error plotting reports markers:", err));
}

// Redirect trigger from Leaflet Map popups
window.quickPredict = function(sourceId) {
    // Switch to predict tab
    const navItem = document.querySelector('[data-tab="predictions"]');
    if (navItem) {
        navItem.click();
        const predSelect = document.getElementById('pred-source-select');
        if (predSelect) {
            predSelect.value = sourceId;
            // Auto predict
            document.getElementById('run-prediction-btn').click();
        }
    }
};

// AI Forecasting initialization
function loadPredictionSources() {
    fetch('/api/sources')
        .then(res => res.json())
        .then(sources => {
            const predSelect = document.getElementById('pred-source-select');
            const currentSelected = predSelect.value;
            predSelect.innerHTML = "";
            sources.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.source_id;
                opt.textContent = `${s.name} (${s.location})`;
                predSelect.appendChild(opt);
            });

            if (currentSelected && sources.some(s => s.source_id == currentSelected)) {
                predSelect.value = currentSelected;
            }

            // Set up prediction listener once
            const runBtn = document.getElementById('run-prediction-btn');
            runBtn.onclick = () => runAIPrediction();
        })
        .catch(err => console.error("Error loading sources for prediction dropdown:", err));
}

function runAIPrediction() {
    const sourceId = document.getElementById('pred-source-select').value;
    const algorithm = document.getElementById('pred-algo-select').value;
    
    if (!sourceId) return;

    // Load recent actuals to combine with predictions for visualization
    Promise.all([
        fetch(`/api/readings?source_id=${sourceId}`).then(res => res.json()),
        fetch(`/api/predict?source_id=${sourceId}&algorithm=${algorithm}`).then(res => res.json())
    ])
    .then(([historical, predicted]) => {
        appState.predictionData = predicted;
        
        // Take the last 7 historical data points
        const lastHistorical = historical.slice(-7);
        
        // Format lists for labels and values
        const historicalLabels = lastHistorical.map(h => {
            const d = new Date(h.timestamp);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
        
        const predictedLabels = predicted.map(p => {
            const d = new Date(p.timestamp);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + " (Pred)";
        });
        
        const combinedLabels = [...historicalLabels, ...predictedLabels];
        
        // Parameter series
        const histPh = lastHistorical.map(h => h.pH);
        const predPh = predicted.map(p => p.pH);
        
        const histTurb = lastHistorical.map(h => h.turbidity);
        const predTurb = predicted.map(p => p.turbidity);
        
        const histTds = lastHistorical.map(h => h.tds);
        const predTds = predicted.map(p => p.tds);
        
        const histDo = lastHistorical.map(h => h.dissolved_oxygen);
        const predDo = predicted.map(p => p.dissolved_oxygen);

        // Render predicted Charts
        drawPredChart('pred-ph-chart', 'predPh', combinedLabels, histPh, predPh, 'pH level', '#10b981');
        drawPredChart('pred-turb-chart', 'predTurb', combinedLabels, histTurb, predTurb, 'Turbidity (NTU)', '#8b5cf6');
        drawPredChart('pred-tds-chart', 'predTds', combinedLabels, histTds, predTds, 'TDS (mg/L)', '#f59e0b');
        drawPredChart('pred-do-chart', 'predDo', combinedLabels, histDo, predDo, 'Dissolved Oxygen (mg/L)', '#06b6d4');

        // Populate table records
        const tbody = document.querySelector('#prediction-table tbody');
        tbody.innerHTML = "";
        predicted.forEach(p => {
            const tr = document.createElement('tr');
            const dateStr = new Date(p.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            
            tr.innerHTML = `
                <td><strong>Day +${p.day}</strong></td>
                <td>${dateStr}</td>
                <td>${p.pH}</td>
                <td>${p.turbidity} NTU</td>
                <td>${p.tds} mg/L</td>
                <td>${p.dissolved_oxygen} mg/L</td>
                <td>${p.risk_score}</td>
                <td><span class="badge ${p.severity.toLowerCase()}">${p.severity}</span></td>
            `;
            tbody.appendChild(tr);
        });
    })
    .catch(err => console.error("Error executing predictions:", err));
}

// Chart.js forecast generator (renders actual vs predictions)
function drawPredChart(canvasId, chartKey, labels, historicalData, predictedData, labelName, color) {
    if (activeCharts[chartKey]) {
        activeCharts[chartKey].destroy();
    }
    
    // Build values with padded nulls so lines overlap/align properly
    const histSeries = [...historicalData];
    for (let i = 0; i < predictedData.length; i++) {
        histSeries.push(null);
    }
    
    const predSeries = [];
    for (let i = 0; i < historicalData.length - 1; i++) {
        predSeries.push(null);
    }
    predSeries.push(historicalData[historicalData.length - 1]);
    predictedData.forEach(p => predSeries.push(p));

    const ctx = document.getElementById(canvasId).getContext('2d');
    activeCharts[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Historical Actuals',
                    data: histSeries,
                    borderColor: color,
                    borderWidth: 2,
                    tension: 0.2,
                    fill: false,
                    pointRadius: 2
                },
                {
                    label: '7-Day ML Forecast',
                    data: predSeries,
                    borderColor: color,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.2,
                    fill: false,
                    pointRadius: 4,
                    pointBackgroundColor: color
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#f3f4f6' }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: 'var(--text-secondary)', maxTicksLimit: 14 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: 'var(--text-secondary)' }
                }
            }
        }
    });
}

// Community Reports page rendering & filtering
function loadReportsFeed() {
    // Load associated sources in form select
    fetch('/api/sources')
        .then(res => res.json())
        .then(sources => {
            const selectEl = document.getElementById('rep-source');
            selectEl.innerHTML = '<option value="">None / Other Location</option>';
            sources.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.source_id;
                opt.textContent = `${s.name} (${s.location})`;
                selectEl.appendChild(opt);
            });
        });

    // Populate actual reports list
    fetch('/api/reports')
        .then(res => res.json())
        .then(reports => {
            appState.reports = reports;
            
            // Wire up search & filter listeners
            const searchInput = document.getElementById('report-search-input');
            const statusFilter = document.getElementById('report-status-filter');
            const issueFilter = document.getElementById('report-issue-filter');
            
            const filterHandler = () => filterAndRenderReports();
            
            if (searchInput) searchInput.oninput = filterHandler;
            if (statusFilter) statusFilter.onchange = filterHandler;
            if (issueFilter) issueFilter.onchange = filterHandler;
            
            filterAndRenderReports();
        })
        .catch(err => console.error("Error loading community reports feed:", err));
}

function filterAndRenderReports() {
    const query = document.getElementById('report-search-input')?.value.toLowerCase() || '';
    const statusVal = document.getElementById('report-status-filter')?.value || 'ALL';
    const issueVal = document.getElementById('report-issue-filter')?.value || 'ALL';
    
    let filtered = appState.reports.filter(r => {
        const matchesQuery = !query || 
            (r.description && r.description.toLowerCase().includes(query)) ||
            (r.reporter_name && r.reporter_name.toLowerCase().includes(query)) ||
            (r.issue_type && r.issue_type.toLowerCase().includes(query));
            
        const matchesStatus = statusVal === 'ALL' || (r.status || 'Pending') === statusVal;
        const matchesIssue = issueVal === 'ALL' || r.issue_type === issueVal;
        
        return matchesQuery && matchesStatus && matchesIssue;
    });
    
    renderReportsList(filtered);
}

function renderReportsList(reports) {
    const container = document.getElementById('community-reports-list');
    container.innerHTML = "";
    
    if (reports.length === 0) {
        container.innerHTML = `<div class="glass flex-center" style="padding: 40px; color: var(--text-muted);">No incident reports match your current filter.</div>`;
        return;
    }
    
    reports.forEach(r => {
        const card = document.createElement('div');
        card.className = "report-card glass";
        
        const dateStr = new Date(r.timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const status = r.status || 'Pending';
        let statusBadgeClass = 'warning';
        if (status === 'Investigating') statusBadgeClass = 'primary';
        if (status === 'Resolved') statusBadgeClass = 'safe';
        
        let imgHtml = "";
        if (r.image_filename) {
            imgHtml = `<img src="/static/uploads/${r.image_filename}" class="report-image-preview" alt="Evidence image" />`;
        }
        
        card.innerHTML = `
            <div class="report-card-header">
                <div class="reporter-meta">
                    <strong>${r.reporter_name}</strong>
                    <span>${dateStr}</span>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span class="report-tag">${r.issue_type}</span>
                    <span class="badge ${statusBadgeClass}">${status}</span>
                </div>
            </div>
            <p>${r.description}</p>
            ${imgHtml}
            <div class="report-meta-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                <div class="report-location-badge">
                    <i class="fa-solid fa-location-dot"></i>
                    <span>Coordinates: ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</span>
                </div>
                <div class="report-status-actions" style="display: flex; gap: 6px;">
                    ${status !== 'Investigating' ? `<button class="btn btn-sm btn-secondary" onclick="updateReportStatus(${r.report_id}, 'Investigating')"><i class="fa-solid fa-magnifying-glass"></i> Investigating</button>` : ''}
                    ${status !== 'Resolved' ? `<button class="btn btn-sm btn-primary" onclick="updateReportStatus(${r.report_id}, 'Resolved')"><i class="fa-solid fa-circle-check"></i> Mark Resolved</button>` : ''}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Global window function for updating report status
window.updateReportStatus = function(reportId, newStatus) {
    fetch(`/api/reports/${reportId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast("Error updating status: " + data.error, "warning");
        } else {
            showToast(`Report #${reportId} status set to '${newStatus}'!`, "success");
            loadReportsFeed();
        }
    })
    .catch(err => console.error("Error updating report status:", err));
};

// 5. Render Heatmap Overlay
function renderHeatmap() {
    if (appState.heatmapLayer) {
        appState.map.removeLayer(appState.heatmapLayer);
        appState.heatmapLayer = null;
    }

    Promise.all([
        fetch('/api/sources').then(res => res.json()),
        fetch('/api/reports').then(res => res.json())
    ])
    .then(([sources, reports]) => {
        let heatPoints = [];

        // Add water sources with intensity based on risk score
        sources.forEach(s => {
            if (s.risk_score !== undefined) {
                heatPoints.push([s.latitude, s.longitude, s.risk_score / 100.0]);
            }
        });

        // Add citizen reports as minor hot spots
        reports.forEach(r => {
            heatPoints.push([r.latitude, r.longitude, 0.75]);
        });

        if (heatPoints.length > 0) {
            appState.heatmapLayer = L.heatLayer(heatPoints, {
                radius: 32,
                blur: 18,
                maxZoom: 14,
                gradient: {0.4: '#3b82f6', 0.65: '#10b981', 1: '#ef4444'}
            }).addTo(appState.map);
        }
    })
    .catch(err => console.error("Error drawing heatmap:", err));
}

// 6. Fetch Model MAE metrics
function loadModelMetrics() {
    fetch('/api/metrics')
        .then(res => res.json())
        .then(metrics => {
            if (metrics.ph) {
                document.getElementById('rf-ph-mae').textContent = metrics.ph.rf_mae;
                document.getElementById('lr-ph-mae').textContent = metrics.ph.lr_mae;
            }
            if (metrics.turbidity) {
                document.getElementById('rf-turb-mae').textContent = metrics.turbidity.rf_mae + " NTU";
                document.getElementById('lr-turb-mae').textContent = metrics.turbidity.lr_mae + " NTU";
            }
            if (metrics.tds) {
                document.getElementById('rf-tds-mae').textContent = metrics.tds.rf_mae + " mg/L";
                document.getElementById('lr-tds-mae').textContent = metrics.tds.lr_mae + " mg/L";
            }
            if (metrics.do) {
                document.getElementById('rf-do-mae').textContent = metrics.do.rf_mae + " mg/L";
                document.getElementById('lr-do-mae').textContent = metrics.do.lr_mae + " mg/L";
            }
            if (metrics.temperature) {
                document.getElementById('rf-temp-mae').textContent = metrics.temperature.rf_mae + " °C";
                document.getElementById('lr-temp-mae').textContent = metrics.temperature.lr_mae + " °C";
            }
            
            const phBest = metrics.ph?.rf_mae < metrics.ph?.lr_mae ? "Random Forest" : "Linear Regression";
            const tdsBest = metrics.tds?.rf_mae < metrics.tds?.lr_mae ? "Random Forest" : "Linear Regression";
            
            let recommendationText = "";
            if (phBest === tdsBest) {
                const pct = Math.round(((metrics.tds.lr_mae - metrics.tds.rf_mae) / metrics.tds.lr_mae) * 100);
                recommendationText = `${phBest} is recommended (${pct}% lower validation MAE error overall)`;
            } else {
                recommendationText = `Random Forest is recommended for TDS, Linear Regression for pH.`;
            }
            
            document.getElementById('metrics-recommendation').textContent = recommendationText;
        })
        .catch(err => console.error("Error loading model metrics:", err));
}

// 7. WHO & EPA Safety Standards Modal Handler
function initStandardsModal() {
    const openBtn = document.getElementById('open-standards-modal-btn');
    const closeBtn = document.getElementById('close-standards-modal-btn');
    const modal = document.getElementById('standards-modal');

    if (openBtn && modal) {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            modal.classList.remove('hidden');
        });
    }

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            modal.classList.add('hidden');
        });
    }

    // Support pressing Escape key to dismiss modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    });

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }
}

// 8. IoT Telemetry Auto-Streaming Loop
function initAutoStream() {
    const toggleBtn = document.getElementById('toggle-autostream-btn');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (appState.autoStreamTimer) {
            // Stop streaming
            clearInterval(appState.autoStreamTimer);
            appState.autoStreamTimer = null;
            toggleBtn.innerHTML = '<i class="fa-solid fa-play"></i> Auto';
            toggleBtn.className = 'btn btn-secondary';
            toggleBtn.title = 'Auto Stream Sensor Data';
            showToast("IoT Telemetry Auto-Streaming paused.", "info");
        } else {
            // Start streaming
            toggleBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
            toggleBtn.className = 'btn btn-danger';
            toggleBtn.title = 'Stop Auto Streaming';
            showToast("IoT Telemetry Auto-Streaming started (ingesting every 3.5s)...", "success");

            // Execute immediately once, then repeat
            streamSingleSensorReading();
            appState.autoStreamTimer = setInterval(streamSingleSensorReading, 3500);
        }
    });
}

function streamSingleSensorReading() {
    const simSelect = document.getElementById('sim-source-select');
    if (!simSelect || !simSelect.options || simSelect.options.length === 0) return;

    const sourceIds = Array.from(simSelect.options).map(o => o.value).filter(Boolean);
    if (sourceIds.length === 0) return;

    const randomSourceId = parseInt(sourceIds[Math.floor(Math.random() * sourceIds.length)]);

    // Generate realistic fluctuating telemetry values
    const phVal = parseFloat((6.8 + (Math.random() * 1.8)).toFixed(1)); // 6.8 - 8.6
    const turbVal = parseFloat((0.8 + (Math.random() * 4.5)).toFixed(1)); // 0.8 - 5.3 NTU
    const tdsVal = Math.round(140 + Math.random() * 320); // 140 - 460 mg/L
    const tempVal = parseFloat((14.0 + (Math.random() * 8.0)).toFixed(1)); // 14.0 - 22.0 °C
    const doVal = parseFloat((6.5 + (Math.random() * 3.0)).toFixed(1)); // 6.5 - 9.5 mg/L
    const condVal = Math.round(tdsVal * 1.56);

    const payload = {
        source_id: randomSourceId,
        pH: phVal,
        turbidity: turbVal,
        tds: tdsVal,
        temperature: tempVal,
        dissolved_oxygen: doVal,
        conductivity: condVal
    };

    fetch('/api/readings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (!data.error) {
            showToast(`[IoT Telemetry] Live Stream (Source #${randomSourceId}): pH=${phVal}, Turb=${turbVal} NTU, TDS=${tdsVal} mg/L`, "info");
            
            // Dynamic refresh active tab views
            if (appState.activeTab === 'dashboard') {
                loadDashboardData();
            } else if (appState.activeTab === 'map') {
                if (appState.isHeatmapActive) {
                    renderHeatmap();
                } else {
                    renderMapMarkers();
                }
            }
        }
    })
    .catch(err => console.error("Auto stream ingestion error:", err));
}

