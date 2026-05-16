/**
 * VideoPlayer - Manages video upload, playback, and controls
 */
export class VideoPlayer {
  constructor(app) {
    this.app = app;
    this.videoEl = document.getElementById('video-player');
    this.uploadZone = document.getElementById('upload-zone');
    this.videoContainer = document.getElementById('video-container');
    this.fileInput = document.getElementById('video-file-input');
    this.btnPlayPause = document.getElementById('btn-play-pause');
    this.iconPlay = this.btnPlayPause.querySelector('.icon-play');
    this.iconPause = this.btnPlayPause.querySelector('.icon-pause');
    this.timeCurrent = document.getElementById('time-current');
    this.timeDuration = document.getElementById('time-duration');
    this.progressContainer = document.getElementById('progress-bar-container');
    this.progressFill = document.getElementById('progress-fill');
    this.progressHandle = document.getElementById('progress-handle');
    this.volumeSlider = document.getElementById('volume-slider');
    this.btnChangeVideo = document.getElementById('btn-change-video');
    this.isPlaying = false;
    this._setupEvents();
  }

  _setupEvents() {
    // Upload zone click & drag
    this.uploadZone.addEventListener('click', () => this.fileInput.click());
    this.uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault(); this.uploadZone.classList.add('dragover');
    });
    this.uploadZone.addEventListener('dragleave', () => this.uploadZone.classList.remove('dragover'));
    this.uploadZone.addEventListener('drop', (e) => {
      e.preventDefault(); this.uploadZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) this.loadFile(file);
    });
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.loadFile(e.target.files[0]);
    });

    // Playback
    this.btnPlayPause.addEventListener('click', () => this.togglePlay());
    this.videoEl.addEventListener('timeupdate', () => this._onTimeUpdate());
    this.videoEl.addEventListener('loadedmetadata', () => this._onMetadataLoaded());
    this.videoEl.addEventListener('ended', () => this._onEnded());
    this.videoEl.addEventListener('play', () => { 
      this.isPlaying = true; 
      this._updatePlayIcon(); 
      if (this.app.audioController) this.app.audioController.play(this.videoEl.currentTime);
    });
    this.videoEl.addEventListener('pause', () => { 
      this.isPlaying = false; 
      this._updatePlayIcon(); 
      if (this.app.audioController) this.app.audioController.pause();
    });
    this.videoEl.addEventListener('seeked', () => {
      if (this.app.audioController) this.app.audioController.seek(this.videoEl.currentTime);
    });

    // Progress seek
    this.progressContainer.addEventListener('click', (e) => this._seekTo(e));
    let dragging = false;
    this.progressContainer.addEventListener('mousedown', () => dragging = true);
    document.addEventListener('mousemove', (e) => { if (dragging) this._seekTo(e); });
    document.addEventListener('mouseup', () => dragging = false);

    // Volume
    this.volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      this.videoEl.volume = vol;
      if (this.app.audioController) this.app.audioController.setVolume(vol);
    });

    // Change video
    this.btnChangeVideo.addEventListener('click', () => this.fileInput.click());
  }

  loadFile(file) {
    this.file = file; // Store reference for MP4 export audio extraction
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = URL.createObjectURL(file);
    this.videoEl.src = this.blobUrl;
    this.videoEl.load();
    this.uploadZone.style.display = 'none';
    this.videoContainer.style.display = 'flex';
    this.app.onVideoLoaded();
  }

  _onMetadataLoaded() {
    this.timeDuration.textContent = this.formatTime(this.videoEl.duration);
    this.app.onVideoMetadataReady();
  }

  _onTimeUpdate() {
    const { currentTime, duration } = this.videoEl;
    if (!duration) return;
    const pct = (currentTime / duration) * 100;
    this.progressFill.style.width = pct + '%';
    this.progressHandle.style.left = `calc(${pct}% - 6px)`;
    this.timeCurrent.textContent = this.formatTime(currentTime);
    this.app.onTimeUpdate(currentTime);
  }

  _onEnded() {
    this.isPlaying = false;
    this._updatePlayIcon();
    this.app.onVideoEnded();
  }

  _updatePlayIcon() {
    this.iconPlay.style.display = this.isPlaying ? 'none' : 'block';
    this.iconPause.style.display = this.isPlaying ? 'block' : 'none';
  }

  _seekTo(e) {
    const rect = this.progressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.videoEl.currentTime = pct * this.videoEl.duration;
  }

  togglePlay() {
    if (this.videoEl.paused) this.videoEl.play();
    else this.videoEl.pause();
  }

  play() { this.videoEl.play(); }
  pause() { this.videoEl.pause(); }
  getCurrentTime() { return this.videoEl.currentTime; }
  getDuration() { return this.videoEl.duration || 0; }
  seek(time) { this.videoEl.currentTime = time; }

  formatTime(s) {
    if (!s || isNaN(s)) return '00:00.000';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 1000);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
  }
}
