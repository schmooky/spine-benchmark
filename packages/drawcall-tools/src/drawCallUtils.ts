import type { StoredAsset, StoredAssetFile } from '@spine-benchmark/asset-store';

export interface DrawItem {
  slot: string;
  attachment: string;
  path: string;
  page: string;
  blend: string;
}

export interface DrawCallResult {
  drawCalls: number;
  pageBreaks: number;
  blendBreaks: number;
  unknownPageCount: number;
  items: DrawItem[];
}

export interface DrawCallAnalysis {
  base: DrawCallResult;
  animationStats: Array<{ name: string; worstDrawCalls: number; sampledFrames: number }>;
  uniquePages: number;
  uniqueBlends: number;
  slotCount: number;
}

function toText(file: StoredAssetFile): string {
  return new TextDecoder().decode(file.buffer);
}

function getAssetFiles(asset: StoredAsset, atlasFileName?: string) {
  const jsonFile = asset.files.find((file) => file.name.endsWith('.json'));
  const atlasFile = atlasFileName
    ? asset.files.find((file) => file.name === atlasFileName)
    : asset.files.find((file) => file.name.endsWith('.atlas'));
  if (!jsonFile) throw new Error('JSON file not found in selected asset');
  if (!atlasFile) throw new Error('Atlas file not found in selected asset');
  return { jsonText: toText(jsonFile), atlasText: toText(atlasFile) };
}

function parseAtlasRegionPages(atlasText: string): Map<string, string> {
  const lines = atlasText.split(/\r?\n/);
  const regionToPage = new Map<string, string>();
  let currentPage: string | null = null;
  const pageMetaKeys = new Set(['size', 'format', 'filter', 'repeat', 'pma', 'scale']);

  const nextNonEmptyLine = (fromIndex: number): string | null => {
    for (let i = fromIndex; i < lines.length; i += 1) {
      const value = lines[i].trim();
      if (value) return value;
    }
    return null;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.includes(':')) return;

    const next = nextNonEmptyLine(index + 1);
    if (next && next.includes(':')) {
      const key = next.split(':')[0].trim();
      if (pageMetaKeys.has(key)) {
        currentPage = line;
        return;
      }
    }

    if (currentPage) {
      regionToPage.set(line, currentPage);
    }
  });

  return regionToPage;
}

function getSkinsContainer(parsed: any): any[] {
  if (!parsed?.skins) return [];
  if (Array.isArray(parsed.skins)) return parsed.skins;
  if (typeof parsed.skins === 'object') {
    return Object.entries(parsed.skins).map(([name, attachments]) => ({ name, attachments }));
  }
  return [];
}

function buildAttachmentPathMap(parsed: any): Map<string, string> {
  const map = new Map<string, string>();
  const skins = getSkinsContainer(parsed);

  skins.forEach((skin) => {
    const attachments = skin?.attachments ?? skin;
    if (!attachments || typeof attachments !== 'object') return;

    Object.entries(attachments).forEach(([slotName, slotData]) => {
      if (!slotData || typeof slotData !== 'object') return;
      Object.entries(slotData as Record<string, any>).forEach(([attachmentName, attachmentData]) => {
        const path = String((attachmentData as any)?.path ?? attachmentName);
        map.set(`${slotName}:${attachmentName}`, path);
      });
    });
  });

  return map;
}

function computeDrawCalls(items: DrawItem[]): DrawCallResult {
  let drawCalls = 0;
  let pageBreaks = 0;
  let blendBreaks = 0;
  let unknownPageCount = 0;
  let previous: DrawItem | null = null;

  items.forEach((item) => {
    if (item.page === 'unknown') unknownPageCount += 1;
    if (!previous) {
      drawCalls = 1;
      previous = item;
      return;
    }
    const blendChanged = item.blend !== previous.blend;
    const pageChanged = item.page !== previous.page;
    if (blendChanged || pageChanged) {
      drawCalls += 1;
      if (blendChanged) blendBreaks += 1;
      if (pageChanged) pageBreaks += 1;
    }
    previous = item;
  });

  return {
    drawCalls,
    pageBreaks,
    blendBreaks,
    unknownPageCount,
    items,
  };
}

