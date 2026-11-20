"""Create an opt-in Android debug resource overlay from one public LAN CA certificate."""
from argparse import ArgumentParser
from ipaddress import IPv4Address, IPv4Network
from pathlib import Path
import re
import subprocess

parser = ArgumentParser(description=__doc__)
parser.add_argument("--host", required=True, type=IPv4Address)
parser.add_argument("--ca", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
args = parser.parse_args()
lan = [IPv4Network(net) for net in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]
if not any(args.host in net for net in lan):
    parser.error("Use the exact private IPv4 address on the LAN Core TLS certificate")
source = args.ca.read_bytes().strip()
if len(source) > 16384 or not re.fullmatch(
    rb"-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----", source
):
    parser.error("Supply exactly one public PEM CA certificate; never use a private key")
try:
    actual = subprocess.run(
        ["openssl", "x509", "-noout", "-checkend", "0", "-ext", "basicConstraints"],
        input=source, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, check=True
    ).stdout
except (OSError, subprocess.CalledProcessError):
    parser.error("The supplied public CA could not be verified")
if b"CA:TRUE" not in actual:
    parser.error("The supplied certificate is not a CA")
args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
(args.output / "raw").mkdir()
(args.output / "xml").mkdir()
(args.output / "raw" / "kz_pilot_ca.pem").write_bytes(source + b"\n")
(args.output / "xml" / "kz_network_security.xml").write_text(f"""<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors><certificates src="system" /></trust-anchors>
    </base-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="false">{args.host}</domain>
        <trust-anchors><certificates src="@raw/kz_pilot_ca" /></trust-anchors>
    </domain-config>
</network-security-config>
""")
