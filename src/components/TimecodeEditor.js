/**
 * TimecodeEditor - Manual timecode editing UI with download support
 */
export class TimecodeEditor {
  constructor(app) {
    this.app = app;
    this.listEl = document.getElementById('timecode-list');
    this.emptyEl = document.getElementById('timecode-empty');
    this.actionsEl = document.getElementById('timecode-actions');
    this.markersEl = document.getElementById('timecode-markers');
    this.btnReset = document.getElementById('btn-reset-timecodes');
    this._setupEvents();
  }

  _setupEvents() {
    this.btnReset.addEventListener('click', () => {
      this.app.timecodes.forEach(tc => { tc.start = null; tc.end = null; });
      this.render();
      this.app.onTimecodesChanged();
    });

    // Download buttons
    document.getElementById('btn-download-lrc').addEventListener('click', () => this._downloadLRC());
    document.getElementById('btn-download-srt').addEventListener('click', () => this._downloadSRT());
    document.getElementById('btn-download-json').addEventListener('click', () => this._downloadJSON());
  }

  render() {
    const tc = this.app.timecodes;
    if (!tc || tc.length === 0) {
      this.emptyEl.style.display = 'block';
      this.actionsEl.style.display = 'none';
      this.listEl.innerHTML = '';
      this.listEl.appendChild(this.emptyEl);
      this._renderMarkers();
      return;
    }

    this.emptyEl.style.display = 'none';
    this.actionsEl.style.display = 'flex';

    // Build rows
    let html = '';
    tc.forEach((item, i) => {
      const startVal = item.start !== null ? this._formatTC(item.start) : '--:--.---';
      const endVal = item.end !== null ? this._formatTC(item.end) : '--:--.---';
      const startClass = item.start === null ? 'unset' : '';
      const endClass = item.end === null ? 'unset' : '';
      html += `<div class="tc-row" data-index="${i}">
        <span class="tc-num">${i + 1}</span>
        <span class="tc-text" title="${this._esc(item.text)}">${this._esc(item.text)}</span>
        <input class="tc-time-input ${startClass}" type="text" value="${startVal}" data-field="start" data-index="${i}" />
        <input class="tc-time-input ${endClass}" type="text" value="${endVal}" data-field="end" data-index="${i}" />
        <div class="tc-actions">
          <button class="tc-jump" data-index="${i}" title="Nhảy đến">▶</button>
          <button class="tc-delete" data-index="${i}" title="Xóa timecode">✕</button>
        </div>
      </div>`;
    });
    this.listEl.innerHTML = html;

    // Events on inputs
    this.listEl.querySelectorAll('.tc-time-input').forEach(input => {
      input.addEventListener('change', (e) => this._onTimeChange(e));
    });
    this.listEl.querySelectorAll('.tc-jump').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const t = this.app.timecodes[idx]?.start;
        if (t !== null) this.app.videoPlayer.seek(t);
      });
    });
    this.listEl.querySelectorAll('.tc-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.index);
        this.app.timecodes[idx].start = null;
        this.app.timecodes[idx].end = null;
        this.render();
        this.app.onTimecodesChanged();
      });
    });

    this._renderMarkers();
  }

  _onTimeChange(e) {
    const idx = parseInt(e.target.dataset.index);
    const field = e.target.dataset.field;
    const val = this._parseTC(e.target.value);
    if (val !== null) {
      this.app.timecodes[idx][field] = val;
      e.target.classList.remove('unset');
      this.app.onTimecodesChanged();
      this._renderMarkers();
    } else {
      e.target.value = this.app.timecodes[idx][field] !== null
        ? this._formatTC(this.app.timecodes[idx][field]) : '--:--.---';
    }
  }

  highlightRow(index) {
    this.listEl.querySelectorAll('.tc-row').forEach((row, i) => {
      row.classList.toggle('active', i === index);
    });
  }

  /**
   * Highlight a row during sync with glow effect + mark previous as done
   */
  highlightSyncRow(index) {
    const rows = this.listEl.querySelectorAll('.tc-row');
    rows.forEach((row, i) => {
      row.classList.remove('syncing-glow', 'active');
      if (i < index) {
        row.classList.add('sync-done');
      } else if (i === index) {
        row.classList.add('syncing-glow');
      } else {
        row.classList.remove('sync-done');
      }
    });

    // Auto-scroll the active row into view
    const activeRow = rows[index];
    if (activeRow) {
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Clear all sync glow classes
   */
  clearSyncHighlights() {
    this.listEl.querySelectorAll('.tc-row').forEach(row => {
      row.classList.remove('syncing-glow', 'sync-done');
    });
  }

  _renderMarkers() {
    const duration = this.app.videoPlayer.getDuration();
    if (!duration) { this.markersEl.innerHTML = ''; return; }
    let html = '';
    (this.app.timecodes || []).forEach(tc => {
      if (tc.start !== null) {
        const pct = (tc.start / duration) * 100;
        html += `<div class="tc-marker" style="left:${pct}%"></div>`;
      }
    });
    this.markersEl.innerHTML = html;
  }

  // ===== Timecode Download Methods =====

  _downloadLRC() {
    const tc = this.app.timecodes;
    if (!tc || tc.length === 0) return;

    let lrc = '[ti:Karaoke]\n[ar:Unknown]\n[by:Karaoke Maker]\n\n';
    tc.forEach(item => {
      if (item.start !== null) {
        const m = Math.floor(item.start / 60);
        const s = (item.start % 60).toFixed(2);
        lrc += `[${String(m).padStart(2,'0')}:${s.padStart(5,'0')}]${item.text}\n`;
      }
    });

    this._downloadFile(lrc, 'karaoke-timecode.lrc', 'text/plain');
  }

  _downloadSRT() {
    const tc = this.app.timecodes;
    if (!tc || tc.length === 0) return;

    let srt = '';
    let idx = 1;
    tc.forEach(item => {
      if (item.start !== null && item.end !== null) {
        srt += `${idx}\n`;
        srt += `${this._formatSRTTime(item.start)} --> ${this._formatSRTTime(item.end)}\n`;
        srt += `${item.text}\n\n`;
        idx++;
      }
    });

    this._downloadFile(srt, 'karaoke-timecode.srt', 'text/plain');
  }

  _downloadJSON() {
    const tc = this.app.timecodes;
    if (!tc || tc.length === 0) return;

    const data = tc.map(item => ({
      index: item.index,
      text: item.text,
      start: item.start,
      end: item.end,
      startFormatted: item.start !== null ? this._formatTC(item.start) : null,
      endFormatted: item.end !== null ? this._formatTC(item.end) : null,
    }));

    this._downloadFile(JSON.stringify(data, null, 2), 'karaoke-timecode.json', 'application/json');
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  _formatSRTTime(s) {
    if (s === null || isNaN(s)) return '00:00:00,000';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  }

  _formatTC(s) {
    if (s === null || isNaN(s)) return '--:--.---';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  }

  _parseTC(str) {
    const match = str.match(/^(\d{1,2}):(\d{2})\.(\d{1,3})$/);
    if (!match) return null;
    return parseInt(match[1]) * 60 + parseInt(match[2]) + parseInt(match[3]) / 1000;
  }

  _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
