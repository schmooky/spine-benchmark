import { Attachment, DeformTimeline } from "@pixi-spine/all-4.1";
import { Spine } from "pixi-spine";
import { s } from "vite/dist/node/types.d-aGj9QkWt";
import { mergeMaps } from "../utils/mergeMaps";

export function analyzeMeshTransformations(spineInstance: Spine, threshold = 0.1) {
    const skeletonData = spineInstance.skeleton.data;
    const animations = skeletonData.animations;
    const results = {};
    const animationMeshLoads = new Map<string,number>()
    animations.forEach(animation => {
        const timelines = animation.timelines;
        const meshTransformations: {
            slotIndex: number,
            attachment: Attachment,
            changes: {
                time: number,
                difference: number
            }[]
        }[] = [];
        
        timelines.forEach(timeline => {
            if (timeline instanceof DeformTimeline) {
                const frameCount = timeline.frames.length;
                const changes = [];
                
                for (let i = 1; i < frameCount; i++) {
                    // const prevFrame = timeline.frames[i - 1];
                    // const currentFrame = timeline.frames[i];
                    const difference = calculateDifference(timeline, i-1, i);
                    
                    if (difference > threshold) {
                        changes.push({
                            time: i,
                            difference: difference
                        });
                    }
                }
                if (changes.length > 0) {
                    meshTransformations.push({
                        slotIndex: timeline.slotIndex,
                        attachment: timeline.attachment,
                        changes: changes
                    });
                }
            }
        });
        const meshLoad = meshTransformations.map(a=>a.changes.reduce((partialSum, a) => partialSum + a.difference, 0)).reduce((partialSum, a) => partialSum + a, 0)
        console.log('Mesh Load >',animation.name, meshLoad);
        animationMeshLoads.set(animation.name, meshLoad)
        // animationDeformations(animation.name)
        
    });
    

    const mergedMap = mergeMaps(
      ['load1','load2'],
        animationMeshLoads,
        animationMeshLoads
      );
      const table = createTable(mergedMap, [
        "animation",
        "mesh load",
        "mesh load",
      ]);
  
      document.getElementById("meshTransformationsTableContainer")!.appendChild(table);

    return results;
}

function calculateDifference(timeline: DeformTimeline,prevFrame:number, currentFrame:number) {
    // This is a simplified difference calculation
    // You might want to implement a more sophisticated comparison based on your needs
    let totalDiff = 0;
    for (let i = 0; i < timeline.vertices[currentFrame].length; i++) {
        totalDiff += Math.abs(timeline.vertices[currentFrame][i] - timeline.vertices[prevFrame][i]);
    }
    return totalDiff / timeline.vertices[currentFrame].length;
}

  
  function createTable(
    mergedMap: Map<string, Record<string, any>>,
    columns: string[]
  ) {
    const table = document.createElement("table");
    table.className = "merged-table";
  
    // Create table header
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    columns.forEach((text) => {
      const th = document.createElement("th");
      th.textContent = text;
      headerRow.appendChild(th);
    });
  
    // Create table body
    const tbody = table.createTBody();
    mergedMap.forEach((value, key) => {
      const row = tbody.insertRow();
      const cellKey = row.insertCell();
      const cellValue1 = row.insertCell();
      const cellValue2 = row.insertCell();
  
      cellKey.textContent = key;
      cellValue1.textContent = value.load1;
      cellValue2.textContent = value.load2;
      if (value.load1 > 64) {
        row.classList.add("error");
      } else if (value.load2 > 32) {
        row.classList.add("warn");
      }
    });
  
    return table;
  }