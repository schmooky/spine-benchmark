import { Attachment, DeformTimeline } from "@pixi-spine/all-4.1";
import { Spine } from "pixi-spine";
import { s } from "vite/dist/node/types.d-aGj9QkWt";
import { mergeMaps } from "../utils/mergeMaps";

export function analyzeDeformations(spineInstance: Spine, threshold = 0.1) {
  const skeletonData = spineInstance.skeleton.data;
  const animations = skeletonData.animations;
  const results = {};
  const animationMeshLoads = new Map<string, number>();
  const animationDurations = new Map<string, number>();
  animations.forEach((animation) => {
    animationDurations.set(animation.name, animation.duration);
    const timelines = animation.timelines;
    const meshTransformations: {
      slotIndex: number;
      attachment: Attachment;
      changes: {
        time: number;
        difference: number;
      }[];
    }[] = [];

    timelines.forEach((timeline) => {
      if (timeline instanceof DeformTimeline) {
        const frameCount = timeline.frames.length;
        const changes = [];

        for (let i = 1; i < frameCount; i++) {
          // const prevFrame = timeline.frames[i - 1];
          // const currentFrame = timeline.frames[i];
          const difference = calculateDifference(timeline, i - 1, i);

          if (difference > threshold) {
            changes.push({
              time: i,
              difference: difference,
            });
          }
        }
        if (changes.length > 0) {
          meshTransformations.push({
            slotIndex: timeline.slotIndex,
            attachment: timeline.attachment,
            changes: changes,
          });
        }
      }
    });
    const meshLoad = Math.floor(
      meshTransformations
        .map((a) =>
          a.changes.reduce((partialSum, a) => partialSum + a.difference, 0)
        )
        .reduce((partialSum, a) => partialSum + a, 0)
    );
    animationMeshLoads.set(animation.name, meshLoad);
    // animationDeformations(animation.name)
  });

  const mergedMap = mergeMaps(
    ["load1", "duration"],
    animationMeshLoads,
    animationDurations
  );
  const table = createTable(mergedMap, [
    "Анимация",
    "Изменения",
    "Продолжительность",
  ]);

  document
    .getElementById("meshTransformationsTableContainer")!
    .appendChild(table);

  return results;
}

function calculateDifference(
  timeline: DeformTimeline,
  prevFrame: number,
  currentFrame: number
) {
  // This is a simplified difference calculation
  // You might want to implement a more sophisticated comparison based on your needs
  let totalDiff = 0;
  for (let i = 0; i < timeline.vertices[currentFrame].length; i++) {
    totalDiff += Math.abs(
      timeline.vertices[currentFrame][i] - timeline.vertices[prevFrame][i]
    );
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
    cellValue2.textContent = value.duration.toFixed(2) + "сек";

    function interpolateColor(color1, color2, factor) {
      const result = color1.slice();
      for (let i = 0; i < 3; i++) {
        result[i] = Math.round(result[i] + factor * (color2[i] - color1[i]));
      }
      return result;
    }

    // Function to convert RGB to hex
    function rgbToHex(rgb) {
      return (
        "#" +
        rgb
          .map((x) => {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
          })
          .join("")
      );
    }

    // Set color based on vertex count
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

      row.style.backgroundColor = rgbToHex(color);
    }

    // Apply color to the row
    setRowColor(row, value.load1);
  });

  return table;
}
