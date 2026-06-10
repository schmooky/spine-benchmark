import { Filter, GlProgram } from "pixi.js";

/**
 * A dissolve / "materialize" filter. The skeleton is mounted on its very first
 * setup-pose frame (no animation is ever played), so instead of letting it pop
 * in, we sweep `uProgress` 0 -> ~1.15 and the texture grains in from a noise
 * field with a glowing frontier. Purely visual; the underlying Spine is
 * untouched.
 */
const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uProgress;
uniform float uSeed;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

void main(void) {
    vec4 color = texture(uTexture, vTextureCoord);

    // stable per-cell grain so the dissolve looks granular, not like a wipe
    float n = hash(floor(vTextureCoord * 360.0) + uSeed);

    float edge = 0.16;
    // a cell becomes visible once progress passes its noise value
    float reveal = smoothstep(n, n + edge, uProgress);

    // glowing frontier: brightest where a cell is mid-transition
    float rim = reveal * (1.0 - reveal) * 4.0;
    vec3 rimColor = vec3(0.45, 0.78, 1.0);

    // pixi filter textures are premultiplied - scale rgb and a together
    vec4 outColor = color * reveal;
    outColor.rgb += rimColor * rim * color.a;

    finalColor = outColor;
}
`;

export class MaterializeFilter extends Filter {
  constructor(seed = 0) {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: "materialize" }),
      resources: {
        materializeUniforms: {
          uProgress: { value: 0, type: "f32" },
          uSeed: { value: seed, type: "f32" },
        },
      },
    });
  }

  set progress(value: number) {
    this.resources.materializeUniforms.uniforms.uProgress = value;
  }

  get progress(): number {
    return this.resources.materializeUniforms.uniforms.uProgress as number;
  }
}
