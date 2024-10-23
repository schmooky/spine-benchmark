import { Application } from "pixi.js";
import { addStats, HEIGHT, WIDTH } from 'pixi-stats';
import * as PIXI from "pixi.js";

export function showPixiStats(app: Application) {
    const stats = addStats(document, app);
    const ticker: PIXI.Ticker = PIXI.Ticker.shared;
    ticker.add(stats.update, stats, PIXI.UPDATE_PRIORITY.UTILITY);
    
    const styles: any = {
        position: "fixed",
        left: `-50px`,
        top: `-42px`,
        opacity: "0.8",
        "user-select": " none",
        scale: 0.5,
        userSelect: "none",
    };
    
    for (const style in styles) {
        stats.stats.domElement.style.setProperty(style, styles[style]);
    }
}