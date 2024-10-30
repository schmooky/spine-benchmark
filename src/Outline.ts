import { AttachmentType, MeshAttachment, NumberArrayLike, Spine } from "@pixi-spine/all-4.1";
import { Application } from "pixi.js";
import { SmoothGraphics as Graphics, LINE_SCALE_MODE, settings } from '@pixi/graphics-smooth';


settings.LINE_SCALE_MODE = LINE_SCALE_MODE.NONE;

const areaThreshold = 72;

export class SpineMeshOutline {
    app: Application;
    spine: Spine;
    graphics: Graphics;

    constructor(app: Application, spineInstance: Spine) {
        this.spine = spineInstance;
        this.graphics = new Graphics();
        this.spine.addChild(this.graphics);
        
        // Bind the update method to maintain correct context
        this.update = this.update.bind(this);
        this.app = app;
        // Start updating
        app.ticker.add(this.update);
    }

        // Add this helper function to calculate triangle area
        private calculateTriangleArea(v1: [number, number], v2: [number, number], v3: [number, number]): number {
            // Using the formula: Area = |x1(y2 - y3) + x2(y3 - y1) + x3(y1 - y2)| / 2
            const area = Math.abs(
                v1[0] * (v2[1] - v3[1]) +
                v2[0] * (v3[1] - v1[1]) +
                v3[0] * (v1[1] - v2[1])
            ) / 2;
            return area;
        }

    drawMeshOutline(vertices: NumberArrayLike, triangles: Array<number>, color = 0xFF0000, thickness = 2, alpha = 1) {
        const graphics = this.graphics;
        
        // Clear previous drawings
        
        // Set line style
        graphics.lineStyle(thickness, color, alpha);

        // Create a Set to store unique edges
        const edges = new Set<string>();

        

        // Process triangles to find edges
        for (let i = 0; i < triangles.length; i += 3) {
            const vertices1 = [
                vertices[triangles[i] * 2],
                vertices[triangles[i] * 2 + 1]
            ];
            const vertices2 = [
                vertices[triangles[i + 1] * 2],
                vertices[triangles[i + 1] * 2 + 1]
            ];
            const vertices3 = [
                vertices[triangles[i + 2] * 2],
                vertices[triangles[i + 2] * 2 + 1]
            ];

                        // Calculate triangle area
                        const area = this.calculateTriangleArea(vertices1  as [number,number], vertices2  as [number,number], vertices3  as [number,number]);
                        // If area is less than threshold, fill the triangle with semi-transparent red
                        if (area < areaThreshold) {
                            graphics.beginFill(0xFF0000, 0.2); // Red color with 20% opacity
                            graphics.moveTo(vertices1[0], vertices1[1]);
                            graphics.lineTo(vertices2[0], vertices2[1]);
                            graphics.lineTo(vertices3[0], vertices3[1]);
                            graphics.lineTo(vertices1[0], vertices1[1]);
                            graphics.endFill();
                        }

            // Add edges (sorted to avoid duplicates)
            this.addEdge(edges, vertices1 as [number,number], vertices2 as [number,number]);
            this.addEdge(edges, vertices2 as [number,number], vertices3 as [number,number]);
            this.addEdge(edges, vertices3 as [number,number], vertices1 as [number,number]);
        }

        // Draw all unique edges
        for (const edge of edges) {
            const [x1, y1, x2, y2] = edge.split(',').map(Number);
            graphics.moveTo(x1, y1);
            graphics.lineTo(x2, y2);
        }
    }

    addEdge(edges:Set<string>, point1: [number,number], point2:  [number,number]) {
        // Sort points to ensure consistent edge representation
        const [x1, y1] = point1;
        const [x2, y2] = point2;
        
        if (x1 === x2 && y1 === y2) return; // Skip zero-length edges
        
        const edgeKey = x1 < x2 || (x1 === x2 && y1 < y2)
            ? `${x1},${y1},${x2},${y2}`
            : `${x2},${y2},${x1},${y1}`;
            
        edges.add(edgeKey);
    }

    update() {
        // console.log(this.graphics.parent.parent.scale)
        // const fontScale = 1/Math.max (this.graphics.parent.parent.scale.x,1)
        // Clear previous drawings
        this.graphics.clear();

        // Iterate through all slots
        for (const slot of this.spine.skeleton.slots) {
            const attachment = slot.attachment;
            
            // Check if attachment is a mesh
            if (attachment && attachment.type === AttachmentType.Mesh) {
                if(slot.color.a == 0 || attachment.name == null) continue;
                // Get mesh vertices
                const vertices = new Float32Array((attachment as MeshAttachment).vertices.length);
                (attachment as MeshAttachment).computeWorldVertices(
                    slot,
                    0,
                    (attachment as MeshAttachment).vertices.length,
                    vertices,
                    0,
                    2
                );

                // Draw outline for this mesh
                this.drawMeshOutline(
                    vertices,
                    (attachment as MeshAttachment).triangles,
                    0xf0f, // Red color
                    1, // Line thickness
                    0.32
                );
            }
        }
    }

    destroy() {
        this.app.ticker.remove(this.update);
        this.graphics.destroy();
    }
}