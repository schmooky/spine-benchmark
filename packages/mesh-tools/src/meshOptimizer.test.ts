import { describe, expect, it } from 'vitest';
import { optimizeJson } from './meshOptimizer';

function getDeformFrames(optimizedText: string): unknown[] | undefined {
  const data = JSON.parse(optimizedText) as Record<string, any>;
  return data.animations?.idle?.attachments?.default?.slotA?.meshA?.deform;
}

describe('meshOptimizer', () => {
  it('removes deform timelines that are fully zeroed', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          attachments: {
            default: {
              slotA: {
                meshA: {
                  deform: [
                    { time: 0, vertices: [0, 0, 0] },
                    { time: 1, vertices: [] },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const deform = getDeformFrames(optimizedText);

    expect(deform).toBeUndefined();
    expect(report.removedEmptyDeforms).toBe(1);
    expect(report.removedDuplicateFrames).toBe(0);
    expect(report.changedAnimations).toBe(1);
  });

  it('removes duplicate terminal deform frame values', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          attachments: {
            default: {
              slotA: {
                meshA: {
                  deform: [
                    { time: 0, vertices: [0] },
                    { time: 1, vertices: [4] },
                    { time: 2, vertices: [4] },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const deform = getDeformFrames(optimizedText) as Array<{ time?: number }>;

    expect(deform).toHaveLength(2);
    expect(deform.map((frame) => frame.time)).toEqual([0, 1]);
    expect(report.removedDuplicateFrames).toBe(1);
  });

  it('keeps interior duplicate values when removing them would alter curve behavior', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          attachments: {
            default: {
              slotA: {
                meshA: {
                  deform: [
                    { time: 0, vertices: [0], curve: [0.2, 0, 0.8, 1] },
                    { time: 0.5, vertices: [0] },
                    { time: 1, vertices: [10] },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const deform = getDeformFrames(optimizedText);

    expect(deform).toHaveLength(3);
    expect(report.removedDuplicateFrames).toBe(0);
  });

  it('removes interior deform keys that are exactly linearly redundant', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          attachments: {
            default: {
              slotA: {
                meshA: {
                  deform: [
                    { time: 0, vertices: [1, 1] },
                    { time: 0.5, vertices: [5.5, 5.5] },
                    { time: 1, vertices: [10, 10] },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const deform = getDeformFrames(optimizedText) as Array<{ time?: number; vertices?: number[] }>;

    expect(deform).toHaveLength(2);
    expect(deform.map((frame) => frame.time)).toEqual([0, 1]);
    expect(deform[0].vertices).toEqual([1, 1]);
    expect(deform[1].vertices).toEqual([10, 10]);
    expect(report.removedDuplicateFrames).toBe(1);
  });

  it('collapses same-time duplicate values and preserves the latest outgoing curve', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          attachments: {
            default: {
              slotA: {
                meshA: {
                  deform: [
                    { time: 0, vertices: [0], curve: [0.1, 0, 0.9, 1] },
                    { time: 0, vertices: [0], curve: 'stepped' },
                    { time: 1, vertices: [10] },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const deform = getDeformFrames(optimizedText) as Array<{ time?: number; curve?: unknown }>;

    expect(deform).toHaveLength(2);
    expect(deform[0].time).toBe(0);
    expect(deform[0].curve).toBe('stepped');
    expect(report.removedDuplicateFrames).toBe(1);
  });

  it('removes repeated draw-order offsets independent of offset ordering', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          drawOrder: [
            {
              time: 0,
              offsets: [
                { slot: 'a', offset: 1 },
                { slot: 'b', offset: -1 },
              ],
            },
            {
              time: 0.5,
              offsets: [
                { slot: 'b', offset: -1 },
                { slot: 'a', offset: 1 },
              ],
            },
            {
              time: 1,
              offsets: [{ slot: 'a', offset: 0 }],
            },
          ],
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const data = JSON.parse(optimizedText) as Record<string, any>;
    const drawOrder = data.animations?.idle?.drawOrder as unknown[];

    expect(drawOrder).toHaveLength(2);
    expect(report.removedDrawOrderDuplicates).toBe(1);
    expect(report.changedAnimations).toBe(1);
  });

  it('optimizes legacy deform timelines in animation.deform format', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          deform: {
            default: {
              slotA: {
                meshA: [
                  { time: 0, vertices: [0] },
                  { time: 1, vertices: [4] },
                  { time: 2, vertices: [4] },
                ],
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const data = JSON.parse(optimizedText) as Record<string, any>;
    const deform = data.animations?.idle?.deform?.default?.slotA?.meshA as Array<{ time?: number }>;

    expect(deform).toHaveLength(2);
    expect(deform.map((frame) => frame.time)).toEqual([0, 1]);
    expect(report.removedDuplicateFrames).toBe(1);
    expect(report.changedAnimations).toBe(1);
  });

  it('normalizes deform frames by removing redundant linear curve and default sparse fields', () => {
    const source = JSON.stringify({
      animations: {
        idle: {
          attachments: {
            default: {
              slotA: {
                meshA: {
                  deform: [
                    { time: 0, offset: 0, vertices: [], curve: [0, 0, 1, 1] },
                    { time: 1, offset: 0, vertices: [10] },
                  ],
                },
              },
            },
          },
        },
      },
    });

    const { optimizedText, report } = optimizeJson(source);
    const deform = getDeformFrames(optimizedText) as Array<Record<string, unknown>>;

    expect(deform).toHaveLength(2);
    expect(deform[0]).toEqual({ time: 0 });
    expect(deform[1]).toEqual({ time: 1, vertices: [10] });
    expect(report.removedEmptyDeforms).toBe(0);
    expect(report.removedDuplicateFrames).toBe(0);
    expect(report.changedAnimations).toBe(1);
  });
});
