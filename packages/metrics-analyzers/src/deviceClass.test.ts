import { describe, expect, it } from "vitest";

import {
  type ClassifiableDevice,
  deviceClass,
  deviceFamily,
  groupPortableByFamily,
  isPortable,
} from "./deviceClass.js";

// Representative captures, trimmed to the fields the classifier reads.
const iphone: ClassifiableDevice = {
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15",
  platform: "iPhone",
  mobile: null,
  uaModel: null,
  maxTouchPoints: 5,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 393, height: 852, dpr: 3 },
  gpu: { renderer: "Apple GPU" },
};

const ipadModern: ClassifiableDevice = {
  // iPadOS 13+ reports as Macintosh; only maxTouchPoints betrays it.
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15",
  platform: "MacIntel",
  maxTouchPoints: 5,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 1024, height: 1366, dpr: 2 },
  gpu: { renderer: "Apple GPU" },
};

const pixel: ClassifiableDevice = {
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36",
  platform: "Linux armv8l",
  mobile: true,
  uaModel: "Pixel 7",
  maxTouchPoints: 5,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 412, height: 915, dpr: 2.6 },
  gpu: { renderer: "Mali-G710" },
};

const galaxyTab: ClassifiableDevice = {
  userAgent: "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36",
  platform: "Linux armv8l",
  mobile: false,
  uaModel: "SM-X710",
  maxTouchPoints: 10,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 800, height: 1280, dpr: 2 },
  gpu: { renderer: "Adreno (TM) 730" },
};

const redmi: ClassifiableDevice = {
  userAgent: "Mozilla/5.0 (Linux; Android 12; 22011119UY) AppleWebKit/537.36",
  platform: "Linux armv8l",
  mobile: true,
  uaModel: "22011119UY",
  maxTouchPoints: 5,
  media: { pointerCoarse: true, hoverNone: true },
  screen: { width: 393, height: 873, dpr: 2.75 },
  gpu: { renderer: "Adreno (TM) 610" },
};

const macbook: ClassifiableDevice = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
  platform: "MacIntel",
  mobile: false,
  maxTouchPoints: 0,
  media: { pointerCoarse: false, hoverNone: false },
  screen: { width: 1728, height: 1117, dpr: 2 },
  gpu: { renderer: "Apple GPU" },
};

const windowsPc: ClassifiableDevice = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  platform: "Win32",
  mobile: false,
  formFactor: "Desktop",
  maxTouchPoints: 0,
  media: { pointerCoarse: false, hoverNone: false },
  screen: { width: 2560, height: 1440, dpr: 1 },
  gpu: { renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)" },
};

describe("deviceClass", () => {
  it("classifies iPhone as phone", () => expect(deviceClass(iphone)).toBe("phone"));
  it("classifies modern iPad (Macintosh + touch) as tablet", () =>
    expect(deviceClass(ipadModern)).toBe("tablet"));
  it("classifies Android phone via ua-ch mobile bit", () => expect(deviceClass(pixel)).toBe("phone"));
  it("classifies Android tablet (mobile:false)", () => expect(deviceClass(galaxyTab)).toBe("tablet"));
  it("classifies MacBook as desktop", () => expect(deviceClass(macbook)).toBe("desktop"));
  it("classifies Windows PC as desktop", () => expect(deviceClass(windowsPc)).toBe("desktop"));
  it("returns unknown when no signals present", () => expect(deviceClass({})).toBe("unknown"));
});

describe("isPortable", () => {
  it("keeps phones and tablets", () => {
    expect(isPortable(iphone)).toBe(true);
    expect(isPortable(galaxyTab)).toBe(true);
  });
  it("drops desktops", () => {
    expect(isPortable(macbook)).toBe(false);
    expect(isPortable(windowsPc)).toBe(false);
  });
});

describe("deviceFamily", () => {
  it("maps portable devices to families", () => {
    expect(deviceFamily(iphone)).toBe("iPhone");
    expect(deviceFamily(ipadModern)).toBe("iPad");
    expect(deviceFamily(pixel)).toBe("Google Pixel");
    expect(deviceFamily(galaxyTab)).toBe("Samsung Galaxy");
    expect(deviceFamily(redmi)).toBe("Xiaomi/Redmi/POCO");
  });
  it("labels desktops by OS", () => {
    expect(deviceFamily(macbook)).toBe("Desktop (Mac)");
    expect(deviceFamily(windowsPc)).toBe("Desktop (Windows)");
  });
});

describe("groupPortableByFamily", () => {
  it("buckets portables by family and excludes desktops, sorted by size", () => {
    const runs = [
      { device: iphone },
      { device: iphone },
      { device: pixel },
      { device: macbook }, // excluded
      { device: windowsPc }, // excluded
      { device: galaxyTab },
    ];
    const grouped = groupPortableByFamily(runs, (r) => r.device);
    expect(grouped.map((g) => g.family)).toEqual(["iPhone", "Google Pixel", "Samsung Galaxy"]);
    expect(grouped[0]!.items).toHaveLength(2);
    expect(grouped.some((g) => g.family.startsWith("Desktop"))).toBe(false);
  });
});
