import { Bone, Spine, AttachmentType, Attachment } from "@pixi-spine/all-4.1";
import { attributes, html } from "../text/bones.md";

// Map attachment types to icons
const attachmentTypeIcons: Record<AttachmentType, string> = {
    [AttachmentType.Region]: '🖼️', // Image icon for Region
    [AttachmentType.BoundingBox]: '📦', // Box icon for BoundingBox
    [AttachmentType.Mesh]: '🔷', // Diamond icon for Mesh
    [AttachmentType.LinkedMesh]: '🔗', // Link icon for LinkedMesh
    [AttachmentType.Path]: '➰', // Curly loop icon for Path
    [AttachmentType.Point]: '📍', // Pin icon for Point
    [AttachmentType.Clipping]: '✂️', // Scissors icon for Clipping
};

document.querySelector("#bonesContainerText")!.innerHTML = html;

export function analyzeSpineAttachments(spineInstance: Spine) {
    const skeleton = spineInstance.skeleton;
    const slots = skeleton.slots;
    const rootBone = skeleton.getRootBone();

    const treeRoot = document.createElement('ul');
    treeRoot.classList.add('bone-tree');

    createBoneTree(rootBone, treeRoot, 0, slots);

    document.getElementById('bonesContainer')!.appendChild(treeRoot);
}

function createBoneTree(bone: Bone, parentElement: HTMLElement, depth: number, slots: Array<any>) {
    const li = document.createElement('li');
    const contentSpan = document.createElement('span');
    
    // Find attachments for this bone
    const boneAttachments = slots
        .filter(slot => slot.bone === bone)
        .map(slot => slot.attachment)
        .filter(attachment => attachment != null) as Attachment[];

    // Create icon string based on attachments
    const attachmentIcons = boneAttachments
        .map(attachment => attachmentTypeIcons[attachment.type])
        .filter(icon => icon != null)
        .join(' ');

    // Add icons and bone name
    contentSpan.innerHTML = `${attachmentIcons} ${bone.data.name}`;
    li.appendChild(contentSpan);
    
    if (depth > 2) {
        li.classList.add('deep-bone');
    }

    parentElement.appendChild(li);

    if (bone.children.length > 0) {
        const ul = document.createElement('ul');
        li.appendChild(ul);

        bone.children.forEach(childBone => {
            createBoneTree(childBone, ul, depth + 1, slots);
        });
    }
}

function getBoneDistanceFromRoot(bone: Bone, rootBone: Bone) {
    let distance = 0;
    let currentBone = bone;

    while (currentBone && currentBone !== rootBone) {
        distance++;
        currentBone = currentBone.parent!;
    }

    return distance;
}