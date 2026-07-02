/**
 * Device classification for the fleet: form-factor CLASS (phone / tablet /
 * desktop) and a coarse portable FAMILY (iPhone, iPad, Samsung Galaxy, ...).
 *
 * Motivation: the cost model clusters by GPU family (see `gpuFamily` in
 * deviceFit.ts), but GPU family cannot separate a phone from a laptop - "Apple
 * GPU" is both an iPhone and an M-series Mac. The calibration study only cares
 * about PORTABLE devices (that is where the fps budget bites); desktop PCs have
 * huge headroom and pollute per-family aggregates. So we classify by device
 * signals (ua-ch mobile/formFactor, touch, pointer/hover media, platform/UA)
 * and group the fleet by portable family, excluding desktops.
 *
 * Every field is read defensively - the client captures degrade to null on
 * browsers that refuse them, so no single signal is load-bearing. Precedence is
 * most-reliable-first (explicit iOS UA and ua-ch formFactor beat touch
 * heuristics beat screen-size guesses).
 */

/** The subset of the captured device record this classifier reads. All optional
 * so it accepts both the runner's full DeviceInfo and the server's looser row. */
export interface ClassifiableDevice {
  userAgent?: string | null;
  platform?: string | null;
  mobile?: boolean | null;
  formFactor?: string | null;
  uaModel?: string | null;
  uaBrands?: { brand: string; version: string }[] | null;
  maxTouchPoints?: number | null;
  screen?: { width?: number | null; height?: number | null; dpr?: number | null } | null;
  media?: { pointerCoarse?: boolean; hoverNone?: boolean } | null;
  gpu?: { renderer?: string | null } | null;
}

export type DeviceClass = "phone" | "tablet" | "desktop" | "unknown";

/** Longest side in CSS px below which a touch device is treated as a phone
 * rather than a tablet (~7" boundary). Phones top out ~byte 430x930; small
 * tablets start ~600x960. */
const TABLET_MIN_LONG_SIDE = 900;

function ua(d: ClassifiableDevice): string {
  return `${d.userAgent ?? ""}`.toLowerCase();
}
function plat(d: ClassifiableDevice): string {
  return `${d.platform ?? ""}`.toLowerCase();
}
function formFactor(d: ClassifiableDevice): string {
  return `${d.formFactor ?? ""}`.toLowerCase();
}
function hasTouch(d: ClassifiableDevice): boolean {
  return (d.maxTouchPoints ?? 0) > 0;
}
function coarsePointer(d: ClassifiableDevice): boolean {
  return !!(d.media?.pointerCoarse || d.media?.hoverNone);
}
function longSide(d: ClassifiableDevice): number {
  const w = d.screen?.width ?? 0;
  const h = d.screen?.height ?? 0;
  return Math.max(w || 0, h || 0);
}

/** True iPadOS masquerades as desktop Safari ("Macintosh") but exposes touch. */
function isIpadOsMasquerade(d: ClassifiableDevice): boolean {
  const u = ua(d);
  const p = plat(d);
  const mac = u.includes("macintosh") || p.includes("mac");
  return mac && (d.maxTouchPoints ?? 0) > 1;
}

/**
 * Form-factor class of a captured device. Precedence:
 *   1. explicit iOS UA (iPhone / iPad)
 *   2. iPadOS-on-Mac masquerade (Macintosh + touch)
 *   3. ua-ch formFactor token
 *   4. ua-ch `mobile` bit + Android tablet inference
 *   5. touch + coarse-pointer heuristic, split phone/tablet by screen size
 *   6. desktop platform with fine pointer and no touch
 */
export function deviceClass(d: ClassifiableDevice): DeviceClass {
  const u = ua(d);
  const p = plat(d);

  // 1. explicit iOS
  if (u.includes("iphone") || p.includes("iphone")) return "phone";
  if (u.includes("ipad") || p.includes("ipad")) return "tablet";

  // 2. iPadOS pretending to be a Mac
  if (isIpadOsMasquerade(d)) return "tablet";

  // 3. ua-ch formFactor (Chromium high-entropy)
  const ff = formFactor(d);
  if (ff.includes("tablet")) return "tablet";
  if (ff.includes("mobile")) return "phone";
  if (ff.includes("desktop")) return "desktop";
  if (ff.includes("automotive") || ff.includes("xr") || ff.includes("watch")) return "unknown";

  const android = u.includes("android") || p.includes("android");

  // 4. ua-ch mobile bit (Chromium). true => phone; Android + explicitly not
  //    mobile => tablet.
  if (d.mobile === true) return "phone";
  if (android && d.mobile === false) return "tablet";

  // 5. touch heuristic for everything else that looks portable
  if (hasTouch(d) && coarsePointer(d)) {
    if (android) return longSide(d) >= TABLET_MIN_LONG_SIDE ? "tablet" : "phone";
    return longSide(d) >= TABLET_MIN_LONG_SIDE ? "tablet" : "phone";
  }

  // 6. desktop: a known desktop platform, no touch, fine pointer
  const desktopPlatform =
    u.includes("windows") ||
    p.includes("win") ||
    u.includes("macintosh") ||
    p.includes("mac") ||
    u.includes("cros") ||
    ((u.includes("linux") || u.includes("x11")) && !android);
  if (desktopPlatform && !hasTouch(d) && !coarsePointer(d)) return "desktop";

  return "unknown";
}

