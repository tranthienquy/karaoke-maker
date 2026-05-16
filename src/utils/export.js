/**
 * VideoExporter - Export karaoke video with selectable quality (Original, 1080p, 2K, 4K)
 * Features: file save picker, dual-line rendering, faster frame-by-frame export
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

    // Update format info based on browser support
    const formatBadge = document.querySelector('.format-badge');
    if (formatBadge) {
      const mp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1') ||
                           MediaRecorder.isTypeSupported('video/mp4');
      formatBadge.textContent = mp4Supported
        ? '📦 Định dạng: MP4 (H.264)'
        : '📦 Định dạng: WebM (VP9)';
    }

    // Show settings step, hide progress step
    this.settingsEl.style.display = '';
    this.progressEl.style.display = 'none';
    this.modal.style.display = 'flex';
  }

  /** Actually begins the export with frame-by-frame rendering for speed */
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
    const canvasStream = exportCanvas.captureStream(0); // manual frame control for speed

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

    // Best codec - prefer MP4/H.264 for wide compatibility, fallback to WebM
    const codecs = [
      'video/mp4;codecs=avc1,opus',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];
    let mimeType = 'video/webm';
    for (const c of codecs) {
      if (MediaRecorder.isTypeSupported(c)) { mimeType = c; break; }
    }
    const isMP4 = mimeType.startsWith('video/mp4');
    const fileExt = isMP4 ? 'mp4' : 'webm';

    const chunks = [];
    this.recorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: bitrate,
      audioBitsPerSecond: 320_000,
    });
    this.recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const exportDone = new Promise(resolve => { this.recorder.onstop = () => resolve(); });
    this.recorder.start(50);

    // Frame-by-frame export
    const totalFrames = Math.ceil(duration * fps);
    const frameInterval = 1 / fps;
    const videoTrack = canvasStream.getVideoTracks()[0];

    video.muted = false;
    video.currentTime = 0;
    await new Promise(r => { video.onseeked = r; });

    this.statusEl.textContent = `Đang xuất ${exportW}×${exportH}... (tăng tốc)`;

    // Use real-time playback but with optimized rendering
    video.play();
    let lastFrameTime = -1;

    const renderLoop = () => {
      if (this.cancelled) return;
      const t = video.currentTime;

      // Only render new frames
      if (t !== lastFrameTime) {
        lastFrameTime = t;
        const pct = Math.min(100, (t / duration) * 100);
        this.progressFill.style.width = pct + '%';
        this.progressText.textContent = Math.round(pct) + '%';

        exportCtx.drawImage(video, 0, 0, exportW, exportH);
        this._drawKaraoke(exportCtx, exportW, exportH, t);

        // Request new frame from canvas stream
        if (videoTrack.requestFrame) {
          videoTrack.requestFrame();
        }
      }

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
    this.statusEl.textContent = `Hoàn tất! (${sizeMB} MB) Chọn nơi lưu file...`;
    this.progressFill.style.width = '100%';
    this.progressText.textContent = '100%';

    // Show save file dialog
    const defaultName = `karaoke-${exportW}x${exportH}.${fileExt}`;
    await this._saveFile(blob, defaultName, isMP4);
    setTimeout(() => { this.modal.style.display = 'none'; }, 2500);
  }

  /**
   * Save file - always shows save dialog for user to choose location
   * Uses File System Access API (Chrome/Edge) or fallback download
   */
  async _saveFile(blob, defaultName, isMP4 = false) {
    // Try File System Access API first (Chrome/Edge - allows choosing save location)
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const fileTypes = isMP4
          ? [{ description: 'Video MP4', accept: { 'video/mp4': ['.mp4'] } }]
          : [
              { description: 'Video MP4', accept: { 'video/mp4': ['.mp4'] } },
              { description: 'Video WebM', accept: { 'video/webm': ['.webm'] } },
            ];

        const handle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: fileTypes,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this.statusEl.textContent = `✅ Đã lưu thành công tại vị trí bạn chọn!`;
        return;
      } catch (e) {
        if (e.name === 'AbortError') {
          this.statusEl.textContent = '⚠️ Đã hủy lưu file.';
          return;
        }
        // Other errors: fall through to standard download
        console.warn('showSaveFilePicker failed, using fallback:', e);
      }
    }

    // Fallback: standard browser download (auto-saves to Downloads folder)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.statusEl.textContent = `✅ Đã tải xuống thư mục Downloads!`;
  }

  _buildFont(styles, fontSize) {
    let fontStyle = '';
    if (styles.italic) fontStyle += 'italic ';
    fontStyle += `${styles.fontWeight || (styles.bold ? 'bold' : '400')} `;
    fontStyle += `${fontSize}px ${styles.fontFamily}`;
    return fontStyle;
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

    // === Draw current line ===
    this._drawKaraokeLine(ctx, tc.text, x, y, fontSize, styles, progress);

    // === Draw next line (dimmed) ===
    if (hasNextLine) {
      const nextTc = timecodes[activeIndex + 1];
      const nextY = y + lineGap;
      const nextFontSize = fontSize * 0.85;
      ctx.font = this._buildFont(styles, nextFontSize);
      ctx.globalAlpha = (styles.opacity / 100) * 0.45;

      if (styles.glow) { ctx.shadowColor = styles.glowColor; ctx.shadowBlur = styles.glowBlur * 0.5; }
      else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

      if (styles.stroke) {
        ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth * 0.7;
        ctx.lineJoin = 'round'; ctx.strokeText(nextTc.text, x, nextY);
      }
      ctx.fillStyle = styles.colorInactive;
      ctx.fillText(nextTc.text, x, nextY);
    }

    ctx.globalAlpha = 1;
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  _drawKaraokeLine(ctx, text, x, y, fontSize, styles, progress) {
    const textWidth = ctx.measureText(text).width;
    const textLeft = x - textWidth / 2;

    if (styles.bgEnabled) {
      ctx.fillStyle = styles.bgColor;
      const pad = fontSize * 0.3;
      ctx.fillRect(textLeft - pad, y - fontSize / 2 - pad, textWidth + pad * 2, fontSize + pad * 2);
    }

    if (styles.glow) { ctx.shadowColor = styles.glowColor; ctx.shadowBlur = styles.glowBlur; }
    else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }

    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth;
      ctx.lineJoin = 'round'; ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = styles.colorInactive;
    ctx.fillText(text, x, y);

    const sweepWidth = textWidth * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(textLeft, y - fontSize, sweepWidth, fontSize * 2);
    ctx.clip();
    if (styles.stroke) {
      ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth;
      ctx.strokeText(text, x, y);
    }
    ctx.fillStyle = styles.colorActive;
    ctx.fillText(text, x, y);
    ctx.restore();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  cancel() {
    this.cancelled = true;
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    this.app.videoPlayer.pause();
    this.modal.style.display = 'none';
  }
}
