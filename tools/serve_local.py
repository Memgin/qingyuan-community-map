import http.server

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # no browser cache, always serve the latest code
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 8001), Handler)
    print("serving on http://127.0.0.1:8001  (keep this window open)")
    server.serve_forever()
