export class RingBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private writeIdx = 0;
  private filled = false;

  constructor(public readonly capacity: number) {
    if (capacity <= 0)
      throw new Error(`RingBuffer capacity must be > 0 (got ${capacity})`);
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.writeIdx] = item;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.writeIdx === 0) this.filled = true;
  }

  get size(): number {
    return this.filled ? this.capacity : this.writeIdx;
  }

  last(): T | undefined {
    if (this.size === 0) return undefined;
    const idx = (this.writeIdx - 1 + this.capacity) % this.capacity;
    return this.buffer[idx];
  }

  findLast(predicate: (item: T) => boolean): T | undefined {
    const len = this.size;
    for (let i = 0; i < len; i++) {
      const idx = (this.writeIdx - 1 - i + this.capacity) % this.capacity;
      const item = this.buffer[idx];
      if (item !== undefined && predicate(item)) return item;
    }
    return undefined;
  }

  toArray(): T[] {
    const out: T[] = [];
    const len = this.size;
    const start = this.filled ? this.writeIdx : 0;
    for (let i = 0; i < len; i++) {
      const item = this.buffer[(start + i) % this.capacity];
      if (item !== undefined) out.push(item);
    }
    return out;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.writeIdx = 0;
    this.filled = false;
  }
}
