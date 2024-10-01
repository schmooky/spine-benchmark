import { Spine } from "@pixi-spine/all-4.1";
import { BLEND_MODES } from "pixi.js";

export function analyzeSpineBlendModes(spineInstance: Spine) {
    // Check all attachments in all skins
    for (let skinName in spineInstance.spineData.skins) {
      let skin = spineInstance.spineData.skins[skinName];
      for (let slotIndex in skin.attachments) {
        let slot =spineInstance.spineData.slots[slotIndex];
        let slotName = slot.name;
        if(slot.blendMode !== BLEND_MODES.NORMAL) {
            console.log(`Abnormal blend mode found: ${slot.blendMode} in slot ${slotName}`);
        }
      }
    }
  }