import * as PIXI from 'pixi.js';
import { attributes, html } from "../text/clipping.md";
import { ClippingAttachment, Spine } from '@esotericsoftware/spine-pixi-v8';



document.querySelector("#clippingContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

export function analyzeClipping(spine: Spine): void {
  console.log('Analyze: Clipping')
  console.log(spine.skeleton.slots)
  const masks: [string,number][] = []
  spine.skeleton.slots.forEach((slot) => {
    if (slot.attachment && slot.attachment instanceof ClippingAttachment) {
      const clipping = slot.attachment as ClippingAttachment;
      const verticesCount = clipping.worldVerticesLength / 2; // Divide by 2 because each vertex has x and y
      appendMaskInfo(slot.data.name, verticesCount);
      masks.push([slot.data.name, verticesCount])
    }
  });
  appendMaskSummary(masks)
}

function appendMaskInfo(slotName: string, verticesCount: number): void {
  const container = document.getElementById("clippingContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.className = verticesCount > 4 ? "warning" : "info";
  infoBlock.innerHTML = `
    <h3>Mask Detected</h3>
    <p><strong>Slot name:</strong> ${slotName}</p>
    <p><strong>Vertices count:</strong> ${verticesCount}</p>
  `;
  
  container.appendChild(infoBlock);
}


function appendMaskSummary(masks: [string,number][]): void {
  const container = document.getElementById("clippingContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.innerHTML = `
    <h3><strong>Mask Count: ${masks.length}</strong></h3>
    <p>Mask Vertice Counts: ${masks.map((_)=>_[1]).join(', ')}</p>
  `;

  document.getElementById('benchmarkSummary')!.appendChild(infoBlock);
}