/** phone or tablet - the devices the calibration study keeps. */
export function isPortable(d: ClassifiableDevice): boolean {
  const c = deviceClass(d);
  return c === "phone" || c === "tablet";
}

/** Coarse Android vendor from the model/UA/brand strings. */
function androidVendor(d: ClassifiableDevice): string {
  const model = `${d.uaModel ?? ""}`.toLowerCase();
  const u = ua(d);
  const brands = (d.uaBrands ?? []).map((b) => b.brand.toLowerCase()).join(" ");
  const hay = `${model} ${u} ${brands}`;

  if (/\bpixel\b/.test(hay)) return "Google Pixel";
  if (/samsung|galaxy|\bsm-[a-z0-9]/.test(hay)) return "Samsung Galaxy";
  // Xiaomi/Redmi/POCO frequently ship a cryptic numeric codename in the UA with
  // no brand string, e.g. "22011119UY" (year-prefixed digits + 2 letters) or
  // "M2101K6G". Match the brand words OR those codename shapes.
  if (
    /redmi|poco|xiaomi|\bmi\b/.test(hay) ||
    /\b2[0-4]\d{6}[a-z]{1,2}\b/.test(hay) ||
    /\bm2\d{3}[a-z0-9]{2,}\b/.test(hay)
  )
    return "Xiaomi/Redmi/POCO";
  if (/oneplus|\bcph\d|\bne2\d|\bkb2\d/.test(hay)) return "OnePlus";
  if (/huawei|honor|\b[a-z]{3}-al\d|\b[a-z]{3}-tl\d/.test(hay)) return "Huawei/Honor";
  if (/realme|\brmx\d|\boppo\b|\bvivo\b|\bcph\d|\bv2\d{3}/.test(hay)) return "Oppo/Realme/Vivo";
  if (/motorola|\bmoto\b|\bxt\d{4}/.test(hay)) return "Motorola";
  if (/nokia|\bta-\d{4}/.test(hay)) return "Nokia";
  if (/tecno|infinix|itel/.test(hay)) return "Transsion (Tecno/Infinix)";
  return "";
}

/**
 * Coarse portable FAMILY label used to bucket the fleet. Desktops collapse to a
 * single "Desktop (<os>)" label (callers exclude them); non-portable/unknown ->
 * "unknown". The family is a marketing lineage, NOT a performance tier - two
 * devices in a family can differ 4x; it is a coverage/inventory axis, and the
 * cost model still clusters by GPU family.
 */
export function deviceFamily(d: ClassifiableDevice): string {
  const cls = deviceClass(d);

  if (cls === "phone" || cls === "tablet") {
    const u = ua(d);
    const p = plat(d);
    const ios = u.includes("iphone") || u.includes("ipad") || p.includes("iphone") || p.includes("ipad") || isIpadOsMasquerade(d);
    if (ios) return cls === "tablet" ? "iPad" : "iPhone";

    const vendor = androidVendor(d);
    if (vendor) return vendor;
    return cls === "tablet" ? "Android tablet" : "Android phone";
  }

  if (cls === "desktop") {
    const u = ua(d);
    const p = plat(d);
    if (u.includes("windows") || p.includes("win")) return "Desktop (Windows)";
    if (u.includes("macintosh") || p.includes("mac")) return "Desktop (Mac)";
    if (u.includes("cros")) return "Desktop (ChromeOS)";
    if (u.includes("linux") || u.includes("x11")) return "Desktop (Linux)";
    return "Desktop";
  }

  return "unknown";
}

/**
 * Bucket a list of items by their portable device family, EXCLUDING desktops
 * and unknowns. `getDevice` extracts the classifiable record from each item
 * (e.g. `(run) => run.device`). Families are returned sorted by descending
 * bucket size so the best-covered devices lead.
 */
export function groupPortableByFamily<T>(
  items: readonly T[],
  getDevice: (item: T) => ClassifiableDevice,
): { family: string; items: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const d = getDevice(item);
    if (!isPortable(d)) continue;
    const fam = deviceFamily(d);
    const list = buckets.get(fam);
    if (list) list.push(item);
    else buckets.set(fam, [item]);
  }
  return [...buckets.entries()]
    .map(([family, list]) => ({ family, items: list }))
    .sort((a, b) => b.items.length - a.items.length || a.family.localeCompare(b.family));
}
