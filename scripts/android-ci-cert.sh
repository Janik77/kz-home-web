#!/usr/bin/env bash
# Only for the disposable 10.0.2.2 emulator. Never use its CA or APK for the owner.
set -euo pipefail
umask 077
dest="$1"
mkdir -m 700 "$dest"
openssl req -x509 -newkey rsa:2048 -nodes -keyout "$dest/ca.key" -out "$dest/ca.pem" -days 1 \
  -subj /CN=KZHome-Emulator-Fixture-Only -addext basicConstraints=critical,CA:TRUE
openssl req -newkey rsa:2048 -nodes -keyout "$dest/leaf.key" -out "$dest/leaf.csr" -subj /CN=10.0.2.2
printf 'basicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:10.0.2.2\n' > "$dest/leaf.ext"
openssl x509 -req -in "$dest/leaf.csr" -CA "$dest/ca.pem" -CAkey "$dest/ca.key" -CAcreateserial \
  -out "$dest/leaf.pem" -days 1 -sha256 -extfile "$dest/leaf.ext"
openssl verify -CAfile "$dest/ca.pem" -verify_ip 10.0.2.2 "$dest/leaf.pem"
