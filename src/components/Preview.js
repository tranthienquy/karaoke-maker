/**
 * Preview - Canvas-based karaoke text rendering with highlight sweep effect
 */
export class Preview {
  constructor(app) {
    this.app = app;
    this.canvas = document.getElementById('preview-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.animId = null;
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const video = this.app.videoPlayer.videoEl;
    // Match canvas to video display size
    const w = video.videoWidth || parent.clientWidth;
    const h = video.videoHeight || parent.clientHeight;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  startLoop() {
    if (this.animId) return;
    const loop = () => {
      this._draw();
      this.animId = requestAnimationFrame(loop);
    };
    loop();
  }

  stopLoop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  _draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    const timecodes = this.app.timecodes;
    if (!timecodes || timecodes.length === 0) return;

    const currentTime = this.app.videoPlayer.getCurrentTime();
    const styles = this.app.stylePanel.getStyles();

    // Find current line
    let activeIndex = -1;
    for (let i = 0; i < timecodes.length; i++) {
      const tc = timecodes[i];
      if (tc.start !== null && tc.end !== null && currentTime >= tc.start && currentTime < tc.end) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex === -1) return;

    const tc = timecodes[activeIndex];
    const text = tc.text;
    const progress = Math.max(0, Math.min(1, (currentTime - tc.start) / (tc.end - tc.start)));

    // Build font string
    let fontStyle = '';
    if (styles.italic) fontStyle += 'italic ';
    if (styles.bold) fontStyle += 'bold ';
    const fontSize = styles.fontSize * (width / 1280); // scale
    fontStyle += `${fontSize}px ${styles.fontFamily}`;
    ctx.font = fontStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Position from X/Y percentages
    const x = width * (styles.posX / 100);
    const y = height * (styles.posY / 100);
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textLeft = x - textWidth / 2;

    // Global opacity
    ctx.globalAlpha = styles.opacity / 100;

    // Background behind text
    if (styles.bgEnabled) {
      ctx.fillStyle = styles.bgColor;
      const pad = fontSize * 0.3;
      ctx.fillRect(textLeft - pad, y - fontSize / 2 - pad, textWidth + pad * 2, fontSize + pad * 2);
    }

    // Glow effect
    if (styles.glow) {
      ctx.shadowColor = styles.glowColor;
      ctx.shadowBlur = styles.glowBlur;
    } else {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // Draw inactive text (full line in inactive color)
    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor;
      ctx.lineWidth = styles.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = styles.colorInactive;
    ctx.fillText(text, x, y);

    // Draw active text with clipping (sweep effect)
    const sweepWidth = textWidth * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(textLeft, y - fontSize, sweepWidth, fontSize * 2);
    ctx.clip();

    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor;
      ctx.lineWidth = styles.strokeWidth;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = styles.colorActive;
    ctx.fillText(text, x, y);
    ctx.restore();

    // Reset
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Highlight active row in timecode editor
    this.app.timecodeEditor.highlightRow(activeIndex);
  }

  /** For export: draw a single frame at given time */
  drawFrame(currentTime, videoEl) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    // Draw video frame
    ctx.drawImage(videoEl, 0, 0, width, height);

    // Draw karaoke overlay
    const timecodes = this.app.timecodes;
    if (!timecodes || timecodes.length === 0) return;

    const styles = this.app.stylePanel.getStyles();
    let activeIndex = -1;
    for (let i = 0; i < timecodes.length; i++) {
      const tc = timecodes[i];
      if (tc.start !== null && tc.end !== null && currentTime >= tc.start && currentTime < tc.end) {
        activeIndex = i;
        break;
      }
    }
    if (activeIndex === -1) return;

    const tc = timecodes[activeIndex];
    const progress = Math.max(0, Math.min(1, (currentTime - tc.start) / (tc.end - tc.start)));

    let fontStyle = '';
    if (styles.italic) fontStyle += 'italic ';
    if (styles.bold) fontStyle += 'bold ';
    const fontSize = styles.fontSize * (width / 1280);
    fontStyle += `${fontSize}px ${styles.fontFamily}`;
    ctx.font = fontStyle;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = width * (styles.posX / 100);
    const y = height * (styles.posY / 100);
    const textWidth = ctx.measureText(tc.text).width;
    const textLeft = x - textWidth / 2;

    ctx.globalAlpha = styles.opacity / 100;

    if (styles.bgEnabled) {
      ctx.fillStyle = styles.bgColor;
      const pad = fontSize * 0.3;
      ctx.fillRect(textLeft - pad, y - fontSize / 2 - pad, textWidth + pad * 2, fontSize + pad * 2);
    }

    if (styles.glow) { ctx.shadowColor = styles.glowColor; ctx.shadowBlur = styles.glowBlur; }

    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth;
      ctx.lineJoin = 'round'; ctx.strokeText(tc.text, x, y);
    }
    ctx.fillStyle = styles.colorInactive;
    ctx.fillText(tc.text, x, y);

    const sweepWidth = textWidth * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(textLeft, y - fontSize, sweepWidth, fontSize * 2);
    ctx.clip();
    if (styles.stroke) { ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth; ctx.strokeText(tc.text, x, y); }
    ctx.fillStyle = styles.colorActive;
    ctx.fillText(tc.text, x, y);
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
}
