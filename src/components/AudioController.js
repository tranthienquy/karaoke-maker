export class AudioController {
  constructor(app) {
    this.app = app;
    this.audioEl = new Audio();
    this.beatFile = null;
    this.beatUrl = null;
    
    this.btnUpload = document.getElementById('btn-upload-beat');
    this.fileInput = document.getElementById('beat-file-input');
    this.fileNameEl = document.getElementById('beat-file-name');
    this.btnRemove = document.getElementById('btn-remove-beat');
    this.toggleOriginal = document.getElementById('original-audio-toggle');
    
    this._setupEvents();
  }

  _setupEvents() {
    this.btnUpload.addEventListener('click', () => this.fileInput.click());
    
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) this.loadBeat(file);
      e.target.value = '';
    });
    
    this.btnRemove.addEventListener('click', () => this.removeBeat());
    
    this.toggleOriginal.addEventListener('change', () => {
      this._updateVideoMuteState();
    });
  }

  loadBeat(file) {
    this.removeBeat(); // Clean up existing
    
    this.beatFile = file;
    this.beatUrl = URL.createObjectURL(file);
    this.audioEl.src = this.beatUrl;
    this.audioEl.load();
    
    this.fileNameEl.textContent = file.name;
    this.btnRemove.style.display = 'inline-flex';
    
    // Automatically turn off original audio when beat is loaded to avoid mixing noise during preview
    this.toggleOriginal.checked = false;
    this._updateVideoMuteState();
    
    // Sync immediately if video is playing
    if (this.app.videoPlayer && this.app.videoPlayer.isPlaying) {
      this.play(this.app.videoPlayer.getCurrentTime());
    }
  }

  removeBeat() {
    if (this.beatUrl) {
      URL.revokeObjectURL(this.beatUrl);
      this.beatUrl = null;
    }
    this.beatFile = null;
    this.audioEl.pause();
    this.audioEl.src = '';
    
    this.fileNameEl.textContent = 'Chưa có file beat';
    this.btnRemove.style.display = 'none';
    
    // Turn original audio back on
    this.toggleOriginal.checked = true;
    this._updateVideoMuteState();
  }

  _updateVideoMuteState() {
    if (this.app.videoPlayer && this.app.videoPlayer.videoEl) {
      // If toggle is checked -> original audio is ON -> video is NOT muted.
      // If toggle is unchecked -> original audio is OFF -> video IS muted.
      this.app.videoPlayer.videoEl.muted = !this.toggleOriginal.checked;
    }
  }

  // Sync methods called by VideoPlayer
  play(time) {
    if (!this.beatFile) return;
    if (time !== undefined && Math.abs(this.audioEl.currentTime - time) > 0.1) {
      this.audioEl.currentTime = time;
    }
    this.audioEl.play().catch(e => console.warn('Audio play failed:', e));
  }

  pause() {
    if (!this.beatFile) return;
    this.audioEl.pause();
  }

  seek(time) {
    if (!this.beatFile) return;
    this.audioEl.currentTime = time;
  }
  
  setVolume(volume) {
    this.audioEl.volume = volume;
  }

  hasBeat() {
    return this.beatFile !== null;
  }

  getBeatFile() {
    return this.beatFile;
  }

  isOriginalAudioEnabled() {
    return this.toggleOriginal.checked;
  }
}
