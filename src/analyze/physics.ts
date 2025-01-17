import { Spine } from "@esotericsoftware/spine-pixi-v8"

export function analyzePhysics(spine: Spine): void {
  console.log('Analyze: Physics')
  console.log(spine.skeleton.physicsConstraints)
  
}