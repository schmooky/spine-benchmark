import { Filter, GlProgram } from "pixi.js";

/**
 * A "materialize" filter - a monochrome digital-assembly reveal. The skeleton
 * is mounted on its first setup-pose frame (no animation is ever played), so
 * instead of letting it pop in we sweep `uProgress` 0 -> ~1.15 and the figure
 * assembles from grid-quantized cells that drift into place. The reveal order
 * is biased by luminance and a slight top-down sweep so it reads as being drawn
 * rather than randomly fading, and the dissolve frontier glows white-hot. No
 * hue at all; purely value. The underlying Spine is untouched.
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
    vec2 uv = vTextureCoord;

    // quantize into cells that echo the pixel grid; each gets a stable noise
    // value and a stable drift direction
    vec2 cell = floor(uv * 150.0);
    float n = hash(cell + uSeed);

    // luminance of the resting pixel, used to bias the reveal order
    vec4 probe = texture(uTexture, uv);
    float lum = dot(probe.rgb, vec3(0.299, 0.587, 0.114));

    // a cell resolves once progress passes its threshold. Bias the threshold
    // by luminance (bright bits first) and a gentle top-down sweep, so the
    // figure looks drawn-in rather than randomly grained.
    float threshold = mix(n, 1.0 - lum, 0.25);
    threshold = mix(threshold, uv.y, 0.12);

    float edge = 0.18;
    float reveal = smoothstep(threshold, threshold + edge, uProgress);

    // drift: each cell slides in along its own direction, settling to rest as
    // it resolves
    float settle = 1.0 - reveal;
    vec2 dir = vec2(hash(cell + 4.0), hash(cell + 9.0)) - 0.5;
    vec4 color = texture(uTexture, uv + dir * settle * 0.035);

    // white-hot frontier, brightest where a cell is mid-transition
    float rim = reveal * (1.0 - reveal) * 4.0;

    // pixi filter textures are premultiplied - scale rgb and a together
    vec4 outColor = color * reveal;
    outColor.rgb += vec3(1.0) * rim * color.a;

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
