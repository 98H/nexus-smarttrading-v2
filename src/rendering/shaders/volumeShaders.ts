export const volumeVertexShader = `#version 300 es
precision highp float;

in vec2 a_position;
in float a_instance_x;
in float a_instance_width;
in float a_instance_height;
in vec4 a_instance_color;

uniform vec2 u_resolution;

out vec4 v_color;

void main() {
    float width = max(u_resolution.x, 1.0);
    // Align bar horizontal center and width to candlestick X positioning
    float x_pixel = a_instance_x + a_position.x * a_instance_width;
    float x_ndc = (x_pixel / width) * 2.0 - 1.0;

    // Restrict volume bars to bottom 20% of viewport height (NDC -1.0 to -0.6, height span 0.4)
    // a_instance_height is normalized [0.0, 0.2] of canvas height
    float y_ndc = -1.0 + a_position.y * (a_instance_height * 2.0);

    gl_Position = vec4(x_ndc, y_ndc, 0.0, 1.0);
    v_color = a_instance_color;
}
`;

export const volumeFragmentShader = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
    fragColor = v_color;
}
`;