import { html } from "../text/blend.md";
import { BlendMode, Spine } from "@esotericsoftware/spine-pixi-v7";



document.querySelector("#blendModesContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

export function analyzeSpineBlendModes(spine: Spine): void {
  console.log('Analyze: Blend Modes')
  const skeletonData = spine.skeleton.data;
  const animations = skeletonData.animations;
  const slots = skeletonData.slots;
  
  // Helper function to check if a blend mode is non-normal
  const isNonNormalBlendMode = (blendMode: BlendMode): boolean => {
    return blendMode !== BlendMode.Normal;
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
function checkSkeletonForNonNormalBlendModes(spine: Spine): Map<string,BlendMode> {
  const nonNormalBlendModeSlots = new Map<string,BlendMode>();
  const skeletonData = spine.skeleton.data;
  
  for (let i = 0; i < skeletonData.slots.length; i++) {
    const slotData = skeletonData.slots[i];
    const blendMode = slotData.blendMode;
    if (blendMode !== BlendMode.Normal) {
      nonNormalBlendModeSlots.set(slotData.name, blendMode);
    }
  }
  
  return nonNormalBlendModeSlots;
}

function appendBlendModeWarning(
  blendModeMap: Map<string, BlendMode>
): void {
  const container = document.getElementById("blendModesContainer");
  if (!container) return;
  
  // Count occurrences of each blend mode
  const blendModeCount = new Map<BlendMode, number>();
  let nonNormalCount = 0;
  
  blendModeMap.forEach((blendMode, slotName) => {
    blendModeCount.set(blendMode, (blendModeCount.get(blendMode) || 0) + 1);
    if (blendMode !== BlendMode.Normal) {
      nonNormalCount++;
    }
  });
  
  const infoBlock = document.createElement("div");
  infoBlock.className = "";
  infoBlock.innerHTML = `
    <p><strong>Total non-normal blend modes:</strong> ${nonNormalCount}</p>
          ${Array.from(blendModeCount).map(([mode, count]) => `
        <p>${BlendMode[mode]} blend mode: ${count}</p>
      `).join('')}
  `;
  
  document.getElementById('benchmarkSummary')!.appendChild(infoBlock);
}