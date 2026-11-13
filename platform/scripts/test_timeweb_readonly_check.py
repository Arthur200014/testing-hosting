import http.server
import importlib.util
import pathlib
import sys
import threading
import unittest

SCRIPT = pathlib.Path(__file__).with_name("timeweb-readonly-check.py")
spec = importlib.util.spec_from_file_location("readonly_check", SCRIPT)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

class Handler(http.server.BaseHTTPRequestHandler):
    calls = []
    unauthorized = True

    def do_GET(self):
        Handler.calls.append((self.command, self.path))
        if self.path == "/api/v1/teacher/students":
            code = 401 if Handler.unauthorized else 200
        elif self.path in {"/health/live", "/health/ready", "/health/migrations"}:
            code = 200
        else:
            code = 404
        self.send_response(code)
        self.end_headers()
        self.wfile.write(b"synthetic")

    def log_message(self, format, *args):
        pass

class ReadOnlyProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.origin = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        Handler.calls = []
        Handler.unauthorized = True

    def test_four_safe_gets_return_health_and_no_anonymous_data(self):
        results = mod.check_all(self.origin)
        self.assertEqual(len(results), 4)
        self.assertTrue(all(item.ok for item in results))
        self.assertEqual(results[-1].status, 401)
        self.assertGreaterEqual(results[0].total_ms, 0)
        self.assertEqual(Handler.calls, [("GET", path) for path, _ in mod.CHECKS])

    def test_unprotected_teacher_endpoint_is_detected(self):
        Handler.unauthorized = False
        result = mod.probe(self.origin, "/api/v1/teacher/students", {401, 403})
        self.assertFalse(result.ok)
        self.assertEqual(result.status, 200)

    def test_failing_health_is_not_reported_healthy(self):
        result = mod.probe(self.origin, "/health/nonexistent", {200})
        self.assertFalse(result.ok)
        self.assertEqual(result.status, 404)

if __name__ == "__main__":
    unittest.main()
