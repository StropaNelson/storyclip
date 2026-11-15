import { formatTime } from './config.js';

export class Player {
  constructor(videoElement) {
    this.video = videoElement;
    this.currentTime = 0;
    this.duration = 0;
    this.isPlaying = false;
    this.onTimeUpdate = null;
    this.onPlay = null;
    this.onPause = null;
    this.onEnded = null;
    this.onLoaded = null;
    this._raf = null;

    this.video.addEventListener('loadedmetadata', () => {
      this.duration = this.video.duration || 0;
      if (this.onLoaded) this.onLoaded(this.duration);
    });
    this.video.addEventListener('timeupdate', () => {
      this.currentTime = this.video.currentTime;
      if (this.onTimeUpdate) this.onTimeUpdate(this.currentTime, this.duration);
    });
    this.video.addEventListener('play', () => {
      this.isPlaying = true;
      this._startRaf();
      if (this.onPlay) this.onPlay();
    });
    this.video.addEventListener('pause', () => {
      this.isPlaying = false;
      this._stopRaf();
      if (this.onPause) this.onPause();
    });
    this.video.addEventListener('ended', () => {
      this.isPlaying = false;
      this._stopRaf();
      if (this.onEnded) this.onEnded();
    });
  }

  load(src) {
    this.video.src = src;
    this.video.load();
  }

  play() {
    return this.video.play();
  }

  pause() {
    this.video.pause();
  }

  seek(time) {
    this.video.currentTime = time;
    this.currentTime = time;
  }

  toggle() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  setVolume(vol) {
    this.video.volume = vol;
  }

  setPlaybackRate(rate) {
    this.video.playbackRate = rate;
  }

  _startRaf() {
    this._stopRaf();
    const tick = () => {
      if (this.isPlaying) {
        this.currentTime = this.video.currentTime;
        if (this.onTimeUpdate) this.onTimeUpdate(this.currentTime, this.duration);
        this._raf = requestAnimationFrame(tick);
      }
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopRaf() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  destroy() {
    this._stopRaf();
    this.video.pause();
    this.video.src = '';
  }
}
