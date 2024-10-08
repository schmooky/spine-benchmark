import { Bone, Spine } from "@pixi-spine/all-4.1";
import { attributes, html } from "../text/names.md";

document.title = attributes.title; // Hello from front-matter

document.querySelector("#namesContainerText")!.innerHTML = html; // <h1>Markdown File</h1>
  
function isBoneWithNumber(name: string) {
    return /.*bone\d+$/.test(name);
  }

  function isSnakeCase(name: string) {
    return /^[a-z]+(?:_[a-z]+)*(?:_[LR])?$/.test(name);
}


  export function analyzeSpineBoneNames(spineInstance: Spine) {
    const skeleton = spineInstance.skeleton;
    const slots = skeleton.slots;
    const rootBone = skeleton.getRootBone();

    // Create the root <ul> element
    const treeRoot = document.createElement('ul');
    treeRoot.classList.add('bone-tree');

    // Create the tree structure
    createBoneTree(rootBone, treeRoot, 0);

    // Append the tree to the document body (or any other container)
    document.getElementById('namesContainer')!.appendChild(treeRoot);
}

function createBoneTree(bone: Bone, parentElement: HTMLElement, depth: number) {
    const li = document.createElement('li');
    li.textContent = bone.data.name;

    li.classList.add('good-bone');

    if (isBoneWithNumber(bone.data.name)) {
        li.classList.add('default-name-bone');
    }

    if (!isSnakeCase(bone.data.name)) {
        li.classList.add('wrong-case-name-bone');
    }

    parentElement.appendChild(li);

    if (bone.children.length > 0) {
        const ul = document.createElement('ul');
        li.appendChild(ul);

        bone.children.forEach(childBone => {
            createBoneTree(childBone, ul, depth + 1);
        });
    }
}