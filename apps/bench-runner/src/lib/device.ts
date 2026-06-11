import type { DeviceInfo } from "@/types";

/**
 * Best-effort device capture: UA + UA-CH high-entropy values, screen, GPU
 * via WEBGL_debug_renderer_info, cores/memory, battery, connection. Every
 * field degrades to null where the browser refuses to tell.
 */

interface UaDataLike {
  brands?: { brand: string; version: string }[];
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

function gpuInfo(): { gpu: DeviceInfo["gpu"]; maxTextureSize: number | null } {
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return { gpu: null, maxTextureSize: null };
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext
      ? {
          vendor: String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)),
          renderer: String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
        }
      : null;
    const maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || null;
    return { gpu, maxTextureSize };
  } catch {
    return { gpu: null, maxTextureSize: null };
  }
}

export async function collectDevice(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & {
    userAgentData?: UaDataLike;
    deviceMemory?: number;
    connection?: { effectiveType?: string };
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  };

  const uaData = nav.userAgentData;
  let uaModel: string | null = null;
  let platform = nav.platform || "";
  if (uaData?.getHighEntropyValues) {
    try {
      const high = await uaData.getHighEntropyValues([
        "model",
        "platform",
        "platformVersion",
      ]);
      uaModel = (high.model as string) || null;
      platform =
        `${high.platform ?? uaData.platform ?? platform} ${high.platformVersion ?? ""}`.trim();
    } catch {
      // high entropy refused - keep low entropy values
    }
  } else if (uaData?.platform) {
    platform = uaData.platform;
  }

  let battery: DeviceInfo["battery"] = null;
  try {
    if (nav.getBattery) {
      const b = await nav.getBattery();
      battery = { level: b.level, charging: b.charging };
    }
  } catch {
    battery = null;
  }

  const { gpu, maxTextureSize } = gpuInfo();

  const shortGpu = gpu?.renderer
    ? gpu.renderer.replace(/ANGLE \(|\)$/g, "").slice(0, 48)
    : null;
  const label = [
    uaModel || platform || "unknown device",
    shortGpu ? `(${shortGpu})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    label,
    userAgent: navigator.userAgent,
    platform,
    mobile: uaData?.mobile ?? null,
    uaBrands: uaData?.brands ?? null,
    uaModel,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio || 1,
    },
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    gpu,
    maxTextureSize,
    connection: nav.connection?.effectiveType ?? null,
    battery,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
