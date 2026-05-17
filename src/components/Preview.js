/**
 * Preview - Canvas-based karaoke text rendering with highlight sweep effect
 * Shows current line + next line simultaneously
 */
const isBreakText = (text) => {
  if (!text) return true;
  const t = text.toUpperCase();
  return t.includes('BREAK') || t.trim() === '';
};

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

  _buildFont(styles, fontSize) {
    let fontStyle = '';
    if (styles.italic) fontStyle += 'italic ';
    fontStyle += `${styles.fontWeight || (styles.bold ? 'bold' : '400')} `;
    fontStyle += `${fontSize}px ${styles.fontFamily}`;
    return fontStyle;
  }

  _draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    const timecodes = this.app.timecodes;
    if (!timecodes || timecodes.length === 0) return;

    const currentTime = this.app.videoPlayer.getCurrentTime();
    const styles = this.app.stylePanel.getStyles();

    // Find current line — show 4 seconds before timecode starts
    const LEAD_TIME = 4;
    let activeIndex = -1;
    for (let i = 0; i < timecodes.length; i++) {
      const tc = timecodes[i];
      if (tc.start !== null && tc.end !== null && currentTime >= tc.start - LEAD_TIME && currentTime < tc.end) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex === -1) return;

    const tc = timecodes[activeIndex];
    const text = tc.text;
    // Sweep only starts at the actual timecode time
    const progress = currentTime >= tc.start
      ? Math.max(0, Math.min(1, (currentTime - tc.start) / (tc.end - tc.start)))
      : 0;

    // Build font string
    const fontSize = styles.fontSize * (width / 1280); // scale
    ctx.font = this._buildFont(styles, fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Position from X/Y percentages
    const x = width * (styles.posX / 100);
    const centerY = height * (styles.posY / 100);
    const lineGap = fontSize * 1.6;
    const y1 = centerY - lineGap / 2;
    const y2 = centerY + lineGap / 2;

    let slot1 = null;
    let slot2 = null;

    if (activeIndex % 2 === 0) {
      slot1 = { tc: tc, active: true, y: y1, progress: progress };
      if (activeIndex + 1 < timecodes.length) {
        slot2 = { tc: timecodes[activeIndex + 1], active: false, y: y2 };
      }
    } else {
      slot2 = { tc: tc, active: true, y: y2, progress: progress };
      if (activeIndex + 1 < timecodes.length) {
        slot1 = { tc: timecodes[activeIndex + 1], active: false, y: y1 };
      }
    }

    ctx.globalAlpha = styles.opacity / 100;

    if (slot1 && !isBreakText(slot1.tc.text)) {
      if (slot1.active) {
        this._drawKaraokeLine(ctx, slot1.tc.text, x, slot1.y, fontSize, styles, slot1.progress);
      } else {
        this._drawNextLinePreview(ctx, slot1.tc.text, x, slot1.y, fontSize, styles);
      }
    }
    if (slot2 && !isBreakText(slot2.tc.text)) {
      if (slot2.active) {
        this._drawKaraokeLine(ctx, slot2.tc.text, x, slot2.y, fontSize, styles, slot2.progress);
      } else {
        this._drawNextLinePreview(ctx, slot2.tc.text, x, slot2.y, fontSize, styles);
      }
    }

    // Reset
    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // Highlight active row in timecode editor
    this.app.timecodeEditor.highlightRow(activeIndex);
  }

  _drawNextLinePreview(ctx, text, x, y, fontSize, styles) {
    ctx.font = this._buildFont(styles, fontSize);
    ctx.globalAlpha = (styles.opacity / 100);
    if (styles.glow) { ctx.shadowColor = styles.glowColor; ctx.shadowBlur = styles.glowBlur * 0.5; }
    else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }
    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth * 0.7;
      ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y);
  }

  _drawKaraokeLine(ctx, text, x, y, fontSize, styles, progress) {
    const textMetrics = ctx.measureText(text);
    const textWidth = textMetrics.width;
    const textLeft = x - textWidth / 2;

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

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
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
    const LEAD_TIME = 4;
    let activeIndex = -1;
    for (let i = 0; i < timecodes.length; i++) {
      const tc = timecodes[i];
      if (tc.start !== null && tc.end !== null && currentTime >= tc.start - LEAD_TIME && currentTime < tc.end) {
        activeIndex = i;
        break;
      }
    }
    if (activeIndex === -1) return;

    const tc = timecodes[activeIndex];
    const progress = currentTime >= tc.start
      ? Math.max(0, Math.min(1, (currentTime - tc.start) / (tc.end - tc.start)))
      : 0;

    const fontSize = styles.fontSize * (width / 1280);
    ctx.font = this._buildFont(styles, fontSize);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = width * (styles.posX / 100);
    const hasNextLine = activeIndex + 1 < timecodes.length;
    const lineGap = fontSize * 1.6;
    const y = hasNextLine
      ? height * (styles.posY / 100) - lineGap / 2
      : height * (styles.posY / 100);

    ctx.globalAlpha = styles.opacity / 100;

    // Draw current line
    if (!isBreakText(tc.text)) {
      this._drawKaraokeLine(ctx, tc.text, x, y, fontSize, styles, progress);
    }

    // Draw next line
    if (hasNextLine) {
      const nextTc = timecodes[activeIndex + 1];
      if (!isBreakText(nextTc.text)) {
        const nextY = y + lineGap;
        const nextFontSize = fontSize;
        ctx.font = this._buildFont(styles, nextFontSize);
        ctx.globalAlpha = (styles.opacity / 100) * 0.45;

        if (styles.glow) { ctx.shadowColor = styles.glowColor; ctx.shadowBlur = styles.glowBlur * 0.5; }
        if (styles.stroke) {
          ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth * 0.7;
          ctx.lineJoin = 'round'; ctx.strokeText(nextTc.text, x, nextY);
        }
        ctx.fillStyle = styles.colorInactive;
        ctx.fillText(nextTc.text, x, nextY);
      }
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }
}
