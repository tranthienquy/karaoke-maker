/**
 * VideoExporter - Export karaoke video with selectable quality (Original, 1080p, 2K, 4K)
 */

const RESOLUTIONS = {
  original: null, // use video native resolution
  '1080': { w: 1920, h: 1080 },
  '2k':   { w: 2560, h: 1440 },
  '4k':   { w: 3840, h: 2160 },
};

const BITRATES = {
  original: 25_000_000,
  '1080': 25_000_000,
  '2k':   40_000_000,
  '4k':   80_000_000,
};

export class VideoExporter {
  constructor(app) {
    this.app = app;
    this.modal = document.getElementById('export-modal');
    this.settingsEl = document.getElementById('export-settings');
    this.progressEl = document.getElementById('export-progress-step');
    this.progressFill = document.getElementById('export-progress-fill');
    this.progressText = document.getElementById('export-progress-text');
    this.statusEl = document.getElementById('export-status');
    this.resInfoEl = document.getElementById('export-res-info');
    this.cancelled = false;
    this.recorder = null;
    this._audioCtx = null;
    this._audioSource = null;
    this._selectedRes = '2k';
    this._selectedFps = 60;

    this._setupEvents();
  }

  _setupEvents() {
    // Quality buttons
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._selectedRes = btn.dataset.res;
      });
    });

    // Cancel settings
    document.getElementById('btn-cancel-settings').addEventListener('click', () => {
      this.modal.style.display = 'none';
    });

    // Start export
    document.getElementById('btn-start-export').addEventListener('click', () => {
      this._selectedFps = parseInt(document.getElementById('export-fps').value);
      this._beginExport();
    });

    // Cancel export
    document.getElementById('btn-cancel-export').addEventListener('click', () => this.cancel());
  }

  /** Opens the settings modal */
  start() {
    // Update "original" label with actual video resolution
    const video = this.app.videoPlayer.videoEl;
    const origDesc = document.getElementById('quality-desc-original');
    if (video.videoWidth) {
      origDesc.textContent = `${video.videoWidth} × ${video.videoHeight}`;
    }

    // Show settings step, hide progress step
    this.settingsEl.style.display = '';
    this.progressEl.style.display = 'none';
    this.modal.style.display = 'flex';
  }

  /** Actually begins the export with selected settings */
  async _beginExport() {
    this.cancelled = false;

    // Switch to progress view
    this.settingsEl.style.display = 'none';
    this.progressEl.style.display = '';
    this.statusEl.textContent = 'Đang chuẩn bị...';
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';

    const video = this.app.videoPlayer.videoEl;
    const duration = video.duration;
    const nativeW = video.videoWidth || 1920;
    const nativeH = video.videoHeight || 1080;

    // Determine export resolution
    let exportW, exportH;
    const resCfg = RESOLUTIONS[this._selectedRes];
    if (resCfg) {
      exportW = resCfg.w;
      exportH = resCfg.h;
    } else {
      exportW = nativeW;
      exportH = nativeH;
    }

    const fps = this._selectedFps;
    const bitrate = BITRATES[this._selectedRes] || 25_000_000;

    this.resInfoEl.textContent = `${exportW} × ${exportH} @ ${fps}fps • ${(bitrate / 1_000_000).toFixed(0)} Mbps`;

    // Create export canvas
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = exportW;
    exportCanvas.height = exportH;
    const exportCtx = exportCanvas.getContext('2d');

    // Canvas stream
    const canvasStream = exportCanvas.captureStream(fps);

    // Audio stream
    let combinedStream;
    try {
      if (!this._audioCtx || this._audioCtx.state === 'closed') {
        this._audioCtx = new AudioContext();
        this._audioSource = this._audioCtx.createMediaElementSource(video);
      }
      const dest = this._audioCtx.createMediaStreamDestination();
      this._audioSource.connect(dest);
      this._audioSource.connect(this._audioCtx.destination);
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
    } catch (e) {
      combinedStream = canvasStream;
    }

    // Best codec
    const codecs = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let mimeType = 'video/webm';
    for (const c of codecs) {
      if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
    }

    const chunks = [];
    this.recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 320_000,
    });
    this.recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const exportDone = new Promise(resolve => { this.recorder.onstop = () => resolve(); });
    this.recorder.start(50);

    // Start playback
    video.currentTime = 0;
    this.statusEl.textContent = `Đang xuất ${exportW}×${exportH}...`;
    await new Promise(r => { video.onseeked = r; });
    video.play();

    // Render loop
    const renderLoop = () => {
      if (this.cancelled) return;
      const t = video.currentTime;
      const pct = Math.min(100, (t / duration) * 100);
      this.progressFill.style.width = pct + '%';
      this.progressText.textContent = Math.round(pct) + '%';

      exportCtx.drawImage(video, 0, 0, exportW, exportH);
      this._drawKaraoke(exportCtx, exportW, exportH, t);

      if (t >= duration - 0.05 || video.ended) {
        video.pause();
        setTimeout(() => this.recorder.stop(), 200);
        return;
      }
      requestAnimationFrame(renderLoop);
    };
    renderLoop();

    await exportDone;
    if (this.cancelled) { this.modal.style.display = 'none'; return; }

    const blob = new Blob(chunks, { type: mimeType });
    const sizeMB = (blob.size / (1024 * 1024)).toFixed(1);
    this.statusEl.textContent = `Hoàn tất! (${sizeMB} MB) Đang tải xuống...`;
    this.progressFill.style.width = '100%';
    this.progressText.textContent = '100%';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karaoke-${exportW}x${exportH}.webm`;
    a.click();
    URL.revokeObjectURL(url);
    setTimeout(() => { this.modal.style.display = 'none'; }, 3000);
  }

  _drawKaraoke(ctx, width, height, currentTime) {
    const timecodes = this.app.timecodes;
    if (!timecodes || timecodes.length === 0) return;
    const styles = this.app.stylePanel.getStyles();

    let activeIndex = -1;
    for (let i = 0; i < timecodes.length; i++) {
      const tc = timecodes[i];
      if (tc.start !== null && tc.end !== null && currentTime >= tc.start && currentTime < tc.end) {
        activeIndex = i; break;
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
    else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

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
    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth;
      ctx.strokeText(tc.text, x, y);
    }
    ctx.fillStyle = styles.colorActive;
    ctx.fillText(tc.text, x, y);
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  cancel() {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.app.videoPlayer.pause();
    this.modal.style.display = 'none';
  }
}
