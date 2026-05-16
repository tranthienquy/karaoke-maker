/**
 * VideoExporter - Export karaoke video as proper MP4 (H.264 + AAC)
 * Uses WebCodecs API + mp4-muxer for reliable, playable MP4 files.
 */
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const isBreakText = (text) => {
  if (!text) return true;
  const t = text.trim().toUpperCase();
  return t === 'BREAK' || t === '[BREAK]' || t === '';
};

const RESOLUTIONS = {
  original: null,
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
    this.doneActionsEl = document.getElementById('export-done-actions');
    this.cancelBtn = document.getElementById('btn-cancel-export');
    this.cancelled = false;
    this._selectedRes = '2k';
    this._selectedFps = 60;
    this._exportedBlob = null;
    this._exportedName = '';
    this._setupEvents();
  }

  _setupEvents() {
    document.querySelectorAll('.quality-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._selectedRes = btn.dataset.res;
      });
    });
    document.getElementById('btn-cancel-settings').addEventListener('click', () => {
      this.modal.style.display = 'none';
    });
    document.getElementById('btn-start-export').addEventListener('click', () => {
      this._selectedFps = parseInt(document.getElementById('export-fps').value);
      this._beginExport();
    });
    document.getElementById('btn-cancel-export').addEventListener('click', () => this.cancel());
    document.getElementById('btn-save-video').addEventListener('click', () => this._triggerSave());
    document.getElementById('btn-close-export').addEventListener('click', () => {
      this.modal.style.display = 'none';
    });
  }

  start() {
    const video = this.app.videoPlayer.videoEl;
    const origDesc = document.getElementById('quality-desc-original');
    if (video.videoWidth) origDesc.textContent = `${video.videoWidth} × ${video.videoHeight}`;
    const formatBadge = document.querySelector('.format-badge');
    if (formatBadge) {
      formatBadge.textContent = (typeof VideoEncoder !== 'undefined')
        ? '📦 Định dạng: MP4 (H.264 + AAC)' : '📦 Định dạng: WebM (VP9)';
    }
    this.settingsEl.style.display = '';
    this.progressEl.style.display = 'none';
    this.modal.style.display = 'flex';
  }

  async _beginExport() {
    this.cancelled = false;
    this._exportedBlob = null;
    this.settingsEl.style.display = 'none';
    this.progressEl.style.display = '';
    this.doneActionsEl.style.display = 'none';
    this.cancelBtn.style.display = '';
    this.statusEl.textContent = 'Đang chuẩn bị...';
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '0%';

    const video = this.app.videoPlayer.videoEl;
    const duration = video.duration;
    const nativeW = video.videoWidth || 1920;
    const nativeH = video.videoHeight || 1080;
    const resCfg = RESOLUTIONS[this._selectedRes];
    const exportW = resCfg ? resCfg.w : nativeW;
    const exportH = resCfg ? resCfg.h : nativeH;
    const fps = this._selectedFps;
    const bitrate = BITRATES[this._selectedRes] || 25_000_000;

    this.resInfoEl.textContent = `${exportW} × ${exportH} @ ${fps}fps • ${(bitrate / 1_000_000).toFixed(0)} Mbps`;
    this._exportedName = `karaoke-${exportW}x${exportH}.mp4`;

    try {
      if (typeof VideoEncoder !== 'undefined') {
        await this._exportMP4(video, exportW, exportH, fps, bitrate, duration);
      } else {
        this._exportedName = `karaoke-${exportW}x${exportH}.webm`;
        await this._exportWebM(video, exportW, exportH, fps, bitrate, duration);
      }
    } catch (err) {
      console.error('Export error:', err);
      this.statusEl.textContent = `❌ Lỗi: ${err.message}`;
    }
  }

  _seekTo(video, time) {
    return new Promise((resolve) => {
      if (Math.abs(video.currentTime - time) < 0.01) { resolve(); return; }
      const handler = () => { video.removeEventListener('seeked', handler); resolve(); };
      video.addEventListener('seeked', handler);
      video.currentTime = time;
    });
  }

  // ===== MP4 Export =====
  async _exportMP4(video, exportW, exportH, fps, bitrate, duration) {
    // 1) Find supported H.264 codec
    this.statusEl.textContent = 'Đang kiểm tra codec...';
    const codecs = ['avc1.640028', 'avc1.4d0028', 'avc1.42001f', 'avc1.420034'];
    let videoCodec = null;
    for (const c of codecs) {
      try {
        const s = await VideoEncoder.isConfigSupported({ codec: c, width: exportW, height: exportH, bitrate, framerate: fps });
        if (s.supported) { videoCodec = c; break; }
      } catch (e) { /* next */ }
    }
    if (!videoCodec) throw new Error('H.264 không được hỗ trợ.');

    // 2) Decode audio using OfflineAudioContext (more reliable than AudioContext)
    this.statusEl.textContent = 'Đang giải mã audio...';
    
    let origBuffer = null;
    let beatBuffer = null;
    const dummyCtx = new OfflineAudioContext(1, 1, 44100);

    if (!this.app.audioController || this.app.audioController.isOriginalAudioEnabled()) {
      try {
        const bytes = await this.app.videoPlayer.file.arrayBuffer();
        origBuffer = await dummyCtx.decodeAudioData(bytes);
      } catch (e) { console.warn('Original audio decode failed', e); }
    }

    if (this.app.audioController && this.app.audioController.hasBeat()) {
      try {
        const bytes = await this.app.audioController.getBeatFile().arrayBuffer();
        beatBuffer = await dummyCtx.decodeAudioData(bytes);
      } catch (e) { console.warn('Beat audio decode failed', e); }
    }

    let audioBuffer = null;
    let audioSampleRate = 44100;
    let audioChannels = 2;

    if (origBuffer || beatBuffer) {
      try {
        const targetFrames = Math.ceil(duration * audioSampleRate);
        const mixCtx = new OfflineAudioContext(audioChannels, targetFrames, audioSampleRate);
        
        if (origBuffer) {
          const src = mixCtx.createBufferSource();
          src.buffer = origBuffer;
          src.connect(mixCtx.destination);
          src.start(0);
        }
        
        if (beatBuffer) {
          const src = mixCtx.createBufferSource();
          src.buffer = beatBuffer;
          src.connect(mixCtx.destination);
          
          const offset = this.app.audioController.beatOffset || 0;
          const trimEnd = this.app.audioController.beatTrimEnd || beatBuffer.duration;
          
          src.start(offset, 0, trimEnd);
        }
        
        audioBuffer = await mixCtx.startRendering();
        console.log(`Audio mixed: ${audioSampleRate}Hz, ${audioChannels}ch, ${audioBuffer.length} samples, ${audioBuffer.duration.toFixed(2)}s`);
      } catch (e) {
        console.warn('Audio mixing failed:', e);
        audioBuffer = null;
      }
    }

    // 3) Check if AAC encoding is supported
    let canEncodeAAC = false;
    if (audioBuffer && typeof AudioEncoder !== 'undefined') {
      try {
        const aacCheck = await AudioEncoder.isConfigSupported({
          codec: 'mp4a.40.2', numberOfChannels: audioChannels, sampleRate: audioSampleRate, bitrate: 128000,
        });
        canEncodeAAC = aacCheck.supported;
        console.log(`AAC encoding supported: ${canEncodeAAC}`);
      } catch (e) {
        console.warn('AAC check failed:', e);
      }
    }

    // 4) Setup muxer
    const target = new ArrayBufferTarget();
    const muxerOpts = {
      target,
      video: { codec: 'avc', width: exportW, height: exportH },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    };
    if (canEncodeAAC) {
      muxerOpts.audio = { codec: 'aac', numberOfChannels: audioChannels, sampleRate: audioSampleRate };
    }
    const muxer = new Muxer(muxerOpts);

    // 5) Video encoder
    let vError = null;
    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (e) => { vError = e; },
    });
    videoEncoder.configure({ codec: videoCodec, width: exportW, height: exportH, bitrate, framerate: fps });
    await new Promise(r => setTimeout(r, 50));
    if (videoEncoder.state !== 'configured') throw new Error('VideoEncoder init fail');

    // 6) Audio encoder
    let audioEncoder = null;
    if (canEncodeAAC) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => console.error('AudioEncoder error:', e),
      });
      audioEncoder.configure({
        codec: 'mp4a.40.2', numberOfChannels: audioChannels,
        sampleRate: audioSampleRate, bitrate: 128000,
      });
      await new Promise(r => setTimeout(r, 30));
      if (audioEncoder.state !== 'configured') {
        console.warn('AudioEncoder failed to configure, skipping audio');
        audioEncoder = null;
      }
    }

    // 7) Canvas
    const canvas = document.createElement('canvas');
    canvas.width = exportW; canvas.height = exportH;
    const ctx = canvas.getContext('2d');

    // 8) Encode video frames
    this.statusEl.textContent = `Đang xuất video ${exportW}×${exportH}...`;
    video.muted = true; video.pause();
    await this._seekTo(video, 0);
    const totalFrames = Math.ceil(duration * fps);

    for (let i = 0; i < totalFrames; i++) {
      if (this.cancelled || vError) break;
      const t = i / fps;
      if (t > duration) break;
      if (videoEncoder.state !== 'configured') throw new Error('VideoEncoder closed');

      await this._seekTo(video, t);
      ctx.drawImage(video, 0, 0, exportW, exportH);
      this._drawKaraoke(ctx, exportW, exportH, t);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(t * 1_000_000),
        duration: Math.round(1_000_000 / fps),
      });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      const pct = Math.min(80, ((i + 1) / totalFrames) * 80);
      this.progressFill.style.width = pct + '%';
      this.progressText.textContent = Math.round(pct) + '%';

      if (i % 3 === 0) {
        await new Promise(r => setTimeout(r, 0));
        while (videoEncoder.encodeQueueSize > 10) await new Promise(r => setTimeout(r, 10));
      }
    }

    if (this.cancelled) { video.muted = false; this.modal.style.display = 'none'; return; }
    if (vError) throw vError;

    // Flush video
    this.statusEl.textContent = 'Đang xử lý video...';
    this.progressFill.style.width = '82%';
    await videoEncoder.flush();
    videoEncoder.close();

    // 9) Encode audio using s16 interleaved format (most compatible)
    if (audioEncoder && audioBuffer && audioEncoder.state === 'configured') {
      this.statusEl.textContent = 'Đang mã hóa audio...';
      const sr = audioSampleRate;
      const nCh = audioChannels;
      const CHUNK = 1024;
      const totalSamples = audioBuffer.length;
      const totalChunks = Math.ceil(totalSamples / CHUNK);
      let done = 0;

      // Pre-extract all channel data for performance
      const channelArrays = [];
      for (let ch = 0; ch < nCh; ch++) {
        channelArrays.push(audioBuffer.getChannelData(ch));
      }

      for (let offset = 0; offset < totalSamples; offset += CHUNK) {
        if (this.cancelled) break;
        const len = Math.min(CHUNK, totalSamples - offset);

        // Build interleaved s16 buffer: [L0, R0, L1, R1, L2, R2, ...]
        const interleavedS16 = new Int16Array(len * nCh);
        for (let i = 0; i < len; i++) {
          for (let ch = 0; ch < nCh; ch++) {
            const floatSample = channelArrays[ch][offset + i];
            // Clamp and convert float [-1, 1] to int16 [-32768, 32767]
            const clamped = Math.max(-1, Math.min(1, floatSample));
            interleavedS16[i * nCh + ch] = (clamped < 0) ? clamped * 32768 : clamped * 32767;
          }
        }

        const audioData = new AudioData({
          format: 's16',
          sampleRate: sr,
          numberOfFrames: len,
          numberOfChannels: nCh,
          timestamp: Math.round((offset / sr) * 1_000_000),
          data: interleavedS16,
        });
        audioEncoder.encode(audioData);
        audioData.close();
        done++;

        if (done % 200 === 0) {
          const aPct = 82 + (done / totalChunks) * 16;
          this.progressFill.style.width = Math.round(aPct) + '%';
          this.progressText.textContent = Math.round(aPct) + '%';
          await new Promise(r => setTimeout(r, 0));
          while (audioEncoder.encodeQueueSize > 50) await new Promise(r => setTimeout(r, 5));
        }
      }

      this.statusEl.textContent = 'Đang hoàn tất audio...';
      await audioEncoder.flush();
      audioEncoder.close();
    }

    // 10) Finalize
    this.statusEl.textContent = 'Đang hoàn tất MP4...';
    this.progressFill.style.width = '99%';
    muxer.finalize();
    video.muted = false;
    if (this.cancelled) { this.modal.style.display = 'none'; return; }

    this._exportedBlob = new Blob([target.buffer], { type: 'video/mp4' });
    const sizeMB = (this._exportedBlob.size / (1024 * 1024)).toFixed(1);
    this.statusEl.textContent = `✅ Hoàn tất! (${sizeMB} MB) — Nhấn nút bên dưới để lưu`;
    this.progressFill.style.width = '100%';
    this.progressText.textContent = '100%';
    this.cancelBtn.style.display = 'none';
    this.doneActionsEl.style.display = 'flex';
  }

  // ===== Fallback: WebM =====
  async _exportWebM(video, exportW, exportH, fps, bitrate, duration) {
    const canvas = document.createElement('canvas');
    canvas.width = exportW; canvas.height = exportH;
    const ctx = canvas.getContext('2d');
    const stream = canvas.captureStream(fps);
    let combinedStream = stream;
    try {
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      let hasAudio = false;

      if (!this.app.audioController || this.app.audioController.isOriginalAudioEnabled()) {
        const source1 = audioCtx.createMediaElementSource(video);
        source1.connect(dest);
        source1.connect(audioCtx.destination);
        hasAudio = true;
      }

      if (this.app.audioController && this.app.audioController.hasBeat()) {
        // Need to create a new MediaElementSource or reuse? Note: a media element can only have ONE MediaElementSource created for it.
        // If it was created before, it might fail. It's safer to just let the AudioController's AudioContext (if we had one) handle it.
        // Since we don't have one globally, we might get an InvalidStateError if we call it twice.
        // Let's wrap it in try-catch.
        try {
          const source2 = audioCtx.createMediaElementSource(this.app.audioController.audioEl);
          source2.connect(dest);
          source2.connect(audioCtx.destination);
          hasAudio = true;
        } catch (e) {
          console.warn('Could not connect beat audio to WebM recorder', e);
        }
      }

      if (hasAudio) {
        combinedStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      }
    } catch (e) { console.warn('WebM audio mix failed:', e); }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus' : 'video/webm';
    const chunks = [];
    const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate });
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    const done = new Promise(r => { recorder.onstop = r; });
    recorder.start(50);

    await this._seekTo(video, 0);
    video.play();
    this.statusEl.textContent = `Đang xuất ${exportW}×${exportH} (WebM)...`;

    const loop = () => {
      if (this.cancelled) return;
      const t = video.currentTime;
      ctx.drawImage(video, 0, 0, exportW, exportH);
      this._drawKaraoke(ctx, exportW, exportH, t);
      const pct = Math.min(100, (t / duration) * 100);
      this.progressFill.style.width = pct + '%';
      this.progressText.textContent = Math.round(pct) + '%';
      if (t >= duration - 0.05 || video.ended) {
        video.pause(); setTimeout(() => recorder.stop(), 200); return;
      }
      requestAnimationFrame(loop);
    };
    loop();
    await done;
    if (this.cancelled) { this.modal.style.display = 'none'; return; }

    this._exportedBlob = new Blob(chunks, { type: mimeType });
    const sizeMB = (this._exportedBlob.size / (1024 * 1024)).toFixed(1);
    this.statusEl.textContent = `✅ Hoàn tất! (${sizeMB} MB) — Nhấn nút bên dưới để lưu`;
    this.progressFill.style.width = '100%';
    this.progressText.textContent = '100%';
    this.cancelBtn.style.display = 'none';
    this.doneActionsEl.style.display = 'flex';
  }

  // ===== Save =====
  async _triggerSave() {
    if (!this._exportedBlob) return;
    const blob = this._exportedBlob;
    const name = this._exportedName;

    if (typeof window.showSaveFilePicker === 'function') {
      try {
        const isMP4 = name.endsWith('.mp4');
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: isMP4
            ? [{ description: 'Video MP4', accept: { 'video/mp4': ['.mp4'] } }]
            : [{ description: 'Video WebM', accept: { 'video/webm': ['.webm'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        this.statusEl.textContent = '✅ Đã lưu thành công!';
        setTimeout(() => { this.modal.style.display = 'none'; }, 1500);
        return;
      } catch (e) {
        if (e.name === 'AbortError') { this.statusEl.textContent = '⚠️ Đã hủy — nhấn lại để lưu'; return; }
        console.warn('Save picker error:', e);
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.statusEl.textContent = '✅ Đã tải xuống thư mục Downloads!';
    setTimeout(() => { this.modal.style.display = 'none'; }, 2000);
  }

  // ===== Drawing =====
  _buildFont(s, fs) {
    let f = '';
    if (s.italic) f += 'italic ';
    f += `${s.fontWeight || (s.bold ? 'bold' : '400')} ${fs}px ${s.fontFamily}`;
    return f;
  }

  _drawKaraoke(ctx, w, h, t) {
    const tc = this.app.timecodes;
    if (!tc || !tc.length) return;
    const s = this.app.stylePanel.getStyles();
    const LEAD_TIME = 4;
    let ai = -1;
    for (let i = 0; i < tc.length; i++) {
      if (tc[i].start !== null && tc[i].end !== null && t >= tc[i].start - LEAD_TIME && t < tc[i].end) { ai = i; break; }
    }
    if (ai === -1) return;
    const cur = tc[ai];
    const prog = t >= cur.start
      ? Math.max(0, Math.min(1, (t - cur.start) / (cur.end - cur.start)))
      : 0;
    const fs = s.fontSize * (w / 1280);
    ctx.font = this._buildFont(s, fs);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const x = w * (s.posX / 100);
    const hasNext = ai + 1 < tc.length;
    const gap = fs * 1.6;
    const y = hasNext ? h * (s.posY / 100) - gap / 2 : h * (s.posY / 100);
    ctx.globalAlpha = s.opacity / 100;
    if (!isBreakText(cur.text)) {
      this._drawLine(ctx, cur.text, x, y, fs, s, prog);
    }
    if (hasNext) {
      const nextTc = tc[ai+1];
      if (!isBreakText(nextTc.text)) {
        ctx.font = this._buildFont(s, fs);
        ctx.globalAlpha = (s.opacity / 100) * 0.45;
        if (s.glow) { ctx.shadowColor = s.glowColor; ctx.shadowBlur = s.glowBlur * 0.5; }
        else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }
        if (s.stroke) { ctx.strokeStyle = s.strokeColor; ctx.lineWidth = s.strokeWidth * 0.7; ctx.lineJoin = 'round'; ctx.strokeText(nextTc.text, x, y + gap); }
        ctx.fillStyle = s.colorInactive; ctx.fillText(nextTc.text, x, y + gap);
      }
    }
    ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  _drawLine(ctx, text, x, y, fs, s, prog) {
    const tw = ctx.measureText(text).width, tl = x - tw / 2;
    if (s.bgEnabled) { ctx.fillStyle = s.bgColor; const p = fs * 0.3; ctx.fillRect(tl - p, y - fs/2 - p, tw + p*2, fs + p*2); }
    if (s.glow) { ctx.shadowColor = s.glowColor; ctx.shadowBlur = s.glowBlur; } else { ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; }
    if (s.stroke) { ctx.strokeStyle = s.strokeColor; ctx.lineWidth = s.strokeWidth; ctx.lineJoin = 'round'; ctx.strokeText(text, x, y); }
    ctx.fillStyle = s.colorInactive; ctx.fillText(text, x, y);
    ctx.save(); ctx.beginPath(); ctx.rect(tl, y - fs, tw * prog, fs * 2); ctx.clip();
    if (s.stroke) { ctx.strokeStyle = s.strokeColor; ctx.lineWidth = s.strokeWidth; ctx.strokeText(text, x, y); }
    ctx.fillStyle = s.colorActive; ctx.fillText(text, x, y);
    ctx.restore(); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
  }

  cancel() {
    this.cancelled = true;
    this.app.videoPlayer.pause();
    this.app.videoPlayer.videoEl.muted = false;
    this.modal.style.display = 'none';
  }
}
