import { Spine } from "@pixi-spine/all-4.1";
import { BLEND_MODES } from "pixi.js";

import { attributes, html } from "../text/blend.md";

document.title = attributes.title; // Hello from front-matter

document.querySelector("#blendModesContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

export function analyzeSpineBlendModes(spine: Spine): void {
  const skeletonData = spine.spineData;
  const animations = skeletonData.animations;
  const slots = skeletonData.slots;
  
  // Helper function to check if a blend mode is non-normal
  const isNonNormalBlendMode = (blendMode: BLEND_MODES): boolean => {
    return blendMode !== BLEND_MODES.NORMAL;
  };
  
  const nonNormalBlendModeSlots = checkSkeletonForNonNormalBlendModes(spine);
  appendBlendModeWarning(nonNormalBlendModeSlots);
  
  // Analyze each animation
  animations.forEach(animation => {
    let maxVisibleNonNormalBlendModes = 0;
    const nonNormalBlendModeSlots: Set<string> = new Set();
    
    // Check each keyframe of the animation
    for (let time = 0; time <= animation.duration; time += 1/30) { // Assuming 30 FPS
      let visibleNonNormalBlendModes = 0;
      
      slots.forEach(slot => {
        if(!slot.attachmentName) return
        const attachment = spine.skeleton.getAttachmentByName(slot.name,slot.attachmentName);
        if (attachment) {
          const blendMode = slot.blendMode;
          if (isNonNormalBlendMode(blendMode)) {
            visibleNonNormalBlendModes++;
            nonNormalBlendModeSlots.add(slot.name);
          }
        }
      });
      
      maxVisibleNonNormalBlendModes = Math.max(maxVisibleNonNormalBlendModes, visibleNonNormalBlendModes);
    }
    
    // If more than two non-normal blend modes are visible simultaneously
    if (maxVisibleNonNormalBlendModes > 2) {
      appendBlendModeAnimationWarning(animation.name, maxVisibleNonNormalBlendModes, Array.from(nonNormalBlendModeSlots));
    }
  });
}

function appendBlendModeAnimationWarning(
  animationName: string,
  maxVisibleNonNormalBlendModes: number,
  affectedSlots: string[]
): void {
  const container = document.getElementById("blendModesContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.className = "warning";
  infoBlock.innerHTML = `
    <h3>Potential Blend Mode Overuse Detected</h3>
    <p><strong>Animation:</strong> ${animationName}</p>
    <p><strong>Max visible non-normal blend modes:</strong> ${maxVisibleNonNormalBlendModes}</p>
    <details>
      <summary><strong>Affected slots:</strong></summary>
        <ul>
          ${affectedSlots.map(slot => `<li>${slot}</li>`).join('')}
        </ul>
    </details>
  `;
  
  container.appendChild(infoBlock);
}
function checkSkeletonForNonNormalBlendModes(spine: Spine): Map<string,BLEND_MODES> {
  const nonNormalBlendModeSlots = new Map<string,BLEND_MODES>();
  const skeletonData = spine.skeleton.data;
  
  for (let i = 0; i < skeletonData.slots.length; i++) {
    const slotData = skeletonData.slots[i];
    const blendMode = slotData.blendMode;
    if (blendMode !== BLEND_MODES.NORMAL) {
      nonNormalBlendModeSlots.set(slotData.name, blendMode);
    }
  }
  
  return nonNormalBlendModeSlots;
}

function appendBlendModeWarning(
  blendModeMap: Map<string, BLEND_MODES>
): void {
  const container = document.getElementById("blendModesContainer");
  if (!container) return;
  
  // Count occurrences of each blend mode
  const blendModeCount = new Map<BLEND_MODES, number>();
  let nonNormalCount = 0;
  
  blendModeMap.forEach((blendMode, slotName) => {
    blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
    if (blendMode !== BLEND_MODES.NORMAL) {
      nonNormalCount++;
    }
  });
  
  const infoBlock = document.createElement("div");
  infoBlock.className = "warning";
  infoBlock.innerHTML = `
    <h3>Blend Mode Usage Summary</h3>
    <p><strong>Total non-normal blend modes:</strong> ${nonNormalCount}</p>
    <p><strong>Blend mode counts:</strong></p>
    <ul>
      ${Array.from(blendModeCount).map(([mode, count]) => `
        <li>${BLEND_MODES[mode]}: ${count}</li>
      `).join('')}
    </ul>
        <details>
    <summary><strong>Slots with non-normal blend modes:</strong></summary>
        <ul>
        ${Array.from(blendModeMap).filter(([_, mode]) => mode !== BLEND_MODES.NORMAL)
          .map(([slot, mode]) => `<li>${slot}: ${BLEND_MODES[mode]}</li>`).join('')}
        </ul>
    </details>
  `;
  
  container.appendChild(infoBlock);
}