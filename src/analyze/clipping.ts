import * as PIXI from 'pixi.js';
import { attributes, html } from "../text/clipping.md";
import { AttachmentType, ClippingAttachment, Spine } from '@pixi-spine/all-4.1';

document.title = attributes.title; // Hello from front-matter

document.querySelector("#clippingContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

export function analyzeMasks(spineInstance: Spine): void {

  spineInstance.skeleton.slots.forEach((slot) => {
    if (slot.attachment && slot.attachment.type === AttachmentType.Clipping) {
      const clipping = slot.attachment as ClippingAttachment;
      const verticesCount = clipping.worldVerticesLength / 2; // Divide by 2 because each vertex has x and y
      appendMaskInfo(slot.data.name, verticesCount);
    }
  });
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