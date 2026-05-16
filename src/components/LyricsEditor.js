/**
 * LyricsEditor - Manages lyrics text input and line parsing
 */
export class LyricsEditor {
  constructor(app) {
    this.app = app;
    this.textarea = document.getElementById('lyrics-textarea');
    this.countEl = document.getElementById('lyrics-count');
    this.btnClear = document.getElementById('btn-clear-lyrics');
    this.lines = [];
    this._setupEvents();
  }

  _setupEvents() {
    this.textarea.addEventListener('input', () => this._onInput());
    this.btnClear.addEventListener('click', () => {
      this.textarea.value = '';
      this._onInput();
    });
  }

  _onInput() {
    this.lines = this.textarea.value
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);
    this.countEl.textContent = `${this.lines.length} dòng`;
    this.app.onLyricsChanged(this.lines);
  }

  getLines() { return this.lines; }

  setLines(lines) {
    this.lines = lines;
    this.textarea.value = lines.join('\n');
    this.countEl.textContent = `${this.lines.length} dòng`;
  }
}
