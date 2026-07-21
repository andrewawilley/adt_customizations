#!/usr/bin/env python3
"""Lightweight HTTPS static-file server for local testing.

Serves the files in this directory over HTTPS with permissive CORS headers so
third-party bundles can be loaded from a Five9 / Salesforce context.

Portability: on first run this script checks for a TLS certificate/key pair and
automatically generates a self-signed one (localhost.crt / localhost.key) if it
is missing. That means the repo can be cloned and run on any machine (macOS,
Linux, Windows) without any manual OpenSSL setup. Certificate generation uses
the `cryptography` package when available and otherwise falls back to the
`openssl` command-line tool.

Usage:
    python3 localserve.py                 # serve on https://localhost:4443
    python3 localserve.py --port 8443     # custom port
    python3 localserve.py --host 0.0.0.0  # bind all interfaces (LAN testing)
    python3 localserve.py --regen-cert    # force-regenerate the certificate
"""

import argparse
import http.server
import os
import shutil
import ssl
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CERT_FILE = os.path.join(HERE, "localhost.crt")
KEY_FILE = os.path.join(HERE, "localhost.key")


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Static file handler that adds permissive CORS headers."""

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):  # noqa: N802 (http.server naming convention)
        self.send_response(204)
        self.end_headers()

    def translate_path(self, path):
        # Always serve files relative to this script's directory, regardless of
        # the current working directory the server was launched from.
        rel = super().translate_path(path)
        return os.path.join(HERE, os.path.relpath(rel, os.getcwd()))


def _generate_with_cryptography():
    """Generate a self-signed cert using the `cryptography` package.

    Returns True on success, False if the package is not installed.
    """
    try:
        import datetime
        import ipaddress

        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.x509.oid import NameOID
    except ImportError:
        return False

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    san = x509.SubjectAlternativeName(
        [
            x509.DNSName("localhost"),
            x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
            x509.IPAddress(ipaddress.IPv6Address("::1")),
        ]
    )
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=825))
        .add_extension(san, critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    with open(KEY_FILE, "wb") as fh:
        fh.write(
            key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.TraditionalOpenSSL,
                encryption_algorithm=serialization.NoEncryption(),
            )
        )
    with open(CERT_FILE, "wb") as fh:
        fh.write(cert.public_bytes(serialization.Encoding.PEM))
    return True


def _generate_with_openssl():
    """Generate a self-signed cert using the `openssl` CLI.

    Returns True on success, False if openssl is not on PATH.
    """
    openssl = shutil.which("openssl")
    if not openssl:
        return False

    subprocess.run(
        [
            openssl,
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-sha256",
            "-days",
            "825",
            "-nodes",
            "-keyout",
            KEY_FILE,
            "-out",
            CERT_FILE,
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1",
        ],
        check=True,
    )
    return True


def ensure_certificate(force=False):
    """Ensure a TLS cert/key pair exists, generating one if needed."""
    have_cert = os.path.exists(CERT_FILE) and os.path.exists(KEY_FILE)
    if have_cert and not force:
        return

    action = "Regenerating" if have_cert else "No TLS certificate found - generating"
    print(f"{action} a self-signed certificate for localhost...")

    if _generate_with_cryptography() or _generate_with_openssl():
        print(f"  -> wrote {os.path.basename(CERT_FILE)} and {os.path.basename(KEY_FILE)}")
        return

    sys.exit(
        "ERROR: could not generate a certificate.\n"
        "Install the 'cryptography' package (pip install cryptography) or make\n"
        "the 'openssl' command available on your PATH, then run this script again."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--host", default="localhost", help="Host/interface to bind (default: localhost)")
    parser.add_argument("--port", type=int, default=4443, help="Port to listen on (default: 4443)")
    parser.add_argument("--regen-cert", action="store_true", help="Force-regenerate the self-signed certificate")
    args = parser.parse_args()

    ensure_certificate(force=args.regen_cert)

    server_address = (args.host, args.port)
    httpd = http.server.HTTPServer(server_address, CORSRequestHandler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=CERT_FILE, keyfile=KEY_FILE)
    httpd.socket = context.wrap_socket(httpd.socket, server_side=True)

    display_host = "localhost" if args.host in ("localhost", "127.0.0.1", "0.0.0.0") else args.host
    print(f"Serving {HERE} on https://{display_host}:{args.port}")
    print("Note: browsers will warn about the self-signed cert; accept it to continue.")
    print("Press Ctrl+C to stop.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        httpd.server_close()


if __name__ == "__main__":
    main()
