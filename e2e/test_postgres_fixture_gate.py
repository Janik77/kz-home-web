import socket
from socketserver import BaseRequestHandler, ThreadingTCPServer
import threading
import unittest

from postgres_fixture_gate import LoopbackPostgresGate


class GateTests(unittest.TestCase):
    def test_blocks_established_and_new_connections_then_recovers(self):
        class Echo(BaseRequestHandler):
            def handle(self):
                while data := self.request.recv(65536):
                    self.request.sendall(data)

        with ThreadingTCPServer(("127.0.0.1", 0), Echo) as upstream, LoopbackPostgresGate() as gate:
            upstream.daemon_threads = True
            thread = threading.Thread(target=upstream.serve_forever, daemon=True)
            thread.start()
            try:
                address = ("127.0.0.1", gate.start(upstream.server_address[1]))
                with socket.create_connection(address, timeout=2) as original:
                    original.sendall(b"first")
                    self.assertEqual(original.recv(5), b"first")
                    gate.block()
                    self.assertEqual(original.recv(1), b"")
                    with socket.create_connection(address, timeout=2) as refused:
                        self.assertEqual(refused.recv(1), b"")
                gate.unblock()
                with socket.create_connection(address, timeout=2) as recovered:
                    recovered.sendall(b"again")
                    self.assertEqual(recovered.recv(5), b"again")
            finally:
                upstream.shutdown()
                thread.join()
