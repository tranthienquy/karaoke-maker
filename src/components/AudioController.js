export class AudioController {
  constructor(app) {
    this.app = app;
    this.audioEl = new Audio();
    this.beatFile = null;
    this.beatUrl = null;
    
    // Beat timing parameters
    this.beatOffset = 0;
    this.beatTrimEnd = 0;
    this.beatDuration = 0;
    this.isMutedByTrim = false;
    
    this.btnUpload = document.getElementById('btn-upload-beat');
    this.fileInput = document.getElementById('beat-file-input');
    this.fileNameEl = document.getElementById('beat-file-name');
    this.btnRemove = document.getElementById('btn-remove-beat');
    this.toggleOriginal = document.getElementById('original-audio-toggle');
    
    this.audioEl.addEventListener('loadedmetadata', () => {
      this.beatDuration = this.audioEl.duration;
      // Initialize trimEnd to full duration if not already set by a project load
      if (this.beatTrimEnd === 0) {
        this.beatTrimEnd = this.audioEl.duration;
      }
    });

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

    // We need to continuously check if we have exceeded the trim boundary
    setInterval(() => {
      if (this.app.videoPlayer && this.app.videoPlayer.isPlaying && this.beatFile) {
        const vTime = this.app.videoPlayer.getCurrentTime();
        this._checkTrimBounds(vTime);
      }
    }, 100);
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
    
    if (this.app.audioTimeline) {
      this.app.audioTimeline.loadBeatAudio(file);
    }
    
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
    
    this.beatOffset = 0;
    this.beatTrimEnd = 0;
    this.beatDuration = 0;
    
    this.fileNameEl.textContent = 'Chưa có file beat';
    this.btnRemove.style.display = 'none';
    
    // Turn original audio back on
    this.toggleOriginal.checked = true;
    this._updateVideoMuteState();

    if (this.app.audioTimeline) {
      this.app.audioTimeline.removeBeatAudio();
    }
  }

  setBeatParams(offset, trimEnd, duration) {
    this.beatOffset = offset;
    this.beatTrimEnd = trimEnd;
    this.beatDuration = duration;
    
    if (this.app.videoPlayer && this.app.videoPlayer.isPlaying) {
      this.seek(this.app.videoPlayer.getCurrentTime());
    }
  }

  _updateVideoMuteState() {
    if (this.app.videoPlayer && this.app.videoPlayer.videoEl) {
      this.app.videoPlayer.videoEl.muted = !this.toggleOriginal.checked;
    }
  }

  _checkTrimBounds(vTime) {
    if (!this.beatFile) return;
    
    // If video time is outside [beatOffset, beatOffset + beatTrimEnd], pause the beat
    if (vTime < this.beatOffset || vTime >= this.beatOffset + this.beatTrimEnd) {
      if (!this.audioEl.paused) {
        this.audioEl.pause();
        this.isMutedByTrim = true;
      }
    } else {
      if (this.audioEl.paused && this.app.videoPlayer.isPlaying) {
        this.audioEl.currentTime = vTime - this.beatOffset;
        this.audioEl.play().catch(e => console.warn('Audio play failed:', e));
        this.isMutedByTrim = false;
      }
    }
  }

  // Sync methods called by VideoPlayer
  play(vTime) {
    if (!this.beatFile) return;
    
    if (vTime < this.beatOffset || vTime >= this.beatOffset + this.beatTrimEnd) {
      this.audioEl.pause();
      return;
    }
    
    const targetBeatTime = vTime - this.beatOffset;
    if (Math.abs(this.audioEl.currentTime - targetBeatTime) > 0.1) {
      this.audioEl.currentTime = targetBeatTime;
    }
    this.audioEl.play().catch(e => console.warn('Audio play failed:', e));
  }

  pause() {
    if (!this.beatFile) return;
    this.audioEl.pause();
  }

  seek(vTime) {
    if (!this.beatFile) return;
    
    if (vTime < this.beatOffset || vTime >= this.beatOffset + this.beatTrimEnd) {
      this.audioEl.pause();
    } else {
      const targetBeatTime = vTime - this.beatOffset;
      this.audioEl.currentTime = targetBeatTime;
      if (this.app.videoPlayer.isPlaying) {
        this.audioEl.play().catch(e => console.warn('Audio play failed:', e));
      }
    }
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
