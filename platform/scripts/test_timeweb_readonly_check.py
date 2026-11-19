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
    new_preview_route = True
    board_status = 200
    teacher_board_status = 200
    board_signature = True

    def do_GET(self):
        Handler.calls.append((self.command, self.path))
        if self.path == "/api/v1/teacher/students":
            code = 401 if Handler.unauthorized else 200
        elif self.path in {"/health/live", "/health/ready", "/health/migrations"}:
            code = 200
        elif self.path == mod.BOARD_CHECKS[0][0]:
            code = Handler.board_status
        elif self.path == mod.BOARD_CHECKS[1][0]:
            code = Handler.teacher_board_status
        else:
            code = 404
        self.send_response(code)
        self.end_headers()
        if self.path == mod.BOARD_CHECKS[0][0]:
            body = (mod.BOARD_CHECKS[0][2] if Handler.board_signature
                    else b"<html><title>Unrelated page</title></html>")
        elif self.path == mod.BOARD_CHECKS[1][0]:
            body = b"<title>Teacher AI Student</title>"
        else:
            body = b"synthetic"
        self.wfile.write(body)

    def do_POST(self):
        Handler.calls.append((self.command, self.path))
        code = 401 if (self.path == mod.NEW_API_PROBE and Handler.new_preview_route) else 405
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
        Handler.new_preview_route = True
        Handler.board_status = 200
        Handler.teacher_board_status = 200
        Handler.board_signature = True

    def test_hosted_editor_and_cabinet_are_readable_without_writes(self):
        results = mod.check_all(self.origin)
        self.assertEqual(len(results), 7)
        self.assertTrue(all(item.ok for item in results))
        self.assertEqual(results[len(mod.CHECKS)].status, 401)
        self.assertGreaterEqual(results[0].total_ms, 0)
        expected_calls = [("GET", path) for path, _ in mod.CHECKS]
        expected_calls.append(("POST", mod.NEW_API_PROBE))
        expected_calls.extend(("GET", path) for path, _, _ in mod.BOARD_CHECKS)
        self.assertEqual(Handler.calls, expected_calls)

    def test_502_editor_is_detected_even_when_main_api_is_healthy(self):
        Handler.board_status = 502
        results = mod.check_all(self.origin)
        self.assertTrue(all(item.ok for item in results[:5]))
        self.assertFalse(results[5].ok)
        self.assertEqual(results[5].status, 502)
        self.assertTrue(results[6].ok)

    def test_404_editor_is_detected(self):
        Handler.board_status = 404
        results = mod.check_all(self.origin)
        self.assertFalse(results[5].ok)
        self.assertEqual(results[5].status, 404)

    def test_unrelated_http_200_is_not_accepted_as_editor(self):
        Handler.board_signature = False
        results = mod.check_all(self.origin)
        self.assertEqual(results[5].status, 200)
        self.assertFalse(results[5].ok)

    def test_teacher_cabinet_relay_502_is_detected(self):
        Handler.teacher_board_status = 502
        results = mod.check_all(self.origin)
        self.assertTrue(results[5].ok)
        self.assertFalse(results[6].ok)
        self.assertEqual(results[6].status, 502)

    def test_old_api_missing_post_route_is_detected(self):
        Handler.new_preview_route = False
        result = mod.probe(self.origin, mod.NEW_API_PROBE, {401, 403}, method="POST")
        self.assertFalse(result.ok)
        self.assertEqual(result.status, 405)

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
