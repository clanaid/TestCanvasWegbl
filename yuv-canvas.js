const minPow2 = (v) => {
  // 2 ** Math.ceil(Math.log2(Math.max(0, v)));
  const max = 1 << 30;
  let n = v - 1;
  n |= n >>> 1;
  n |= n >>> 2;
  n |= n >>> 4;
  n |= n >>> 8;
  n |= n >>> 16;
  return n < 0 ? 1 : n >= max ? max : n + 1;
};

const drawTexture = (gl, type, texture, width, height, data) => {
  gl.activeTexture(gl[type]);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    width,
    height,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    data
  );
  gl.generateMipmap(gl.TEXTURE_2D);
};

export default class YUVCanvas {
  constructor(opts = {}) {
    this.canvas = opts.canvas || document.createElement("canvas");
    this.type = opts.type || "yuv420";

    this.initSize(opts);
    this.initContextGL();
    if (this.gl) {
      this.initProgram();
      this.initBuffers();
      this.initTextures();
    }
  }

  static draw(wd, hi, dt) {
    if (!dt) return undefined;
    const type = dt.length === 2 * wd * hi ? "yuv422" : "yuv420";
    if (!this.instance || type !== this.instance.type) {
      console.log("YUVCanvas draw", wd, hi);
      this.instance = new YUVCanvas({ type, wd, hi });
    }
    this.instance.drawNextOutputPicture(wd, hi, dt);
    return this.instance.canvas;
  }

  initSize(opts) {
    const width = opts.wd || opts.width || 640;
    const height = opts.hi || opts.height || 320;
    const wd = minPow2(width);
    const hi = minPow2(height);
    if (this.width !== wd || this.height !== hi) {
      this.width = wd;
      this.height = hi;
      this.canvas.width = wd;
      this.canvas.height = hi;
      this.uvWidth = wd / 2;
      this.uvHeight = this.type === "yuv422" ? hi : hi / 2;
      this.ydata = new Uint8Array(this.width * this.height);
      this.udata = new Uint8Array(this.uvWidth * this.uvHeight);
      this.vdata = new Uint8Array(this.uvWidth * this.uvHeight);
    }
  }

  initContextGL() {
    const { canvas } = this;
    const validContextNames = [
      "webgl",
      "experimental-webgl",
      "moz-webgl",
      "webkit-3d",
    ];
    for (let i = 0; i < validContextNames.length; i++) {
      const contextName = validContextNames[i];
      try {
        this.gl = canvas.getContext(contextName);
        if (typeof this.gl.getParameter === "function") break;
      } catch (e) {
        this.gl = null;
      }
    }
  }

  initProgram() {
    const { gl } = this;
    const vertexShaderScript = `
      attribute vec4 vertexPos;
      attribute vec4 yTexturePos;
      attribute vec4 uTexturePos;
      attribute vec4 vTexturePos;
      varying vec2 yTextureCoord;
      varying vec2 uTextureCoord;
      varying vec2 vTextureCoord;
      void main() {
        gl_Position = vertexPos;
        yTextureCoord = yTexturePos.xy;
        uTextureCoord = uTexturePos.xy;
        vTextureCoord = vTexturePos.xy;
      }`;
    const fragmentShaderScript = `
      precision highp float;
      varying highp vec2 yTextureCoord;
      varying highp vec2 uTextureCoord;
      varying highp vec2 vTextureCoord;
      uniform sampler2D ySampler;
      uniform sampler2D uSampler;
      uniform sampler2D vSampler;
      uniform mat4 YUV2RGB;
      void main(void) {
        highp float y = texture2D(ySampler,  yTextureCoord).r;
        highp float u = texture2D(uSampler,  uTextureCoord).r;
        highp float v = texture2D(vSampler,  vTextureCoord).r;
        gl_FragColor = vec4(y, u, v, 1) * YUV2RGB;
      }`;
    const YUV2RGB = [
      1.16438, 0.0, 1.59603, -0.87079, 1.16438, -0.39176, -0.81297, 0.52959,
      1.16438, 2.01723, 0.0, -1.08139, 0, 0, 0, 1,
    ];
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderScript);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderScript);
    gl.compileShader(fragmentShader);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);
    gl.uniformMatrix4fv(
      gl.getUniformLocation(program, "YUV2RGB"),
      false,
      YUV2RGB
    );

    this.program = program;
  }

  initBuffers() {
    this.initBuffer("vertexPos", [1, 1, -1, 1, 1, -1, -1, -1]);
    this.initBuffer("yTexturePos");
    this.initBuffer("uTexturePos");
    this.initBuffer("vTexturePos");
  }

  initBuffer(name, array = [1, 0, 0, 0, 1, 1, 0, 1]) {
    const { gl, program } = this;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(array), gl.STATIC_DRAW);

    const texturePosRef = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(texturePosRef);
    gl.vertexAttribPointer(texturePosRef, 2, gl.FLOAT, false, 0, 0);
  }

  initTextures() {
    const { gl, program } = this;
    this.yTexture = gl.createTexture();
    this.uTexture = gl.createTexture();
    this.vTexture = gl.createTexture();

    gl.uniform1i(gl.getUniformLocation(program, "ySampler"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "uSampler"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "vSampler"), 2);
  }

  drawNextOuptutPictureGL() {
    const {
      gl,
      width,
      height,
      uvWidth,
      uvHeight,
      ydata,
      udata,
      vdata,
      yTexture,
      uTexture,
      vTexture,
    } = this;
    gl.viewport(0, 0, width, height);

    drawTexture(gl, "TEXTURE0", yTexture, width, height, ydata);
    drawTexture(gl, "TEXTURE1", uTexture, uvWidth, uvHeight, udata);
    drawTexture(gl, "TEXTURE2", vTexture, uvWidth, uvHeight, vdata);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  drawNextOutputPicture(width, height, data) {
    if (this.gl) {
      this.initSize({ width, height });

      let i, x, y;
      for (i = 0, x = 0, y = 0; i < height; i++) {
        this.ydata.set(data.subarray(x, x + width), y);
        x += width;
        y += this.width;
      }
      const dataUVWidth = width / 2;
      const dataUVHeight = this.type === "yuv422" ? height : height / 2;
      for (i = 0, y = 0; i < dataUVHeight; i++) {
        this.udata.set(data.subarray(x, x + dataUVWidth), y);
        x += dataUVWidth;
        y += this.uvWidth;
      }
      for (i = 0, y = 0; i < dataUVHeight; i++) {
        this.vdata.set(data.subarray(x, x + dataUVWidth), y);
        x += dataUVWidth;
        y += this.uvWidth;
      }
      this.drawNextOuptutPictureGL();
    } else {
      this.width = width;
      this.height = height;
      this.canvas.width = width;
      this.canvas.height = height;
      this.drawNextOuptutPictureRGBA(data);
    }
  }

  drawNextOuptutPictureRGBA(data) {
    const ctx = this.canvas.getContext("2d");
    const imageData = ctx.getImageData(0, 0, this.width, this.height);
    imageData.data.set(data);
    ctx.putImageData(imageData, 0, 0);
  }
}
