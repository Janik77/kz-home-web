"""TCP fault injection only for the disjoint loopback PostgreSQL fixture."""

import contextlib
import select
import socket
import socketserver
import threading


class LoopbackPostgresGate:
    def __init__(self):
        self._lock = threading.Lock()
        self._pairs = set()
        self._blocked = False
        self._server = None
        self._thread = None

    def start(self, upstream_port):
        if self._server is not None:
            raise RuntimeError("Already started")
        gate = self

        class Forward(socketserver.BaseRequestHandler):
            def handle(self):
                with gate._lock:
                    if gate._blocked:
                        return
                    try:
                        upstream = socket.create_connection(("127.0.0.1", upstream_port), timeout=2)
                    except OSError:
                        return
                    pair = (self.request, upstream)
                    gate._pairs.add(pair)
                try:
                    while True:
                        readable, _, _ = select.select(pair, (), ())
                        for source in readable:
                            destination = upstream if source is self.request else self.request
                            data = source.recv(65536)
                            if not data:
                                return
                            destination.sendall(data)
                except OSError:
                    pass
                finally:
                    with gate._lock:
                        gate._pairs.discard(pair)
                    upstream.close()

        self._server = socketserver.ThreadingTCPServer(("127.0.0.1", 0), Forward)
        self._server.daemon_threads = True
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self._server.server_address[1]

    def block(self):
        with self._lock:
            self._blocked = True
            for pair in self._pairs:
                for endpoint in pair:
                    with contextlib.suppress(OSError):
                        endpoint.shutdown(socket.SHUT_RDWR)

    def unblock(self):
        with self._lock:
            self._blocked = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        if self._server is not None:
            self.block()
            self._server.shutdown()
            self._server.server_close()
            self._thread.join()
