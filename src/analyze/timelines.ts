import { Spine } from "@pixi-spine/all-4.1";

import { attributes, html } from "../text/timelines.md";

document.title = attributes.title; // Hello from front-matter

document.querySelector("#timelinesContainerText")!.innerHTML = html; // <h1>Markdown File</h1>


export function analyzeSpineAnimations(spine: Spine): void {
    const container = document.getElementById('timelinesContainer');
    if (!container) return;

    const skeletonData = spine.spineData;
    const animations = skeletonData.animations;

    console.log('Spine Animations Analysis:');
    console.log('==========================');

    animations.forEach(animation => {
        const name = animation.name;
        const duration = animation.duration;
        const timelines = animation.timelines;
        const timelineCount = timelines.length;
        
        const infoBlock = document.createElement('div');
        infoBlock.className = 'info';

        let timelineInfo = '';
        let totalKeys = 0;

        timelines.forEach(timeline => {
            const frameCount = getTimelineFrameCount(timeline);
            totalKeys += frameCount;
            timelineInfo += `<p>${getTimelineType(timeline)}: ${frameCount} keys</p>`;
        });

        infoBlock.innerHTML = `
            <h3>Animation: ${name}</h3>
            <p><strong>Duration:</strong> ${duration.toFixed(2)} seconds</p>
            <p><strong>Number of Timelines:</strong> ${timelineCount}</p>
            <p><strong>Total Keys:</strong> ${totalKeys}</p>
            <details>
            <summary>Timelines</summary>
                ${timelineInfo}
            </details>
        `;

        container.appendChild(infoBlock);

    });
}



function getTimelineFrameCount(timeline: any): number {
    if ('frames' in timeline) {
        return timeline.frames.length;
    } else if ('frameCount' in timeline) {
        return timeline.frameCount;
    }
    return 0;
}

function getTimelineType(timeline: any): string {
    if ('type' in timeline) {
        return timeline.type;
    }
    return timeline.constructor.name;
}