import { Application, Sprite } from 'pixi.js';
import { SpineBenchmark } from './SpineBenchmark';
import { CameraContainer } from './CameraContainer';

import * as PIXI from "pixi.js";
import { gsap } from "gsap";
import { PixiPlugin } from "gsap/PixiPlugin";
import translationEN from './locales/en.json';
import translationRU from './locales/ru.json';
import i18next from 'i18next';
import { toast } from './utils/toast';

import { initDevtools } from '@pixi/devtools';

i18next.init({
  lng: 'en', // if you're using a language detector, do not define the lng option
  debug: true,
  resources: {
    en: {
      translation: translationEN
    },
    ru: {
      translation: translationRU
    }
  },
  fallbackLng: 'en',
});

gsap.registerPlugin(PixiPlugin);

// give the plugin a reference to the PIXI object
PixiPlugin.registerPIXI(PIXI);

const WIDTH = 360;
const HEIGHT = 360;

const app = new Application();

await app.init({
  backgroundColor: 0x282b30,
  view: document.getElementById('pixiCanvas')! as HTMLCanvasElement,
  resizeTo: document.getElementById('leftPanel')!,
  antialias: true,
  resolution: 2,
  autoDensity: true,
})


initDevtools({ app });

globalThis.__PIXI_APP__ = app;

// // Set canvas size to match its container
// function resizeCanvas() {
//     const container = document.getElementById('leftPanel')!;
//     app.renderer.resize(container.offsetWidth, container.offsetHeight);
    
// }

// // Initial resize
// resizeCanvas();

// // Resize canvas when window is resized
// window.addEventListener('resize', resizeCanvas);


const camera = new CameraContainer({width:WIDTH,height:HEIGHT,app:app});
app.stage.addChild(camera as any)


const benchmark = new SpineBenchmark(app);

const dropArea = document.getElementById('dropArea')!;

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