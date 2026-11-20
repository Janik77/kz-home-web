/** The pilot accepts only HTTPS addresses on private IPv4 LANs. No DNS or public reachability. */
export function parseLanCore(raw: string): string {
  const input = raw.trim();
  // Check the spelling before URL normalizes shortened, octal, or integer IPv4 addresses.
  const parts = /^https:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?\/?$/.exec(input);
  if (!parts) throw new Error('Введите HTTPS-адрес Core в домашней сети, например https://192.168.1.20:8443.');
  const octets = parts[1]!.split('.');
  const [a, b] = octets.map(Number);
  if (octets.some(part => String(Number(part)) !== part || Number(part) > 255)
      || !(a === 10 || a === 172 && b! >= 16 && b! <= 31 || a === 192 && b === 168)) {
    throw new Error('Введите локальный адрес Core. Адрес 127.0.0.1 на телефоне относится к самому телефону.');
  }
  const url = new URL(input);
  if (url.port === '0') throw new Error('Проверьте номер порта Core.');
  return url.origin;
}
