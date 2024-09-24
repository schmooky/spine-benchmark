export class PerformanceMonitor {
    private lastTime: number;
    private frames: number;

    constructor() {
        this.lastTime = performance.now();
        this.frames = 0;
    }

    public getPerformanceInfo() {
        const now = performance.now();
        this.frames++;

        if (now > this.lastTime + 1000) {
            const fps = (this.frames * 1000) / (now - this.lastTime);
            this.lastTime = now;
            this.frames = 0;

            return { fps };
        }

        return { fps: 0 };
    }
}