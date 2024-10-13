import {
  AttachmentType,
  DeformTimeline,
  MeshAttachment,
} from "@pixi-spine/all-4.1";
import { Spine } from "pixi-spine";
import { mergeMaps } from "../utils/mergeMaps";

import { attributes, html } from "../text/mesh.md";

interface Column {
  header: string;
  accessor: string;
}

interface StyleFunction {
  (row: HTMLTableRowElement, accessor: string, value: any): void;
}

document.title = attributes.title; // Hello from front-matter

document.querySelector("#meshTableContainerText")!.innerHTML = html; // <h1>Markdown File</h1>

// function mergeMaps(
//   map1: Map<string, any>,
//   map2: Map<string, any>,
//   map3: Map<string, any>,
//   map4: Map<string, boolean>
// ): Map<string, Record<string, any>> {
//   const mergedMap = new Map();

//   // Merge keys from both maps
//   const allKeys = new Set([...map1.keys(), ...map2.keys(), ...map3.keys()]);

//   allKeys.forEach((key) => {
//     mergedMap.set(key, {
//       vertices: map1.get(key) ?? "",
//       isChanged: map2.get(key) ?? "",
//       isBoneWeighted: map3.get(key) ?? 0,
//       isUsedInMeshSequence: map4.get(key) ?? false,
//     });
//   });

//   return mergedMap;
// }

function createTable(
  data: Map<string, Record<string, any>>,
  columns: Column[],
  getStyle?: StyleFunction
): HTMLTableElement {
  const table = document.createElement("table");
  table.className = "merged-table";

  // Create table header
  const thead = table.createTHead();
  const headerRow = thead.insertRow();
  columns.forEach((column) => {
    const th = document.createElement("th");
    th.textContent = column.header;
    headerRow.appendChild(th);
  });

  // Create table body
  const tbody = table.createTBody();
  data.forEach((rowData, key) => {
    const row = tbody.insertRow();
    columns.forEach((column) => {
      const cell = row.insertCell();
      const value = column.accessor === "key" ? key : rowData[column.accessor];
      cell.textContent = value?.toString() || "";

      if (getStyle) {
        Object.assign(cell.style, getStyle(row, column.accessor, value));
      }
    });
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
  const meshesWithBoneWeights = new Map<string, number>();
  const meshesWithParents = new Map<string, boolean>();
  // Count total meshes
  skeleton.slots.forEach((slot) => {
    if (
      slot.getAttachment() &&
      slot.getAttachment().type === AttachmentType.Mesh
    ) {
      const attachment = slot.getAttachment()! as MeshAttachment;

      totalMeshCount++;
      if (attachment.bones?.length)
        meshesWithBoneWeights.set(slot.data.name, attachment.bones.length);
      meshWorldVerticesLengths.set(
        slot.data.name,
        (slot.getAttachment() as MeshAttachment).worldVerticesLength
      );
      meshesWithChangesInTimelines.set(slot.data.name, false);
      meshesWithParents.set(slot.data.name, attachment.getParentMesh() != null);
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
    ...meshesWithParents.keys(),
  ]);

  const combinedArray = Array.from(allKeys, (key) => ({
    Key: key,
    "Mesh Vertices": meshWorldVerticesLengths.get(key) || "",
    "Is Changed in Animation": meshesWithChangesInTimelines.get(key),
    "Is Affected By Bones": meshesWithBoneWeights.get(key) ?? 0,
    "Is Used in Mesh Sequence": meshesWithParents.get(key) ?? false,
  }));

  console.table(combinedArray);

  const mergedMap = mergeMaps(
    ["vertices", "isChanged", "isBoneWeighted", "isUsedInMeshSequence"],
    meshWorldVerticesLengths,
    meshesWithChangesInTimelines,
    meshesWithBoneWeights,
    meshesWithParents
  );
  const columns: Column[] = [
    { header: "Слот", accessor: "key" },
    { header: "Вершины", accessor: "vertices" },
    { header: "Деформируется в таймлайнах", accessor: "isChanged" },
    { header: "Связан с костями", accessor: "isBoneWeighted" },
    { header: "Имеет родительский меш", accessor: "isUsedInMeshSequence" },
  ];

  function interpolateColor(
    color1: number[],
    color2: number[],
    factor: number
  ): number[] {
    if (factor <= 0) return color1;
    if (factor >= 1) return color2;

    return color1.map((v, i) => v + factor * (color2[i] - v));
  }

  function setRowColor(row: HTMLTableRowElement, vertexCount: number) {
    const minVertices = 1;
    const maxVertices = 2000;
    const colorStart = [255, 243, 224]; // #fff3e0
    const colorMiddle = [255, 204, 128]; // #ffcc80
    const colorEnd = [239, 154, 154]; // #ef9a9a

    // Calculate logarithmic factor
    const logFactor = Math.log(vertexCount) / Math.log(maxVertices);

    let color;
    if (logFactor <= 0.5) {
      color = interpolateColor(colorStart, colorMiddle, logFactor * 2);
    } else {
      color = interpolateColor(colorMiddle, colorEnd, (logFactor - 0.5) * 2);
    }

    // Make color darker as it approaches maxVertices
    const darkenFactor = Math.min(logFactor * 0.08, 0.08);
    color = color.map((c) => Math.round(c * (1 - darkenFactor)));

    row.style.backgroundColor = rgbToRgba(`rgb(${color})`);
  }

  const getStyle: StyleFunction = (row, accessor, value) => {
    if (accessor === "vertices") {
      setRowColor(row, value);
    }
  };

  const table = createTable(mergedMap, columns, getStyle);
  const meshTableContainer = document.getElementById("meshTableContainer");
  if (meshTableContainer) {
    meshTableContainer.innerHTML = "";
    meshTableContainer.appendChild(table);
    meshTableContainer.style.display = "block";
  }
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

function rgbToRgba(rgbString: string, alpha = 0.8) {
  // Regular expression to match the RGB values
  const rgbRegex = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/;

  // Extract RGB values from the input string
  const match = rgbString.match(rgbRegex);

  if (!match) {
    throw new Error("Invalid RGB string format. Expected 'rgb(r, g, b)'");
  }

  // Parse the RGB values
  const [, r, g, b] = match.map(Number);

  // Validate RGB values
  if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
    throw new Error("RGB values must be between 0 and 255");
  }

  // Validate alpha value
  if (alpha < 0 || alpha > 1) {
    throw new Error("Alpha value must be between 0 and 1");
  }

  // Construct the RGBA string
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
