export const baseVertexShader = `#version 300 es
precision highp float;

in vec2 aPosition;
out vec2 vUv;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const smearDyeShader = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uDye;
uniform vec2 uPoint;
uniform vec2 uDelta;
uniform float uRadius;

void main() {
  vec2 diff = vUv - uPoint;
  float falloff = exp(-dot(diff, diff) / uRadius);
  vec2 offset = uDelta * falloff;
  vec4 current = texture(uDye, vUv);
  vec4 smeared = texture(uDye, clamp(vUv - offset, 0.0, 1.0));
  fragColor = mix(current, smeared, clamp(falloff * 0.88, 0.0, 1.0));
}
`;

export const displayShader = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uDye;
uniform vec2 uTexelSize;
uniform float uImpasto;
uniform vec3 uLightDir;

void main() {
  vec3 color = texture(uDye, vUv).rgb;
  color = pow(max(color, 0.0), vec3(0.97));

  float hL = texture(uDye, vUv - vec2(uTexelSize.x, 0.0)).r;
  float hR = texture(uDye, vUv + vec2(uTexelSize.x, 0.0)).r;
  float hT = texture(uDye, vUv + vec2(0.0, uTexelSize.y)).r;
  float hB = texture(uDye, vUv - vec2(0.0, uTexelSize.y)).r;
  vec3 normal = normalize(vec3(hL - hR, hB - hT, 0.1 / max(uImpasto, 0.1)));

  vec3 light = normalize(uLightDir);
  float diffuse = 0.6 + 0.4 * max(dot(normal, light), 0.0);
  float spec = pow(max(dot(reflect(-light, normal), vec3(0.0, 0.0, 1.0)), 0.0), 20.0) * 0.25;

  color *= diffuse;
  color += spec * vec3(1.0, 0.98, 0.92);

  fragColor = vec4(color, 1.0);
}
`;

export const copyShader = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uSource;

void main() {
  fragColor = texture(uSource, vUv);
}
`;