function applyDrawOrderOffsets(baseOrder: string[], offsets: Array<{ slot: string; offset: number }>): string[] {
  if (!offsets || offsets.length === 0) return [...baseOrder];

  const slotToIndex = new Map<string, number>();
  baseOrder.forEach((name, index) => slotToIndex.set(name, index));

  const sortedOffsets = [...offsets]
    .map((entry) => ({ slot: entry.slot, offset: entry.offset, index: slotToIndex.get(entry.slot) ?? -1 }))
    .filter((entry) => entry.index >= 0)
    .sort((a, b) => a.index - b.index);

  const drawOrder: Array<string | null> = new Array(baseOrder.length).fill(null);
  const unchanged: string[] = [];
  let originalIndex = 0;
  let unchangedIndex = 0;

  sortedOffsets.forEach((entry) => {
    while (originalIndex < entry.index) {
      unchanged[unchangedIndex] = baseOrder[originalIndex];
      unchangedIndex += 1;
      originalIndex += 1;
    }
    drawOrder[originalIndex + entry.offset] = baseOrder[originalIndex];
    originalIndex += 1;
  });

  while (originalIndex < baseOrder.length) {
    unchanged[unchangedIndex] = baseOrder[originalIndex];
    unchangedIndex += 1;
    originalIndex += 1;
  }

  for (let i = baseOrder.length - 1; i >= 0; i -= 1) {
    if (!drawOrder[i]) {
      unchangedIndex -= 1;
      drawOrder[i] = unchanged[unchangedIndex];
    }
  }

  return drawOrder.filter((item): item is string => Boolean(item));
}

export function analyzeDrawCallsFromAsset(asset: StoredAsset, atlasFileName?: string): DrawCallAnalysis {
  const { jsonText, atlasText } = getAssetFiles(asset, atlasFileName);
  const parsed = JSON.parse(jsonText);

  const slots: Array<{ name: string; blend: string; attachment?: string }> = Array.isArray(parsed?.slots)
    ? parsed.slots.map((slot: any) => ({
        name: String(slot?.name ?? ''),
        blend: String(slot?.blend ?? 'normal'),
        attachment: typeof slot?.attachment === 'string' ? slot.attachment : undefined,
      }))
    : [];

  const baseOrder = slots.map((slot) => slot.name).filter(Boolean);
  const regionToPage = parseAtlasRegionPages(atlasText);
  const attachmentPathMap = buildAttachmentPathMap(parsed);

  const slotDrawable = new Map<string, DrawItem>();
  slots.forEach((slot) => {
    if (!slot.name || !slot.attachment) return;
    const path = attachmentPathMap.get(`${slot.name}:${slot.attachment}`) ?? slot.attachment;
    const page = regionToPage.get(path) ?? regionToPage.get(slot.attachment!) ?? 'unknown';
    slotDrawable.set(slot.name, {
      slot: slot.name,
      attachment: slot.attachment,
      path,
      page,
      blend: slot.blend || 'normal',
    });
  });

  const toItems = (order: string[]): DrawItem[] => order.map((slotName) => slotDrawable.get(slotName)).filter((v): v is DrawItem => Boolean(v));
  const base = computeDrawCalls(toItems(baseOrder));

  const animationStats: Array<{ name: string; worstDrawCalls: number; sampledFrames: number }> = [];
  const animations = parsed?.animations && typeof parsed.animations === 'object' ? parsed.animations : {};
  Object.entries(animations).forEach(([animationName, animation]) => {
    const drawOrderTimeline = (animation as any)?.drawOrder;
    if (!Array.isArray(drawOrderTimeline) || drawOrderTimeline.length === 0) return;
    let worst = base.drawCalls;
    drawOrderTimeline.forEach((frame: any) => {
      const offsets = Array.isArray(frame?.offsets)
        ? frame.offsets.map((entry: any) => ({
            slot: String(entry?.slot ?? ''),
            offset: typeof entry?.offset === 'number' ? entry.offset : 0,
          }))
        : [];
      const order = applyDrawOrderOffsets(baseOrder, offsets);
      const result = computeDrawCalls(toItems(order));
      worst = Math.max(worst, result.drawCalls);
    });
    animationStats.push({ name: animationName, worstDrawCalls: worst, sampledFrames: drawOrderTimeline.length });
  });

  const uniquePages = new Set(base.items.map((item) => item.page)).size;
  const uniqueBlends = new Set(base.items.map((item) => item.blend)).size;
  return {
    base,
    animationStats: animationStats.sort((a, b) => b.worstDrawCalls - a.worstDrawCalls),
    uniquePages,
    uniqueBlends,
    slotCount: slots.length,
  };
}

export interface AtlasRepackPlan {
  generatedAt: string;
  maxRegionsPerPage: number;
  blendGroups: Array<{ blend: string; regions: string[] }>;
}

export function createAtlasRepackPlan(analysis: DrawCallAnalysis, maxRegionsPerPage = 64): AtlasRepackPlan {
  const regionsByBlend = new Map<string, Set<string>>();
  analysis.base.items.forEach((item) => {
    if (!regionsByBlend.has(item.blend)) regionsByBlend.set(item.blend, new Set());
    regionsByBlend.get(item.blend)!.add(item.path);
  });

  return {
    generatedAt: new Date().toISOString(),
    maxRegionsPerPage,
    blendGroups: Array.from(regionsByBlend.entries()).map(([blend, regions]) => ({
      blend,
      regions: Array.from(regions),
    })),
  };
}
