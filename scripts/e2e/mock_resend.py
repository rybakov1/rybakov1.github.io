import json, http.server
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get('content-length',0)))
        with open('/tmp/e2e/received.jsonl','a') as f:
            f.write(json.dumps({"path":self.path,"auth":self.headers.get('authorization'),"idem":self.headers.get('idempotency-key'),"body":json.loads(body)})+"\n")
        self.send_response(200); self.send_header('content-type','application/json'); self.end_headers()
        self.wfile.write(b'{"id":"mock-email-123"}')
    def log_message(self,*a): pass
http.server.HTTPServer(('127.0.0.1',8799),H).serve_forever()
