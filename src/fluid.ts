import {
  baseVertexShader,
  copyShader,
  displayShader,
  smearDyeShader,
} from './shaders';

export interface PaintConfig {
  impasto: number;
  smearStrength: number;
}

interface FBO {
  texture: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed');
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed');
  }
  return program;
}

function createFBO(gl: WebGL2RenderingContext, width: number, height: number, filter: number): FBO {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('Framebuffer incomplete');
  }

  return { texture, fbo, width, height };
}

function createDoubleFBO(gl: WebGL2RenderingContext, width: number, height: number, filter: number) {
  let read = createFBO(gl, width, height, filter);
  let write = createFBO(gl, width, height, filter);
  return {
    get read() {
      return read;
    },
    get write() {
      return write;
    },
    swap() {
      const tmp = read;
      read = write;
      write = tmp;
    },
  };
}

export class FluidSimulation {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private config: PaintConfig;

  private quad: WebGLBuffer;
  private programs: Record<string, WebGLProgram> = {};
  private uniforms: Record<string, Record<string, WebGLUniformLocation | null>> = {};

  private dye!: ReturnType<typeof createDoubleFBO>;
  private running = false;
  private initialDye: FBO | null = null;

  private pointerX = 0;
  private pointerY = 0;
  private pointerDown = false;
  private hasPointer = false;

  constructor(canvas: HTMLCanvasElement, config: Partial<PaintConfig> = {}) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;
    this.canvas = canvas;

    this.config = {
      impasto: 0.5,
      smearStrength: 0.85,
      ...config,
    };

    this.quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]),
      gl.STATIC_DRAW
    );

    this.initPrograms();
    this.setupEvents();
  }

  private initPrograms() {
    const gl = this.gl;
    const shaders: [string, string, string[]][] = [
      ['display', displayShader, ['uDye', 'uTexelSize', 'uImpasto', 'uLightDir']],
      ['copy', copyShader, ['uSource']],
      ['smearDye', smearDyeShader, ['uDye', 'uPoint', 'uDelta', 'uRadius']],
    ];
    for (const [name, fs, uniNames] of shaders) {
      this.programs[name] = createProgram(gl, baseVertexShader, fs);
      this.uniforms[name] = {};
      for (const u of uniNames) {
        this.uniforms[name][u] = gl.getUniformLocation(this.programs[name], u);
      }
    }
  }

  /** Map client coords to WebGL UV space (0,0 bottom-left, 1,1 top-right). */
  private clientToUv(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = 1 - (clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  private setupEvents() {
    this.canvas.style.touchAction = 'none';

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      const uv = this.clientToUv(e.clientX, e.clientY);
      this.pointerX = uv.x;
      this.pointerY = uv.y;
      this.pointerDown = true;
      this.hasPointer = true;
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.pointerDown || !this.hasPointer) return;
      e.preventDefault();

      const uv = this.clientToUv(e.clientX, e.clientY);
      const dx = (uv.x - this.pointerX) * this.config.smearStrength;
      const dy = (uv.y - this.pointerY) * this.config.smearStrength;

      if (Math.abs(dx) > 0.000001 || Math.abs(dy) > 0.000001) {
        this.smearDye(this.pointerX, this.pointerY, dx, dy, this.brushRadius);
        this.dye.swap();
      }

      this.pointerX = uv.x;
      this.pointerY = uv.y;
    });

    const endPointer = (e: PointerEvent) => {
      if (this.canvas.hasPointerCapture(e.pointerId)) {
        this.canvas.releasePointerCapture(e.pointerId);
      }
      this.pointerDown = false;
      this.hasPointer = false;
    };

    this.canvas.addEventListener('pointerup', endPointer);
    this.canvas.addEventListener('pointercancel', endPointer);
    this.canvas.addEventListener('lostpointercapture', () => {
      this.pointerDown = false;
      this.hasPointer = false;
    });
  }

  setConfig(partial: Partial<PaintConfig>) {
    Object.assign(this.config, partial);
  }

  get brushRadius() {
    return this._brushRadius;
  }
  set brushRadius(v: number) {
    this._brushRadius = v;
  }
  private _brushRadius = 0.008;

  async loadImage(image: HTMLImageElement | ImageBitmap | HTMLCanvasElement) {
    const gl = this.gl;
    let width = image.width;
    let height = image.height;

    const maxDim = 1024;
    if (Math.max(width, height) > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.dye = createDoubleFBO(gl, width, height, gl.LINEAR);

    const source = await this.normalizeImage(image, width, height);

    this.uploadToTexture(source, this.dye.read);
    this.uploadToTexture(source, this.dye.write);

    if (this.initialDye) {
      gl.deleteTexture(this.initialDye.texture);
      gl.deleteFramebuffer(this.initialDye.fbo);
    }
    this.initialDye = createFBO(gl, width, height, gl.LINEAR);
    this.uploadToTexture(source, this.initialDye);

    this.running = true;
    this.render();
  }

  /** Draw via 2D canvas so orientation is always upright, then upload with standard WebGL flip. */
  private async normalizeImage(
    image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
    width: number,
    height: number
  ): Promise<HTMLCanvasElement> {
    const oriented = await createImageBitmap(image, { imageOrientation: 'from-image' });
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(oriented, 0, 0, width, height);
    return c;
  }

  private uploadToTexture(source: HTMLCanvasElement, target: FBO) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  }

  reset() {
    if (!this.initialDye) return;
    this.blit(this.initialDye.texture, this.dye.read);
    this.blit(this.initialDye.texture, this.dye.write);
    this.render();
  }

  start() {
    const loop = () => {
      if (this.running) {
        this.render();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private smearDye(x: number, y: number, dx: number, dy: number, radius: number) {
    const gl = this.gl;
    const program = this.programs.smearDye;
    const u = this.uniforms.smearDye;
    this.bindQuad(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.dye.write.fbo);
    gl.viewport(0, 0, this.dye.write.width, this.dye.write.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1i(u.uDye!, 0);
    gl.uniform2f(u.uPoint!, x, y);
    gl.uniform2f(u.uDelta!, dx, dy);
    gl.uniform1f(u.uRadius!, radius);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private bindQuad(program: WebGLProgram) {
    const gl = this.gl;
    gl.useProgram(program);
    const loc = gl.getAttribLocation(program, 'aPosition');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }

  private blit(src: WebGLTexture | FBO, dest: FBO) {
    const gl = this.gl;
    const program = this.programs.copy;
    const u = this.uniforms.copy;
    this.bindQuad(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fbo);
    gl.viewport(0, 0, dest.width, dest.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src instanceof WebGLTexture ? src : src.texture);
    gl.uniform1i(u.uSource!, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  private render() {
    const gl = this.gl;
    const program = this.programs.display;
    const u = this.uniforms.display;
    this.bindQuad(program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dye.read.texture);
    gl.uniform1i(u.uDye!, 0);
    gl.uniform2f(u.uTexelSize!, 1 / this.dye.read.width, 1 / this.dye.read.height);
    gl.uniform1f(u.uImpasto!, this.config.impasto);
    gl.uniform3f(u.uLightDir!, -0.4, 0.6, 0.8);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  download(filename = 'oil-painting.png') {
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.canvas.toDataURL('image/png');
    link.click();
  }
}
