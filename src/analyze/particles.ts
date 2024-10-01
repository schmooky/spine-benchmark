import { Bone, Spine } from "@pixi-spine/all-4.1";
import { attributes, html } from "../text/particles.md";

document.title = attributes.title; // Hello from front-matter

document.querySelector("#particlesContainerText")!.innerHTML = html; // <h1>Markdown File</h1>


export function analyzeSpineForParticles(spineInstance: Spine): void {
    const boneChildrenMap: Map<string, string[]> = new Map();

    // Populate the map with bones and their children
    spineInstance.skeleton.bones.forEach(bone => {
        if (bone.parent) {
            const parentName = bone.parent.data.name;
            if (!boneChildrenMap.has(parentName)) {
                boneChildrenMap.set(parentName, []);
            }
            boneChildrenMap.get(parentName)!.push(bone.data.name);
        }
    });

    // Regular expression to match names ending with _N or N
    const pattern = /^(.+?)(?:_(\d+)|(\d+))$/;

    // Analyze each bone's children
    boneChildrenMap.forEach((children, parentBone) => {
        const groupedChildren: Map<string, string[]> = new Map();

        children.forEach(childName => {
            const match = childName.match(pattern);
            if (match) {
                const baseName = match[1];
                if (!groupedChildren.has(baseName)) {
                    groupedChildren.set(baseName, []);
                }
                groupedChildren.get(baseName)!.push(childName);
            }
        });

        // Check for potential particle animations
        groupedChildren.forEach((similarChildren, baseName) => {
            if (similarChildren.length > 2) {
                appendParticleInfo(parentBone, baseName, similarChildren);
            }
        });
    });
}

function appendParticleInfo(parentBone: string, baseName: string, children: string[]): void {
    const container = document.getElementById('particlesContainer');
    if (!container) return;

    const infoBlock = document.createElement('div');
    infoBlock.className = 'info';
    infoBlock.innerHTML = `
        <h3>Potential Particle Animation Detected</h3>
        <p><strong>Parent bone:</strong> ${parentBone}</p>
        <p><strong>Base name:</strong> ${baseName}</p>
        <p><strong>Children:</strong> ${children.join(', ')}</p>
    `;

    container.appendChild(infoBlock);
}