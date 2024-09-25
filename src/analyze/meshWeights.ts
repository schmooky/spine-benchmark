import { MeshAttachment, Spine } from "@pixi-spine/all-4.1";


export function attachBoneWeightsToMeshAttachments(skeleton: Spine) {
    // Iterate through all skins in the skeleton data
    for (let skinName in skeleton.spineData.skins) {
      let skin = skeleton.spineData.skins[skinName];
      
      // Iterate through all attachments in the skin
      for (let slotIndex in skin.attachments) {
        let slotAttachments = skin.attachments[slotIndex];
        
        for (let attachmentName in slotAttachments) {
          let attachment = slotAttachments[attachmentName];
          
          // Check if the attachment is a mesh
          if (attachment instanceof MeshAttachment) {
            let meshAttachment = attachment;
            
            // Get the slot for this attachment
            let slot = skeleton.spineData.slots[slotIndex];
            
            // Get the bone that this slot is attached to
            let bone = slot.boneData;
            
            // Create a new array for bone indices and weights if it doesn't exist
            if (!meshAttachment.bones) {
              meshAttachment.bones = [];
            }
            
            // Add the bone index and weight to the mesh attachment
            // let boneIndex = skeleton.bones.indexOf(bone);
            
            // For simplicity, we're setting the weight to 1 for the attached bone
            // You might want to adjust this based on your specific needs
            // meshAttachment.bones.push(boneIndex);
            // meshAttachment.weights.push(1);
            
            // Update the vertices count
            // meshAttachment.bonesCount = meshAttachment.bones.length;
          }
        }
      }
    }
  }
  