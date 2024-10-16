import "./webgl-memory.js";
import { Application, Sprite } from "pixi.js";
import { SpineBenchmark } from "./SpineBenchmark";
import { CameraContainer } from "./CameraContainer";

import * as PIXI from "pixi.js";
import { gsap } from "gsap";
import { PixiPlugin } from "gsap/PixiPlugin";
import { addStats, Stats } from "pixi-stats";

// import { attributes } from "./text/general.md";

// document.title = attributes.title; // Hello from front-matter

// document.querySelector("#generalRequirementsText")!.innerHTML = JSON.stringify(attributes); // <h1>Markdown File</h1>
// register the plugin
gsap.registerPlugin(PixiPlugin);

// give the plugin a reference to the PIXI object
PixiPlugin.registerPIXI(PIXI);

const WIDTH = 400;
const HEIGHT = 400;

const pixiContainer = document.getElementById("pixiContainer");
const canvas = document.createElement("canvas");
canvas.id = "pixiCanvas";
pixiContainer?.appendChild(canvas);

const app = new Application({
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: 0xf0f0f0,
  view: canvas,
});

const camera = new CameraContainer({ width: WIDTH, height: HEIGHT, app: app });
app.stage.addChild(camera as any);

const benchmark = new SpineBenchmark(app);

const dropArea = document.getElementById("dropArea")!;

function hideDropArea() {
  dropArea.style.display = "none";
}

function showTable() {
  const meshTableContainer = document.getElementById("meshTableContainer");
  if (meshTableContainer) {
    meshTableContainer.style.display = "block";
  }
}

dropArea.addEventListener("dragenter", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

dropArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropArea.classList.add("highlight");
});

dropArea.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropArea.classList.remove("highlight");
});

dropArea.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropArea.classList.remove("highlight");

  const files = e.dataTransfer?.files;
  if (files) {
    benchmark.loadSpineFiles(files);
    hideDropArea();
    showTable();
  }
});

function bytesToSize(bytes: number) {
  const sizes = ["Bytes", "KB", "MB"];
  if (bytes === 0) return "n/a";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
}

const gl = (app.renderer as PIXI.Renderer).gl;
const ext = gl.getExtension("GMAN_webgl_memory");

if (ext) {
  const info = ext.getMemoryInfo();
  setInterval(() => {
    const textureSizeTotalBytes = ext
      .getResourcesInfo(WebGLTexture)
      .map((t: { size: number }) => t.size)
      .reduce((accumulator: number, currentValue: number) => {
        return accumulator + currentValue;
      }, 0);
    const bufferSizeTotalBytes = ext
      .getResourcesInfo(WebGLBuffer)
      .map((t: { size: number }) => t.size)
      .reduce((accumulator: number, currentValue: number) => {
        return accumulator + currentValue;
      }, 0);
    document.getElementById("currentResources")!.innerText = JSON.stringify(
      info,
      null,
      "\t"
    );
    document.getElementById("totalTextures")!.innerText =
      "Total Textures: " + bytesToSize(textureSizeTotalBytes);
    document.getElementById("totalBuffers")!.innerText =
      "Total Buffers: " + bytesToSize(bufferSizeTotalBytes);
  }, 25);
}
