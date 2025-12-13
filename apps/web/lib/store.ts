import { EventEmitter } from "events";
import { createHash, randomUUID } from "crypto";

export type MetricSample = {
  timestamp: string;
  deviceId: string;
  agentVersion: string;
  hostname: string;
  metrics: {
    cpuPercent?: number;
    memUsedGB?: number;
    memTotalGB?: number;
    diskUsedGB?: number;
    diskFreeGB?: number;
    diskTotalGB?: number;
    diskLabel?: string | null;
    disks?: Array<{
      id: string;
      label?: string | null;
      fileSystem?: string | null;
      isReady?: boolean;
      sizeGB?: number;
      freeGB?: number;
      usedGB?: number;
      percent?: number;
    }>;
    processCount?: number;
    uptimeSec?: number;
    cpuTempC?: number | null;
    gpuTempC?: number | null;
    gpuMemoryTempC?: number | null;
    boardTempC?: number | null;
    cpuTempMaxC?: number | null;
    gpuHotspotTempC?: number | null;
    temps?: Array<{
      name: string;
      value: number;
    }>;
    tempSource?: string | null;
    tempReason?: string | null;
    net?: {
      defaultIfIndex?: number | null;
      gateway?: string | null;
      dnsServers?: string[];
      totals?: { rxBps?: number | null; txBps?: number | null };
      interfaces?: Array<{
        name: string;
        ifIndex?: number;
        description?: string | null;
        mac?: string | null;
        linkSpeedMbps?: number | null;
        ipv4?: string[];
        ipv6?: string[];
        rxBytes?: number | null;
        txBytes?: number | null;
        rxBps?: number | null;
        txBps?: number | null;
        rxErrors?: number | null;
        txErrors?: number | null;
        rxDiscards?: number | null;
        txDiscards?: number | null;
      }>;
      probe?: {
        at?: string;
        intervalSec?: number;
        ping?: Array<{
          target: string;
          lastMs?: number | null;
          avgMs?: number | null;
          minMs?: number | null;
          maxMs?: number | null;
          jitterMs?: number | null;
          lossPct?: number | null;
          window?: number | null;
        }>;
        dns?: { host?: string; ok?: boolean; ms?: number | null };
        http?: { url?: string; ok?: boolean; status?: number | null; ms?: number | null };
        publicIp?: string | null;
      };
    };
  };
};

export type Device = {
  id: string;
  name: string;
  tokenHash: string;
  lastSeenAt?: string;
  hostname?: string;
};

const MAX_SAMPLES = 500;
let samples: MetricSample[] = [];
let devices: Device[] = [];
const emitter = new EventEmitter();

export function addMetricSample(sample: MetricSample) {
  samples.push(sample);
  if (samples.length > MAX_SAMPLES) {
    samples = samples.slice(samples.length - MAX_SAMPLES);
  }
  touchDevicePresence(sample.deviceId, sample.hostname);
  emitter.emit("metric", sample);
}

export function getSamples(limit?: number): MetricSample[] {
  if (limit && limit > 0) {
    return samples.slice(-limit);
  }
  return samples;
}

export function enrollDevice(name: string): { id: string; token: string; updatedExisting: boolean } {
  const id = randomUUID();
  const token = randomUUID();
  const tokenHash = hashToken(token);
  const existing = devices.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.id = id;
    existing.tokenHash = tokenHash;
    existing.lastSeenAt = undefined;
    existing.hostname = existing.hostname || name;
    return { id, token, updatedExisting: true };
  }
  devices.push({ id, name, tokenHash });
  return { id, token, updatedExisting: false };
}

export function getDevices(): Array<
  Device & {
    status: "online" | "offline";
    secondsSinceSeen?: number;
  }
> {
  const now = Date.now();
  return devices.map((d) => {
    const last = d.lastSeenAt ? new Date(d.lastSeenAt).getTime() : undefined;
    const secondsSinceSeen = last ? Math.floor((now - last) / 1000) : undefined;
    const status = secondsSinceSeen !== undefined && secondsSinceSeen < 90 ? "online" : "offline";
    return { ...d, status, secondsSinceSeen };
  });
}

export function verifyDeviceToken(deviceId: string, token: string | undefined): boolean {
  if (!deviceId || !token) return false;
  const found = devices.find((d) => d.id === deviceId);
  if (!found) return false;
  const hash = hashToken(token);
  return found.tokenHash === hash;
}

export function getDevice(deviceId: string) {
  return devices.find((d) => d.id === deviceId);
}

export function ensureDevice(deviceId: string, token: string, hostname?: string) {
  let found = devices.find((d) => d.id === deviceId);
  if (!found) {
    if (hostname) {
      const matchByName = devices.find((d) => d.name.toLowerCase() === hostname.toLowerCase());
      if (matchByName) {
        matchByName.id = deviceId;
        if (token) {
          matchByName.tokenHash = hashToken(token);
        }
        found = matchByName;
      }
    }

    if (!found) {
      found = {
        id: deviceId,
        name: hostname || `device-${deviceId.slice(0, 6)}`,
        tokenHash: token ? hashToken(token) : ""
      };
      devices.push(found);
    }
  }
  return found;
}

export function touchDevicePresence(deviceId: string, hostname?: string) {
  const found = devices.find((d) => d.id === deviceId);
  if (found) {
    found.lastSeenAt = new Date().toISOString();
    if (hostname) found.hostname = hostname;
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function subscribeToMetrics(onMetric: (m: MetricSample) => void) {
  emitter.on("metric", onMetric);
  return () => emitter.off("metric", onMetric);
}

