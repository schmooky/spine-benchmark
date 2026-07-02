import type { DeviceInfo, GlInfo, WebGpuInfo } from "@/types";

/**
 * Maximal static device capture - everything the browser exposes without a
 * permission prompt. Every field degrades to null where the browser
 * refuses; nothing here throws.
 */

interface UaDataLike {
  brands?: { brand: string; version: string }[];
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
}

function glInfo(): GlInfo | null {
  try {
    const canvas = document.createElement("canvas");
    let context: "webgl2" | "webgl" = "webgl2";
    let gl = canvas.getContext("webgl2") as WebGL2RenderingContext | WebGLRenderingContext | null;
    if (!gl) {
      gl = canvas.getContext("webgl");
      context = "webgl";
    }
    if (!gl) return null;

    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const param = (p: number): number => Number(gl!.getParameter(p)) || 0;
    const gl2 = context === "webgl2" ? (gl as WebGL2RenderingContext) : null;
    const highp = gl.getShaderPrecisionFormat(
      gl.FRAGMENT_SHADER,
      gl.HIGH_FLOAT,
    );
    const viewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;

    return {
      context,
      version: String(gl.getParameter(gl.VERSION)),
      shadingLanguageVersion: String(gl.getParameter(gl.SHADING_LANGUAGE_VERSION)),
      vendor: dbg
        ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL))
        : String(gl.getParameter(gl.VENDOR)),
      renderer: dbg
        ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER)),
      antialias: gl.getContextAttributes()?.antialias ?? null,
      // whether true per-frame GPU timing is possible (absent on Safari/iOS);
      // mirrors GpuTimer.supported so the report/fit can branch on it.
      gpuTimerSupported: !!(gl2 && gl2.getExtension("EXT_disjoint_timer_query_webgl2")),
      maxTextureSize: param(gl.MAX_TEXTURE_SIZE),
      maxTextureImageUnits: param(gl.MAX_TEXTURE_IMAGE_UNITS),
      maxCombinedTextureImageUnits: param(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      maxVertexAttribs: param(gl.MAX_VERTEX_ATTRIBS),
      maxVertexUniformVectors: param(gl.MAX_VERTEX_UNIFORM_VECTORS),
      maxFragmentUniformVectors: param(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxVaryingVectors: param(gl.MAX_VARYING_VECTORS),
      maxRenderbufferSize: param(gl.MAX_RENDERBUFFER_SIZE),
      maxViewportDims: viewportDims ? [viewportDims[0], viewportDims[1]] : [],
      maxSamples: gl2 ? Number(gl2.getParameter(gl2.MAX_SAMPLES)) || 0 : null,
      maxDrawBuffers: gl2
        ? Number(gl2.getParameter(gl2.MAX_DRAW_BUFFERS)) || 0
        : null,
      highpFragment: !!highp && highp.precision > 0,
      extensions: gl.getSupportedExtensions() ?? [],
    };
  } catch {
    return null;
  }
}

async function webGpuInfo(): Promise<WebGpuInfo | null> {
  try {
    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter: () => Promise<{
            info?: Record<string, unknown>;
            features?: Iterable<string>;
            limits?: Record<string, number>;
          } | null>;
        };
      }
    ).gpu;
    if (!gpu) return { supported: false };
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { supported: false };
    const info = adapter.info ?? {};
    const limits = adapter.limits ?? {};
    const keep = [
      "maxTextureDimension2D",
      "maxBufferSize",
      "maxBindGroups",
      "maxComputeWorkgroupSizeX",
      "maxColorAttachments",
    ];
    const limitOut: Record<string, number> = {};
    for (const k of keep) {
      const v = (limits as unknown as Record<string, unknown>)[k];
      if (typeof v === "number") limitOut[k] = v;
    }
    return {
      supported: true,
      vendor: String(info.vendor ?? ""),
      architecture: String(info.architecture ?? ""),
      device: String(info.device ?? ""),
      description: String(info.description ?? ""),
      features: [...(adapter.features ?? [])].slice(0, 40),
      limits: limitOut,
    };
  } catch {
    return { supported: false };
  }
}

