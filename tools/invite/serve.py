#!/usr/bin/env python3
"""Serve the repo on the LAN so the invite can be opened on a phone.

Detaches from the calling shell, so it keeps running after the terminal that
started it goes away. Writes its pid to /tmp/invite-server.pid.

    python3 tools/invite/serve.py          # start
    python3 tools/invite/serve.py --stop   # stop
"""

import functools
import http.server
import os
import signal
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORT = 8765
PIDFILE = Path("/tmp/invite-server.pid")
LOGFILE = Path("/tmp/invite-server.log")


def lan_ip():
    """The address a phone on the same wifi can reach. Connecting a UDP socket
    does not send anything; it just asks the OS which interface it would use."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def read_pid():
    try:
        return int(PIDFILE.read_text().strip())
    except (OSError, ValueError):
        return None


def running(pid):
    if not pid:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop():
    pid = read_pid()
    if not running(pid):
        print("not running")
        PIDFILE.unlink(missing_ok=True)
        return
    os.kill(pid, signal.SIGTERM)
    PIDFILE.unlink(missing_ok=True)
    print("stopped pid %d" % pid)


def start():
    pid = read_pid()
    if running(pid):
        print("already running (pid %d) at http://%s:%d/i/preview/" % (pid, lan_ip(), PORT))
        return

    # Double fork, so the server ends up with no controlling terminal and is
    # not killed when the shell that launched it exits.
    if os.fork():
        return
    os.setsid()
    if os.fork():
        os._exit(0)

    log = open(LOGFILE, "ab", buffering=0)
    os.dup2(log.fileno(), 1)
    os.dup2(log.fileno(), 2)
    devnull = open(os.devnull, "rb")
    os.dup2(devnull.fileno(), 0)

    PIDFILE.write_text(str(os.getpid()))
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler, directory=str(ROOT)
    )
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler).serve_forever()


if __name__ == "__main__":
    if "--stop" in sys.argv:
        stop()
    else:
        start()
        if os.getpid() == os.getpid():
            print("serving %s" % ROOT)
            print("  this machine: http://localhost:%d/i/preview/" % PORT)
            print("  on the wifi:  http://%s:%d/i/preview/" % (lan_ip(), PORT))
            print("  stop with:    python3 tools/invite/serve.py --stop")
