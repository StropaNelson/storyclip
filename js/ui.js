import { formatTime } from './config.js';

export class UI {
  constructor() {
    this.toast = document.getElementById('toast');
    this.previewVideo = document.getElementById('preview-video');
    this.previewScrub = document.getElementById('preview-scrub');
    this.timeCurrent = document.getElementById('time-current');
    this.timeDuration = document.getElementById('time-duration');
    this.playbackOverlay = document.getElementById('playback-overlay');
    this.playbackPlay = document.getElementById('playback-play');
    this.mediaList = document.getElementById('media-list');
    this.mediaEmpty = document.getElementById('media-empty');
    this.projName = document.getElementById('proj-name');
    this.projDuration = document.getElementById('proj-duration');
  }

  showToast(message, duration = 3000) {
    this.toast.textContent = message;
    this.toast.classList.add('show');
    setTimeout(() => this.toast.classList.remove('show'), duration);
  }

  setProjectName(name) {
    this.projName.textContent = name || 'Projeto sem nome';
  }

  setProjectDuration(seconds) {
    this.projDuration.textContent = formatTime(seconds);
  }

  updateMediaList(items, emptyCallback) {
    if (items.length === 0) {
      this.mediaEmpty.classList.remove('hidden');
      this.mediaList.innerHTML = '';
    } else {
      this.mediaEmpty.classList.add('hidden');
    }
  }

  bindPlayer(player) {
    player.onTimeUpdate = (current, duration) => {
      this.timeCurrent.textContent = formatTime(current);
      this.timeDuration.textContent = formatTime(duration);
      if (!this.previewScrub.oninput) {
        this.previewScrub.max = duration || 100;
        this.previewScrub.value = current;
      }
    };
    player.onPlay = () => {
      this.playbackOverlay.classList.add('hidden');
    };
    player.onPause = () => {
      if (!player.video.ended) this.playbackOverlay.classList.remove('hidden');
    };
    player.onEnded = () => {
      this.playbackOverlay.classList.remove('hidden');
    };
    player.onLoaded = (duration) => {
      this.previewScrub.max = duration || 100;
    };

    // Scrub control
    let isScrubbing = false;
    this.previewScrub.addEventListener('pointerdown', () => { isScrubbing = true; });
    this.previewScrub.addEventListener('pointermove', (e) => {
      if (!isScrubbing) return;
      const val = parseFloat(this.previewScrub.value);
      player.seek(val);
    });
    this.previewScrub.addEventListener('pointerup', () => { isScrubbing = false; });
    this.previewScrub.addEventListener('pointerleave', () => { isScrubbing = false; });

    // Playback overlay play button
    this.playbackPlay.addEventListener('click', () => player.play());
    this.previewVideo.addEventListener('click', () => player.toggle());
  }
}

export const ui = new UI();
