import "server-only";
import dns from "node:dns/promises";
import net from "node:net";

/** Loopback, private, link-local and carrier-grade NAT addresses (IPv4 and IPv6). */
export function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:") && net.isIPv4(lower.slice(7))) return isPrivateIp(lower.slice(7));
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return lower === "::1" || lower === "::" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80");
}

const sizeText = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * https-only download that refuses private/loopback hosts (also after
 * redirects) and stops at `maxBytes`. Used for files a chat hands the MCP
 * tools by link, so a link can't make the server read its own network.
 */
export async function fetchPublicUrl(rawUrl: string, maxBytes: number, timeoutMs = 15_000): Promise<{ buffer: Buffer; contentType: string; url: URL }> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed.");
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host)) {
      if (isPrivateIp(host)) throw new Error("That URL points to a private address.");
    } else {
      const addrs = await dns.lookup(host, { all: true });
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error("That URL's host is not publicly reachable.");
    }
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "adsbyshoaib-dashboard/1.0" } });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new Error(`Could not download the file: HTTP ${res.status}.`);
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) throw new Error(`File is larger than ${sizeText(maxBytes)}.`);
    // Read in chunks so a server that lies about (or omits) its length can't fill memory.
    const reader = res.body?.getReader();
    if (!reader) throw new Error("The download was empty.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`File is larger than ${sizeText(maxBytes)}.`);
      }
      chunks.push(value);
    }
    return { buffer: Buffer.concat(chunks), contentType: res.headers.get("content-type") ?? "", url };
  }
  throw new Error("Too many redirects.");
}
