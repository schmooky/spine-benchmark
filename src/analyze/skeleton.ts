import { Spine, Bone, Slot } from "@esotericsoftware/spine-pixi-v8";

export function createSkeletonTree(spineInstance: Spine) {
  if (!spineInstance || !spineInstance.skeleton) {
    console.error("Invalid Spine instance provided");
    return;
  }

  console.group("createSkeletonTree");
  const skeleton = spineInstance.skeleton;
  
  // Create the tree container
  const treeContainer = document.createElement("div");
  treeContainer.className = "skeleton-tree-container";
  
  // Create tree root
  const treeUl = document.createElement("ul");
  treeUl.className = "skeleton-tree";
  
  // Add skeleton root node
  const rootLi = document.createElement("li");
  rootLi.className = "tree-node skeleton-root";
  
  const rootSpan = document.createElement("span");
  rootSpan.textContent = `Skeleton (${skeleton.data.name || "unnamed"})`;
  rootSpan.className = "node-label";
  rootLi.appendChild(rootSpan);
  
  // Build bones hierarchy
  const bonesUl = document.createElement("ul");
  const rootBones = skeleton.bones.filter(bone => !bone.parent);
  
  rootBones.forEach(rootBone => {
    bonesUl.appendChild(buildBoneNode(rootBone));
  });
  
  rootLi.appendChild(bonesUl);
  treeUl.appendChild(rootLi);
  treeContainer.appendChild(treeUl);
  
  // Add slots information
  const slotsUl = document.createElement("ul");
  slotsUl.className = "slots-list";
  
  skeleton.slots.forEach(slot => {
    const slotLi = buildSlotNode(slot);
    slotsUl.appendChild(slotLi);
  });
  
  rootLi.appendChild(slotsUl);
  
  // Append to document
  document.getElementById("skeletonTreeContainer")?.appendChild(treeContainer) || 
    document.body.appendChild(treeContainer);
  
  // Add basic styling
  addTreeStyles();
  
  console.groupEnd();
}

function buildBoneNode(bone: Bone): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tree-node bone-node";
  
  const span = document.createElement("span");
  span.className = "node-label";
  span.textContent = `Bone: ${bone.data.name} (x: ${bone.x.toFixed(2)}, y: ${bone.y.toFixed(2)})`;
  li.appendChild(span);
  
  // Add children bones
  const children = bone.children;
  if (children.length > 0) {
    const ul = document.createElement("ul");
    children.forEach(childBone => {
      ul.appendChild(buildBoneNode(childBone));
    });
    li.appendChild(ul);
  }
  
  // Make node collapsible
  span.addEventListener("click", (e) => {
    e.stopPropagation();
    li.classList.toggle("collapsed");
  });
  
  return li;
}

function buildSlotNode(slot: Slot): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "tree-node slot-node";
  
  const span = document.createElement("span");
  span.className = "node-label";
  span.textContent = `Slot: ${slot.data.name} (Bone: ${slot.bone.data.name})`;
  
  const attachment = slot.getAttachment();
  if (attachment) {
    const attachmentSpan = document.createElement("span");
    attachmentSpan.className = "attachment-label";
    attachmentSpan.textContent = `Attachment: ${attachment.name}`;
    li.appendChild(attachmentSpan);
  }
  
  li.appendChild(span);
  
  return li;
}

function addTreeStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .skeleton-tree-container {
      margin: 20px;
      font-family: Arial, sans-serif;
    }
    .skeleton-tree {
      list-style: none;
      padding-left: 0;
    }
    .tree-node {
      margin: 5px 0;
      position: relative;
    }
    .node-label {
      cursor: pointer;
      padding: 2px 5px;
      border-radius: 3px;
    }
    .node-label:hover {
      background-color: #f0f0f0;
    }
    .bone-node ul {
      padding-left: 20px;
      margin: 5px 0;
    }
    .slots-list {
      padding-left: 20px;
      margin: 5px 0;
      border-left: 1px dashed #ccc;
    }
    .collapsed > ul {
      display: none;
    }
    .attachment-label {
      display: block;
      padding-left: 25px;
      font-size: 0.9em;
      color: #666;
    }
    .skeleton-root > .node-label {
      font-weight: bold;
      background-color: #e0e0e0;
    }
  `;
  document.head.appendChild(style);
}

// Usage example:
// const spine = new Spine(spineData);
// createSkeletonTree(spine);