function media(query: string): boolean {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

export async function collectDevice(): Promise<DeviceInfo> {
  const nav = navigator as Navigator & {
    userAgentData?: UaDataLike;
    deviceMemory?: number;
    connection?: {
      effectiveType?: string;
      type?: string;
      downlink?: number;
      downlinkMax?: number;
      rtt?: number;
      saveData?: boolean;
    };
    getBattery?: () => Promise<{
      level: number;
      charging: boolean;
      chargingTime: number;
      dischargingTime: number;
    }>;
  };

  const uaData = nav.userAgentData;
  let uaModel: string | null = null;
  let platform = nav.platform || "";
  let architecture: string | null = null;
  let bitness: string | null = null;
  let formFactor: string | null = null;
  let wow64: boolean | null = null;
  let fullVersionList: { brand: string; version: string }[] | null = null;
  if (uaData?.getHighEntropyValues) {
    try {
      const high = await uaData.getHighEntropyValues([
        "model",
        "platform",
        "platformVersion",
        "architecture",
        "bitness",
        "formFactor",
        "wow64",
        "fullVersionList",
      ]);
      uaModel = (high.model as string) || null;
      platform =
        `${high.platform ?? uaData.platform ?? platform} ${high.platformVersion ?? ""}`.trim();
      architecture = (high.architecture as string) || null;
      bitness = (high.bitness as string) || null;
      formFactor = Array.isArray(high.formFactor)
        ? (high.formFactor as string[]).join(",")
        : ((high.formFactor as string) || null);
      wow64 = typeof high.wow64 === "boolean" ? high.wow64 : null;
      fullVersionList =
        (high.fullVersionList as { brand: string; version: string }[]) ?? null;
    } catch {
      // high entropy refused - keep low entropy values
    }
  } else if (uaData?.platform) {
    platform = uaData.platform;
  }

  let batteryDetail: DeviceInfo["batteryDetail"] = null;
  try {
    if (nav.getBattery) {
      const b = await nav.getBattery();
      batteryDetail = {
        level: b.level,
        charging: b.charging,
        chargingTime: Number.isFinite(b.chargingTime) ? b.chargingTime : null,
        dischargingTime: Number.isFinite(b.dischargingTime)
          ? b.dischargingTime
          : null,
      };
    }
  } catch {
    batteryDetail = null;
  }

  let storage: DeviceInfo["storage"] = null;
  try {
    const est = await navigator.storage?.estimate?.();
    if (est) {
      storage = {
        quotaMb: est.quota != null ? Math.round(est.quota / 1048576) : null,
        usageMb: est.usage != null ? Math.round(est.usage / 1048576) : null,
      };
    }
  } catch {
    storage = null;
  }

  const gl = glInfo();
  const webgpu = await webGpuInfo();

  const shortGpu = gl?.renderer
    ? gl.renderer.replace(/ANGLE \(|\)$/g, "").slice(0, 48)
    : null;
  const label = [
    uaModel || platform || "unknown device",
    shortGpu ? `(${shortGpu})` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const orientation = (() => {
    try {
      return {
        type: window.screen.orientation?.type ?? null,
        angle: window.screen.orientation?.angle ?? null,
      };
    } catch {
      return { type: null, angle: null };
    }
  })();

  return {
    label,
    userAgent: navigator.userAgent,
    platform,
    mobile: uaData?.mobile ?? null,
    uaBrands: uaData?.brands ?? null,
    uaModel,
    architecture,
    bitness,
    formFactor,
    wow64,
    fullVersionList,
    vendor: navigator.vendor || "",
    languages: [...(navigator.languages ?? [navigator.language])],
    webdriver: navigator.webdriver ?? null,
    cookieEnabled: navigator.cookieEnabled,
    screen: {
      width: window.screen.width,
      height: window.screen.height,
      dpr: window.devicePixelRatio || 1,
    },
    screenDetail: {
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
      orientation: orientation.type,
      orientationAngle: orientation.angle,
      isExtended:
        (window.screen as Screen & { isExtended?: boolean }).isExtended ?? null,
    },
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      vvWidth: window.visualViewport?.width ?? null,
      vvHeight: window.visualViewport?.height ?? null,
      vvScale: window.visualViewport?.scale ?? null,
    },
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    media: {
      colorGamut: media("(color-gamut: rec2020)")
        ? "rec2020"
        : media("(color-gamut: p3)")
          ? "p3"
          : "srgb",
      hdr: media("(dynamic-range: high)"),
      reducedMotion: media("(prefers-reduced-motion: reduce)"),
      colorScheme: media("(prefers-color-scheme: dark)") ? "dark" : "light",
      pointerCoarse: media("(pointer: coarse)"),
      hoverNone: media("(hover: none)"),
      standalone: media("(display-mode: standalone)"),
    },
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemoryGb: nav.deviceMemory ?? null,
    gpu: gl ? { vendor: gl.vendor, renderer: gl.renderer } : null,
    maxTextureSize: gl?.maxTextureSize ?? null,
    gl,
    webgpu,
    connection: nav.connection?.effectiveType ?? null,
    connectionDetail: nav.connection
      ? {
          effectiveType: nav.connection.effectiveType ?? null,
          type: nav.connection.type ?? null,
          downlink: nav.connection.downlink ?? null,
          downlinkMax: nav.connection.downlinkMax ?? null,
          rtt: nav.connection.rtt ?? null,
          saveData: nav.connection.saveData ?? null,
        }
      : null,
    battery: batteryDetail
      ? { level: batteryDetail.level, charging: batteryDetail.charging }
      : null,
    batteryDetail,
    storage,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visibilityAtStart: document.visibilityState,
    timeOrigin: Math.round(performance.timeOrigin),
    runtime: null,
  };
}
