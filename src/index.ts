import { Application, Sprite } from 'pixi.js';
import { SpineBenchmark } from './SpineBenchmark';
import { CameraContainer } from './CameraContainer';

import * as PIXI from "pixi.js";
import { gsap } from "gsap";
import { PixiPlugin } from "gsap/PixiPlugin";

// register the plugin
gsap.registerPlugin(PixiPlugin);

// give the plugin a reference to the PIXI object
PixiPlugin.registerPIXI(PIXI);

const WIDTH = 400;
const HEIGHT = 400;

const app = new Application({
    width: WIDTH,
    height:HEIGHT,
    backgroundColor: 0xAAAAAA,
});

const camera = new CameraContainer({width:WIDTH,height:HEIGHT,app:app});
app.stage.addChild(camera as any)


const benchmark = new SpineBenchmark(app);
document.getElementById('pixiContainer')!.appendChild(app.view as HTMLCanvasElement);

const dropArea = document.getElementById('dropArea')!;

console.log(dropArea)

dropArea.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.add('highlight');
});

dropArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('highlight');
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropArea.classList.remove('highlight');

    const files = e.dataTransfer?.files;
    if (files) {
        benchmark.loadSpineFiles(files);
    }
});
