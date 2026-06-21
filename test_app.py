import os
import unittest
import tempfile
import json
import database
import models
import app

class WaterQualitySystemTestCase(unittest.TestCase):
    def setUp(self):
        # Create a temporary database file
        self.db_fd, self.temp_db_path = tempfile.mkstemp()
        database.DATABASE_PATH = self.temp_db_path
        
        # Configure app for testing
        app.app.config['TESTING'] = True
        self.client = app.app.test_client()
        
        # Initialize clean database schema
        database.init_db()
        
    def tearDown(self):
        # Close and remove temp database file
        os.close(self.db_fd)
        if os.path.exists(self.temp_db_path):
            os.unlink(self.temp_db_path)
            
    def test_database_operations(self):
        # Test adding a source
        sid = database.add_source("Test Lake", "Test Sector", "Lake", 45.0, -122.0)
        self.assertIsNotNone(sid)
        
        sources = database.get_all_sources()
        self.assertEqual(len(sources), 1)
        self.assertEqual(sources[0]['name'], "Test Lake")
        
        # Test adding readings
        rid = database.add_reading(sid, 7.2, 1.5, 180.0, 16.0, 8.5, 280.0)
        self.assertIsNotNone(rid)
        
        readings = database.get_readings_for_source(sid)
        self.assertEqual(len(readings), 1)
        self.assertEqual(readings[0]['pH'], 7.2)
        
    def test_rules_engine_pollution_detection(self):
        # Safe water limits
        score_safe, sev_safe = models.calculate_risk_score_and_severity(7.2, 1.2, 180.0, 15.0, 8.5, 280.0)
        self.assertEqual(sev_safe, "Safe")
        self.assertLessEqual(score_safe, 30.0)
        
        # Acidic pH Alert
        score_acidic, sev_acidic = models.calculate_risk_score_and_severity(5.0, 1.2, 180.0, 15.0, 8.5, 280.0)
        self.assertIn(sev_acidic, ["Moderate", "Unsafe"])
        self.assertGreater(score_acidic, 30.0)
        
        # High TDS Alert
        score_high_tds, sev_high_tds = models.calculate_risk_score_and_severity(7.2, 1.2, 800.0, 15.0, 8.5, 1200.0)
        self.assertIn(sev_high_tds, ["Moderate", "Unsafe"])
        
    def test_ml_model_prediction(self):
        # Seed several mock entries to allow models to train
        sid = database.add_source("Model Site", "East District", "River", 47.0, -122.0)
        
        # Create historical sequence
        for i in range(15):
            database.add_reading(
                sid, 
                pH=7.0 + (i % 2) * 0.2, 
                turbidity=1.0 + (i % 3) * 0.5, 
                tds=200.0 + (i % 5) * 15.0, 
                temperature=15.0, 
                dissolved_oxygen=8.0, 
                conductivity=350.0,
                timestamp=f"2026-06-{10+i:02d}T10:00:00"
            )
            
        # Train
        success = models.train_all_models()
        self.assertTrue(success)
        
        # Forecast
        preds_rf = models.predict_future(sid, days=7, algorithm='rf')
        self.assertEqual(len(preds_rf), 7)
        self.assertEqual(preds_rf[0]['day'], 1)
        self.assertIn('pH', preds_rf[0])
        self.assertIn('tds', preds_rf[0])
        self.assertIn('severity', preds_rf[0])
        
        preds_lr = models.predict_future(sid, days=7, algorithm='lr')
        self.assertEqual(len(preds_lr), 7)

    def test_api_endpoints(self):
        # 1. Test POST /api/sources
        source_payload = {
            "name": "API River",
            "location": "Renton Area",
            "source_type": "River",
            "latitude": 47.4789,
            "longitude": -122.2031
        }
        res = self.client.post('/api/sources', 
                               data=json.dumps(source_payload), 
                               content_type='application/json')
        self.assertEqual(res.status_code, 201)
        res_data = json.loads(res.data)
        self.assertIn('source_id', res_data)
        sid = res_data['source_id']
        
        # 2. Test GET /api/sources
        res_get = self.client.get('/api/sources')
        self.assertEqual(res_get.status_code, 200)
        sources_list = json.loads(res_get.data)
        self.assertEqual(len(sources_list), 1)
        self.assertEqual(sources_list[0]['name'], "API River")
        
        # 3. Test POST /api/readings
        reading_payload = {
            "source_id": sid,
            "pH": 7.4,
            "turbidity": 0.8,
            "tds": 120.0,
            "temperature": 14.5,
            "dissolved_oxygen": 9.2,
            "conductivity": 190.0
        }
        res_read = self.client.post('/api/readings',
                                    data=json.dumps(reading_payload),
                                    content_type='application/json')
        self.assertEqual(res_read.status_code, 201)
        
        # 4. Test GET /api/readings
        res_read_get = self.client.get(f'/api/readings?source_id={sid}')
        self.assertEqual(res_read_get.status_code, 200)
        readings_list = json.loads(res_read_get.data)
        self.assertEqual(len(readings_list), 1)
        self.assertEqual(readings_list[0]['pH'], 7.4)

        # 5. Test POST /api/reports (Community Reports)
        report_data = {
            "reporter_name": "Test User",
            "source_id": str(sid),
            "issue_type": "Water discoloration",
            "description": "It looks very yellow.",
            "latitude": "47.4795",
            "longitude": "-122.2035"
        }
        res_rep = self.client.post('/api/reports', data=report_data)
        self.assertEqual(res_rep.status_code, 201)
        
        # 6. Test GET /api/reports
        res_rep_get = self.client.get('/api/reports')
        self.assertEqual(res_rep_get.status_code, 200)
        reports_list = json.loads(res_rep_get.data)
        self.assertEqual(len(reports_list), 1)
        self.assertEqual(reports_list[0]['issue_type'], "Water discoloration")

        # 7. Test GET /api/analytics
        res_an = self.client.get('/api/analytics')
        self.assertEqual(res_an.status_code, 200)
        an_data = json.loads(res_an.data)
        self.assertEqual(an_data['total_sources'], 1)
        self.assertEqual(an_data['total_reports'], 1)

if __name__ == '__main__':
    unittest.main()
