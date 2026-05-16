/**
 * AudioTimeline - UI for displaying and interacting with audio waveforms
 */
export class AudioTimeline {
  constructor(app) {
    this.app = app;
    this.container = document.getElementById('audio-timeline-container');
    this.scrollArea = document.getElementById('timeline-scroll-area');
    this.playhead = document.getElementById('timeline-playhead');
    
    this.originalCanvas = document.getElementById('original-waveform-canvas');
    this.beatCanvas = document.getElementById('beat-waveform-canvas');
    this.beatClip = document.getElementById('beat-clip');
    this.rightHandle = document.getElementById('beat-right-handle');
    
    this.offsetInfo = document.getElementById('beat-offset-info');
    this.trimInfo = document.getElementById('beat-trim-info');
    
    this.btnZoomIn = document.getElementById('btn-timeline-zoom-in');
    this.btnZoomOut = document.getElementById('btn-timeline-zoom-out');
    
    this.pixelsPerSecond = 50; // Zoom level
    this.duration = 0; // Total video duration
    
    this.beatOffset = 0;
    this.beatDuration = 0; // Total original length of beat
    this.beatTrimEnd = 0; // Length after trim
    
    this.isDraggingClip = false;
    this.isDraggingHandle = false;
    
    this._setupEvents();
  }
  
  _setupEvents() {
    // Zoom
    this.btnZoomIn.addEventListener('click', () => { this.pixelsPerSecond *= 1.2; this.render(); });
    this.btnZoomOut.addEventListener('click', () => { this.pixelsPerSecond /= 1.2; this.render(); });
    
    // Dragging clip (Offset)
    let startX = 0;
    let startOffset = 0;
    this.beatClip.addEventListener('mousedown', (e) => {
      if (e.target === this.rightHandle) return;
      this.isDraggingClip = true;
      startX = e.clientX;
      startOffset = this.beatOffset;
      e.stopPropagation();
    });
    
    // Dragging handle (Trim)
    let startTrimWidth = 0;
    this.rightHandle.addEventListener('mousedown', (e) => {
      this.isDraggingHandle = true;
      startX = e.clientX;
      startTrimWidth = this.beatTrimEnd;
      e.stopPropagation();
    });
    
    window.addEventListener('mousemove', (e) => {
      if (this.isDraggingClip) {
        const dx = e.clientX - startX;
        const dt = dx / this.pixelsPerSecond;
        this.beatOffset = Math.max(0, startOffset + dt);
        if (this.app.audioController) this.app.audioController.setBeatParams(this.beatOffset, this.beatTrimEnd, this.beatDuration);
        this.renderClip();
      } else if (this.isDraggingHandle) {
        const dx = e.clientX - startX;
        const dt = dx / this.pixelsPerSecond;
        this.beatTrimEnd = Math.max(0.1, Math.min(this.beatDuration, startTrimWidth + dt));
        if (this.app.audioController) this.app.audioController.setBeatParams(this.beatOffset, this.beatTrimEnd, this.beatDuration);
        this.renderClip();
      }
    });
    
    window.addEventListener('mouseup', () => {
      this.isDraggingClip = false;
      this.isDraggingHandle = false;
    });

    // Sync playhead click
    this.scrollArea.addEventListener('click', (e) => {
      if (e.target.closest('.timeline-controls') || e.target.closest('.beat-handle') || this.isDraggingClip || this.isDraggingHandle) return;
      if (!this.duration) return;
      const rect = this.scrollArea.getBoundingClientRect();
      const clickX = e.clientX - rect.left + this.scrollArea.scrollLeft;
      const time = clickX / this.pixelsPerSecond;
      if (time <= this.duration && this.app.videoPlayer) {
        this.app.videoPlayer.seek(time);
      }
    });
  }
  
  show() {
    this.container.style.display = 'flex';
  }
  
  setDuration(dur) {
    this.duration = dur;
    this.render();
  }
  
  updatePlayhead(time) {
    if (!this.duration) return;
    const x = time * this.pixelsPerSecond;
    this.playhead.style.transform = `translateX(${x}px)`;
    // Auto-scroll if playing
    if (this.app.videoPlayer && this.app.videoPlayer.isPlaying) {
      if (x > this.scrollArea.scrollLeft + this.scrollArea.clientWidth * 0.8) {
        this.scrollArea.scrollLeft = x - this.scrollArea.clientWidth * 0.2;
      }
    }
  }
  
