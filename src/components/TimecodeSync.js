/**
 * TimecodeSync - Spacebar-driven timecode creation with glow effects
 */
export class TimecodeSync {
  constructor(app) {
    this.app = app;
    this.btnSync = document.getElementById('btn-start-sync');
    this.overlay = document.getElementById('sync-overlay');
    this.currentLineEl = document.getElementById('sync-current-line');
    this.nextLineEl = document.getElementById('sync-next-line');
    this.progressTextEl = document.getElementById('sync-progress-text');
    this.flashEl = document.getElementById('sync-flash');
    this.hintEl = document.getElementById('sync-hint');
    this.isSyncing = false;
    this.currentIndex = 0;
    this._boundKeyHandler = this._onKeyDown.bind(this);
    this._setupEvents();
  }

  _setupEvents() {
    this.btnSync.addEventListener('click', () => this._toggleSync());
  }

  _toggleSync() {
    if (this.isSyncing) {
      this._stopSync();
    } else {
      this._startSync();
    }
  }

  _startSync() {
    const lines = this.app.getLyrics();
    if (lines.length === 0) return;
    if (!this.app.videoPlayer.getDuration()) return;

    this.isSyncing = true;
    this.currentIndex = 0;
    this.app.timecodes = lines.map((text, i) => ({
      index: i, text, start: null, end: null,
    }));

    // UI
    this.btnSync.textContent = '⏹ Dừng Sync';
    this.btnSync.classList.add('syncing');
    this.overlay.style.display = 'flex';

    // Render the timecode list and switch to timecode tab
    this.app.timecodeEditor.render();
    this._updateSyncDisplay();

    // Start video
    this.app.videoPlayer.seek(0);
    this.app.videoPlayer.play();

    // Listen for spacebar
    document.addEventListener('keydown', this._boundKeyHandler);
  }

  _stopSync() {
    this.isSyncing = false;
    this.overlay.style.display = 'none';
    this.btnSync.textContent = '⏱ Bắt đầu Sync';
    this.btnSync.classList.remove('syncing');
    document.removeEventListener('keydown', this._boundKeyHandler);
    this.app.videoPlayer.pause();

    // Clear sync glow highlights
    this.app.timecodeEditor.clearSyncHighlights();
    this.app.onTimecodesChanged();
  }

  _onKeyDown(e) {
    if (e.code === 'Escape') {
      this._stopSync();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this._markTimecode();
    }
  }

  _markTimecode() {
    const time = this.app.videoPlayer.getCurrentTime();
    const tc = this.app.timecodes;

    // Set start of current line
    if (this.currentIndex < tc.length) {
      tc[this.currentIndex].start = time;
      // Set end of previous line
      if (this.currentIndex > 0 && tc[this.currentIndex - 1].end === null) {
        tc[this.currentIndex - 1].end = time;
      }
      this.currentIndex++;
    }

    // Flash
    this.flashEl.classList.add('active');
    setTimeout(() => this.flashEl.classList.remove('active'), 150);

    // Re-render timecodes to show values and update glow
    this.app.timecodeEditor.render();

    // Check if done
    if (this.currentIndex >= tc.length) {
      // Set end of last line
      tc[tc.length - 1].end = Math.min(time + 3, this.app.videoPlayer.getDuration());
      this.app.timecodeEditor.render();
      this._stopSync();
      return;
    }

    // Highlight current sync row with glow
    this.app.timecodeEditor.highlightSyncRow(this.currentIndex);
    this._updateSyncDisplay();
  }

  _updateSyncDisplay() {
    const tc = this.app.timecodes;
    const lines = this.app.getLyrics();
    this.currentLineEl.textContent = lines[this.currentIndex] || '';
    this.nextLineEl.textContent = this.currentIndex + 1 < lines.length
      ? `Tiếp: ${lines[this.currentIndex + 1]}` : '';
    this.progressTextEl.textContent = `Dòng ${this.currentIndex + 1} / ${lines.length}`;

    // Also highlight the row in the timecode editor
    this.app.timecodeEditor.highlightSyncRow(this.currentIndex);
  }

  enable() { this.btnSync.disabled = false; }
  disable() { this.btnSync.disabled = true; }
}
