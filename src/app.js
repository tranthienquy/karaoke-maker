import { VideoPlayer } from './components/VideoPlayer.js';
import { LyricsEditor } from './components/LyricsEditor.js';
import { TimecodeSync } from './components/TimecodeSync.js';
import { TimecodeEditor } from './components/TimecodeEditor.js';
import { StylePanel } from './components/StylePanel.js';
import { Preview } from './components/Preview.js';
import { VideoExporter } from './utils/export.js';

/**
 * App - Main controller coordinating all components
 */
export class App {
  constructor() {
    this.timecodes = []; // [{index, text, start, end}]
    this.videoLoaded = false;
    this._previewActive = false;
    this._previewAnimId = null;
  }

  init() {
    this.videoPlayer = new VideoPlayer(this);
    this.lyricsEditor = new LyricsEditor(this);
    this.timecodeSync = new TimecodeSync(this);
    this.timecodeEditor = new TimecodeEditor(this);
    this.stylePanel = new StylePanel(this);
    this.preview = new Preview(this);
    this.exporter = new VideoExporter(this);

    this._setupTabs();
    this._setupHeaderButtons();
    this._setupPreviewModal();
    this._loadProject();
  }

  // ===== Tab switching =====
  _setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab;
        document.querySelector(`[data-tab-content="${target}"]`).classList.add('active');
      });
    });
  }

  // ===== Header buttons =====
  _setupHeaderButtons() {
    document.getElementById('btn-export').addEventListener('click', () => {
      if (this._canExport()) this.exporter.start();
    });
    document.getElementById('btn-preview-full').addEventListener('click', () => {
      if (this._canExport()) this._openPreview();
    });
    document.getElementById('btn-save-project').addEventListener('click', () => this._saveProject());
    document.getElementById('btn-download-project').addEventListener('click', () => this._downloadProject());
    document.getElementById('btn-import-project').addEventListener('click', () => {
      document.getElementById('import-project-input').click();
    });
    document.getElementById('import-project-input').addEventListener('change', (e) => {
      if (e.target.files[0]) this._importProject(e.target.files[0]);
      e.target.value = ''; // reset so same file can be selected again
    });
  }

  // ===== Full-screen Preview Modal =====
  _setupPreviewModal() {
    this._pvOverlay = document.getElementById('preview-overlay');
    this._pvCanvas = document.getElementById('preview-full-canvas');
    this._pvCtx = this._pvCanvas.getContext('2d');
    this._pvPlayBtn = document.getElementById('preview-play-pause');
    this._pvPlayIcon = this._pvPlayBtn.querySelector('.pp-play');
    this._pvPauseIcon = this._pvPlayBtn.querySelector('.pp-pause');
    this._pvTimeCurrent = document.getElementById('preview-time-current');
    this._pvTimeDuration = document.getElementById('preview-time-duration');
    this._pvProgressFill = document.getElementById('preview-progress-fill-modal');
    this._pvProgressWrap = document.getElementById('preview-progress-wrap');

    document.getElementById('preview-close').addEventListener('click', () => this._closePreview());
    this._pvPlayBtn.addEventListener('click', () => this._pvTogglePlay());
    document.getElementById('preview-restart').addEventListener('click', () => {
      this.videoPlayer.seek(0);
      this.videoPlayer.play();
    });
    document.getElementById('preview-export-btn').addEventListener('click', () => {
      this._closePreview();
      setTimeout(() => this.exporter.start(), 200);
    });
    // Seek on progress bar click
    this._pvProgressWrap.addEventListener('click', (e) => {
      const rect = this._pvProgressWrap.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.videoPlayer.seek(pct * this.videoPlayer.getDuration());
    });
  }

  _openPreview() {
    const video = this.videoPlayer.videoEl;
    // Set canvas to native video resolution for full quality
    this._pvCanvas.width = video.videoWidth || 1280;
    this._pvCanvas.height = video.videoHeight || 720;

    this._pvTimeDuration.textContent = this._fmtShort(video.duration);
    this._pvOverlay.style.display = 'flex';
    this._previewActive = true;

    // Start from beginning
    this.videoPlayer.seek(0);
    this.videoPlayer.play();
    this._pvUpdatePlayIcon(true);

    // Start render loop
    this._pvRenderLoop();
  }

  _closePreview() {
    this._previewActive = false;
    this._pvOverlay.style.display = 'none';
    this.videoPlayer.pause();
    if (this._previewAnimId) {
      cancelAnimationFrame(this._previewAnimId);
      this._previewAnimId = null;
    }
  }

  _pvTogglePlay() {
    const video = this.videoPlayer.videoEl;
    if (video.paused) {
      video.play();
      this._pvUpdatePlayIcon(true);
    } else {
      video.pause();
      this._pvUpdatePlayIcon(false);
    }
  }

  _pvUpdatePlayIcon(playing) {
    this._pvPlayIcon.style.display = playing ? 'none' : 'block';
    this._pvPauseIcon.style.display = playing ? 'block' : 'none';
  }

  _pvRenderLoop() {
    if (!this._previewActive) return;
    const video = this.videoPlayer.videoEl;
    const ctx = this._pvCtx;
    const { width, height } = this._pvCanvas;
    const currentTime = video.currentTime;
    const duration = video.duration || 1;

    // Draw video frame
    ctx.drawImage(video, 0, 0, width, height);

    // Draw karaoke overlay
    this.preview.drawFrame(currentTime, video);
    // Copy the preview canvas content to the full preview canvas
    // Actually, we draw directly on this canvas instead
    this._drawKaraokeOnCanvas(ctx, width, height, currentTime);

    // Update controls
    const pct = (currentTime / duration) * 100;
    this._pvProgressFill.style.width = pct + '%';
    this._pvTimeCurrent.textContent = this._fmtShort(currentTime);

    if (video.paused) {
      this._pvUpdatePlayIcon(false);
    }

    if (video.ended) {
      this._pvUpdatePlayIcon(false);
      return;
    }

    this._previewAnimId = requestAnimationFrame(() => this._pvRenderLoop());
  }

  _buildFont(styles, fontSize) {
    let fontStyle = '';
    if (styles.italic) fontStyle += 'italic ';
    fontStyle += `${styles.fontWeight || (styles.bold ? 'bold' : '400')} `;
    fontStyle += `${fontSize}px ${styles.fontFamily}`;
    return fontStyle;
  }

  _drawKaraokeOnCanvas(ctx, width, height, currentTime) {
    const timecodes = this.timecodes;
    if (!timecodes || timecodes.length === 0) return;
    const styles = this.stylePanel.getStyles();

    const LEAD_TIME = 4;
    let activeIndex = -1;
    for (let i = 0; i < timecodes.length; i++) {
      const tc = timecodes[i];
      if (tc.start !== null && tc.end !== null && currentTime >= tc.start - LEAD_TIME && currentTime < tc.end) {
        activeIndex = i; break;
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

    // === Draw current line ===
    this._drawKaraokeLine(ctx, tc.text, x, y, fontSize, styles, progress);

    // === Draw next line (dimmed) ===
    if (hasNextLine) {
      const nextTc = timecodes[activeIndex + 1];
      const nextY = y + lineGap;
      const nextFontSize = fontSize;
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
    if (styles.stroke) { ctx.strokeStyle = styles.strokeColor; ctx.lineWidth = styles.strokeWidth; ctx.strokeText(text, x, y); }
    ctx.fillStyle = styles.colorActive;
    ctx.fillText(text, x, y);
    ctx.restore();

    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  _fmtShort(s) {
    if (!s || isNaN(s)) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  // ===== Event handlers from components =====
  onVideoLoaded() {
    this.videoLoaded = true;
    this.preview.startLoop();
    this._updateActionBtns();
  }

  onVideoMetadataReady() {
    this.preview._resize();
    if (this.lyricsEditor.getLines().length > 0) {
      this.timecodeSync.enable();
    }
  }

  onVideoEnded() {}

  onTimeUpdate(time) {
    // Preview loop handles rendering
  }

  onLyricsChanged(lines) {
    // Rebuild timecodes keeping existing ones where possible
    const oldTc = this.timecodes;
    this.timecodes = lines.map((text, i) => {
      if (oldTc[i] && oldTc[i].text === text) return oldTc[i];
      return { index: i, text, start: oldTc[i]?.start ?? null, end: oldTc[i]?.end ?? null };
    });
    this.timecodeEditor.render();

    // Enable/disable sync button
    if (lines.length > 0 && this.videoLoaded) {
      this.timecodeSync.enable();
    } else {
      this.timecodeSync.disable();
    }
    this._updateActionBtns();
  }

  onTimecodesChanged() {
    this.timecodeEditor.render();
    this._updateActionBtns();
  }

  onStyleChanged(styles) {
    // Preview updates automatically via render loop
  }

  getLyrics() { return this.lyricsEditor.getLines(); }

  // ===== Export readiness =====
  _canExport() {
    return this.videoLoaded
      && this.timecodes.length > 0
      && this.timecodes.some(tc => tc.start !== null);
  }

  _updateActionBtns() {
    const can = this._canExport();
    document.getElementById('btn-export').disabled = !can;
    document.getElementById('btn-preview-full').disabled = !can;
  }

  // ===== Save / Load =====
  _saveProject() {
    const data = {
      lyrics: this.lyricsEditor.getLines(),
      timecodes: this.timecodes,
      styles: this.stylePanel.getStyles(),
    };
    localStorage.setItem('karaoke-project', JSON.stringify(data));
    // Quick toast-like feedback
    const btn = document.getElementById('btn-save-project');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Đã lưu';
    setTimeout(() => btn.innerHTML = orig, 1500);
  }

  _loadProject() {
    const raw = localStorage.getItem('karaoke-project');
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      this._applyProjectData(data);
    } catch (e) {
      console.warn('Failed to load project:', e);
    }
  }

  // ===== Download Project (backup file) =====
  _downloadProject() {
    const data = {
      _format: 'karaoke-maker-project',
      _version: 1,
      _exportedAt: new Date().toISOString(),
      lyrics: this.lyricsEditor.getLines(),
      timecodes: this.timecodes,
      styles: this.stylePanel.getStyles(),
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karaoke-project-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);

    const btn = document.getElementById('btn-download-project');
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Đã tải';
    setTimeout(() => btn.innerHTML = orig, 1500);
  }

  // ===== Import Project (from file) =====
  async _importProject(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.lyrics && !data.timecodes) {
        alert('File không hợp lệ. Vui lòng chọn file dự án Karaoke (.json).');
        return;
      }

      this._applyProjectData(data);

      const btn = document.getElementById('btn-import-project');
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Đã import';
      setTimeout(() => btn.innerHTML = orig, 1500);
    } catch (e) {
      console.error('Import failed:', e);
      alert('Không thể đọc file. Vui lòng kiểm tra lại file dự án.');
    }
  }

  _applyProjectData(data) {
    if (data.lyrics) this.lyricsEditor.setLines(data.lyrics);
    if (data.timecodes) this.timecodes = data.timecodes;
    if (data.styles) this.stylePanel.setStyles(data.styles);
    this.timecodeEditor.render();
    this._updateActionBtns();
    if (data.lyrics && data.lyrics.length > 0 && this.videoLoaded) {
      this.timecodeSync.enable();
    }
  }
}