  async loadOriginalAudio(file) {
    this.show();
    this.originalCanvas._peaks = null;
    this.render(); // Clear
    const audioBuffer = await this._decodeAudio(file);
    if (audioBuffer) {
      this._drawWaveform(audioBuffer, this.originalCanvas, '#666');
    }
  }
  
  async loadBeatAudio(file) {
    this.show();
    this.beatClip.style.display = 'block';
    this.beatCanvas._peaks = null;
    const audioBuffer = await this._decodeAudio(file);
    if (audioBuffer) {
      this.beatDuration = audioBuffer.duration;
      this.beatOffset = 0;
      this.beatTrimEnd = this.beatDuration;
      if (this.app.audioController) {
        this.app.audioController.setBeatParams(this.beatOffset, this.beatTrimEnd, this.beatDuration);
      }
      this._drawWaveform(audioBuffer, this.beatCanvas, '#00e5ff');
      this.renderClip();
    }
  }
  
  removeBeatAudio() {
    this.beatClip.style.display = 'none';
    this.beatOffset = 0;
    this.beatDuration = 0;
    this.beatTrimEnd = 0;
    this.beatCanvas._peaks = null;
    const ctx = this.beatCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.beatCanvas.width, this.beatCanvas.height);
    if (this.app.audioController) {
      this.app.audioController.setBeatParams(0, 0, 0);
    }
  }
  
  async _decodeAudio(file) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      // Using 1 channel and lower sample rate for faster decoding just for UI
      const offlineCtx = new OfflineAudioContext(1, 1, 22050); 
      return await offlineCtx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn('Timeline audio decode failed:', e);
      return null;
    }
  }
  
  _drawWaveform(audioBuffer, canvas, color) {
    const rawData = audioBuffer.getChannelData(0);
    const samples = 2000; // Enough detail for zooming
    const blockSize = Math.floor(rawData.length / samples);
    const peaks = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      let max = 0;
      for (let j = 0; j < blockSize; j++) {
        const val = Math.abs(rawData[i * blockSize + j]);
        if (val > max) max = val;
      }
      peaks[i] = max;
    }
    
    canvas._peaks = peaks;
    canvas._color = color;
    canvas._duration = audioBuffer.duration;
    this.render();
  }
  
  render() {
    if (!this.duration) return;
    const totalWidth = Math.max(this.scrollArea.clientWidth, this.duration * this.pixelsPerSecond);
    
    const origTrackContent = document.querySelector('.original-track .track-content');
    if (origTrackContent) origTrackContent.style.width = `${totalWidth}px`;
    
    this._renderCanvas(this.originalCanvas, totalWidth);
    this.renderClip();
  }
  
  _renderCanvas(canvas, width) {
    if (!canvas._peaks) return;
    const h = 52; // Height inside track
    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, width, h);
    ctx.fillStyle = canvas._color;
    
    const drawWidth = canvas._duration * this.pixelsPerSecond;
    const peaks = canvas._peaks;
    const step = drawWidth / peaks.length;
    
    ctx.beginPath();
    ctx.moveTo(0, h/2);
    for (let i = 0; i < peaks.length; i++) {
      const x = i * step;
      const y = peaks[i] * (h / 2);
      ctx.lineTo(x, (h/2) - y);
      ctx.lineTo(x + step, (h/2) - y);
    }
    for (let i = peaks.length - 1; i >= 0; i--) {
      const x = i * step;
      const y = peaks[i] * (h / 2);
      ctx.lineTo(x + step, (h/2) + y);
      ctx.lineTo(x, (h/2) + y);
    }
    ctx.fill();
  }
  
  renderClip() {
    if (!this.beatDuration) return;
    
    const leftPx = this.beatOffset * this.pixelsPerSecond;
    const widthPx = this.beatTrimEnd * this.pixelsPerSecond;
    
    this.beatClip.style.left = `${leftPx}px`;
    this.beatClip.style.width = `${widthPx}px`;
    
    // Canvas inside the clip must be full width of the beat
    const fullWidth = this.beatDuration * this.pixelsPerSecond;
    this._renderCanvas(this.beatCanvas, fullWidth);
    
    this.offsetInfo.textContent = `Offset: ${this.beatOffset.toFixed(3)}s`;
    this.trimInfo.textContent = `Trim: ${this.beatTrimEnd.toFixed(3)}s / ${this.beatDuration.toFixed(3)}s`;
  }
}
