import {
  AttachmentType,
  DeformTimeline,
  MeshAttachment,
} from "@pixi-spine/all-4.1";
import { Spine } from "pixi-spine";

import { attributes, html } from "../text/mesh.md";

document.title = attributes.title; // Hello from front-matter

document.querySelector("#meshTableContainerText")!.innerHTML = html; // <h1>Markdown File</h1>



function mergeMaps(
  map1: Map<string, any>,
  map2: Map<string, any>,
  map3: Map<string, any>,
  map4: Map<string, boolean>
): Map<string,Record<string,any>> {
  const mergedMap = new Map();
  
  // Merge keys from both maps
  const allKeys = new Set([...map1.keys(), ...map2.keys(), ...map3.keys()]);
  
  allKeys.forEach((key) => {
    mergedMap.set(key, {
      vertices: map1.get(key) ?? "",
      isChanged: map2.get(key) ?? "",
      isBoneWeighted: map3.get(key) ?? false,
      isUsedInMeshSequence: map4.get(key) ?? false,
    });
  });
  
  return mergedMap;
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
    const cellValue3 = row.insertCell();
    const cellValue4 = row.insertCell();
    
    cellKey.textContent = key;
    cellValue1.textContent = value.vertices;
    cellValue2.textContent = value.isChanged;
    cellValue3.textContent = value.isBoneWeighted;
    cellValue4.textContent = value.isUsedInMeshSequence;

    if ((!value.isChanged && !value.isBoneWeighted) || value.vertices > 64) {
      row.classList.add("error");
    } else if (value.vertices > 8) {
      row.classList.add("warn");
    }
  });
  
  return table;
}

export function analyzeMeshes(spineInstance: Spine) {
  if (!spineInstance || !spineInstance.skeleton) {
    console.error("Invalid Spine instance provided");
    return;
  }
  console.group("analyzeMeshes");
  const skeleton = spineInstance.skeleton;
  const animations = spineInstance.spineData.animations;
  
  let totalMeshCount = 0;
  let changedMeshCount = 0;
  const meshesWithChangesInTimelines = new Map();
  const meshWorldVerticesLengths = new Map<string, number>();
  const meshesWithBoneWeights = new Map<string, boolean>();
  const meshesWithSequences = new Map<string, boolean>();
  // Count total meshes
  skeleton.slots.forEach((slot) => {
    if (
      slot.getAttachment() &&
      slot.getAttachment().type === AttachmentType.Mesh
    ) {
      const attachment = slot.getAttachment()! as MeshAttachment;
      
      console.log(attachment.name, attachment);
      totalMeshCount++;
      if (attachment.bones?.length)
        meshesWithBoneWeights.set(slot.data.name, true);
      meshWorldVerticesLengths.set(
        slot.data.name,
        (slot.getAttachment() as MeshAttachment).worldVerticesLength
      );
      meshesWithChangesInTimelines.set(slot.data.name, false);
      meshesWithSequences.set(slot.data.name, attachment.sequence != null);
    }
  });
  console.table(
    Array.from(meshWorldVerticesLengths).reduce(
      (acc: Record<string, number>, [slotName, value]) => {
        acc[slotName] = value;
        return acc;
      },
      {}
    )
  );
  // Analyze animations for mesh changes
  animations.forEach((animation) => {
    const timelines = animation.timelines;
    
    timelines.forEach((timeline) => {
      if (timeline instanceof DeformTimeline) {
        const slotIndex = timeline.slotIndex;
        const slot = skeleton.slots[slotIndex];
        
        if (
          slot.getAttachment() &&
          slot.getAttachment().type === AttachmentType.Mesh
        ) {
          meshesWithChangesInTimelines.set(slot.data.name, true);
        }
      }
    });
  });
  
  const allKeys = new Set([
    ...meshWorldVerticesLengths.keys(),
    ...meshesWithChangesInTimelines.keys(),
    ...meshesWithBoneWeights.keys(),
    ...meshesWithSequences.keys(),
  ]);
  
  const combinedArray = Array.from(allKeys, (key) => ({
    Key: key,
    "Mesh Vertices": meshWorldVerticesLengths.get(key) || "",
    "Is Changed in Animation": meshesWithChangesInTimelines.get(key),
    "Is Affected By Bones": meshesWithBoneWeights.get(key) ?? false,
    "Is Used in Mesh Sequence": meshesWithSequences.get(key) ?? false,
  }));
  
  console.table(combinedArray);
  
  const mergedMap = mergeMaps(
    meshWorldVerticesLengths,
    meshesWithChangesInTimelines,
    meshesWithBoneWeights,
    meshesWithSequences
  );
  const table = createTable(mergedMap, [
    "slot",
    "vertices",
    "changed in animation timeline",
    "Is Affected By Bones",
    "Is Used in Mesh Sequence",
  ]);
  
  console.log("MESHES",mergedMap);
  (mergedMap.keys() as any as Array<string>).forEach((key) => {
    console.log(key)
    if (!mergedMap.get(key)!.isChanged && !mergedMap.get(key)!.isBoneWeighted) {
      console.log('*')
      appendMeshMisuseInfo(key, mergedMap.get(key)!.isUsedInMeshSequence);
    }
  });
  
  document.getElementById("meshTableContainer")!.appendChild(table);
  
  console.groupEnd();
}

function appendMeshMisuseInfo(
  slotName: string,
  isUsedInMeshSequence: boolean
): void {
  const container = document.getElementById("meshTableContainer");
  if (!container) return;
  
  const infoBlock = document.createElement("div");
  infoBlock.className = "warning";
  infoBlock.innerHTML = `
        <h3>Potential Mesh Misuse Detected</h3>
        <p><strong>Slot name:</strong> ${slotName}</p>
        <p><strong>Deformed in timeline:</strong> false</p>
        <p><strong>Affected by bones</strong> false</p>
        <p><strong>Used in sequence:</strong> ${isUsedInMeshSequence}</p>
  
  `;
  
  container.appendChild(infoBlock);
}
