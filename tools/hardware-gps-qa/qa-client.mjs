export const QA_ORIGIN = "https://traccar-qa-qa.up.railway.app";

export function validateMappings(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) {
    throw new Error("Expected 1–20 QA device mappings");
  }
  const uniqueIds = new Set();
  const truckIds = new Set();
  return value.map((entry) => {
    const { uniqueId, name, truckId } = entry ?? {};
    if (typeof uniqueId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(uniqueId) ||
        typeof truckId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(truckId) ||
        typeof name !== "string" || !name.trim() || name.length > 100) {
      throw new Error("Invalid QA device mapping");
    }
    if (uniqueIds.has(uniqueId) || truckIds.has(truckId)) throw new Error("Duplicate QA device or truck mapping");
    uniqueIds.add(uniqueId);
    truckIds.add(truckId);
    return { uniqueId, truckId, name: name.trim() };
  });
}

export function createTraccarClient({ token, baseUrl = QA_ORIGIN, fetchImpl = fetch }) {
  if (baseUrl !== QA_ORIGIN) throw new Error("Only the approved Traccar QA origin is allowed");
  if (typeof token !== "string" || !/^[!-~]+$/.test(token)) throw new Error("Traccar QA token is required");

  async function request(path, query, body) {
    const url = new URL(path, baseUrl);
    url.search = new URLSearchParams(query).toString();
    const headers = { Accept: "application/json", Authorization: `Bearer ${token}` };
    const options = { headers, redirect: "error", signal: AbortSignal.timeout(10_000) };
    if (body) {
      headers["Content-Type"] = "application/json";
      options.method = "POST";
      options.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(url, options);
    } catch {
      throw new Error("Traccar QA request failed");
    }
    if (!response.ok) throw new Error(`Traccar API HTTP ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new Error("Invalid Traccar QA JSON");
    }
  }

  async function list(path, query) {
    const data = await request(path, query);
    if (!Array.isArray(data)) throw new Error("Expected an array from Traccar QA");
    return data;
  }

  return {
    devices: () => list("/api/devices"),
    history: (deviceId, from, to) => list("/api/positions", {
      deviceId, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    }),
    register: ({ uniqueId, name }) => request("/api/devices", undefined, { uniqueId, name }),
  };
}

export function resolveDevice(devices, mapping) {
  const matches = devices.filter((device) => device?.uniqueId === mapping.uniqueId);
  const [device] = matches;
  if (matches.length !== 1 || !Number.isSafeInteger(device.id) || device.id < 1 ||
      devices.some((other) => other !== device && other?.id === device.id)) {
    throw new Error("Missing or ambiguous QA device registration");
  }
  return device;
}

export async function ensureRegistered(operator, input) {
  const [mapping] = validateMappings([input]);
  let devices = await operator.devices();
  if (!devices.some((device) => device?.uniqueId === mapping.uniqueId)) {
    try {
      await operator.register(mapping);
    } catch (error) {
      // A response can be lost after a successful write. Verify before another attempt.
      devices = await operator.devices();
      if (!devices.some((device) => device?.uniqueId === mapping.uniqueId)) throw error;
    }
    devices = await operator.devices();
  }
  const device = resolveDevice(devices, mapping);
  if (device.name !== mapping.name) throw new Error("QA device registration name conflict");
  return device;
}
