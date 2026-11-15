import { formatTime, parseTime, pxPerSecond, CONFIG } from './config.js';

export class Timeline {
  constructor(container, options = {}) {
    this.container = container;
    this.tracksContainer = document.getElementById('timeline-tracks');
    this.ruler = document.getElementById('timeline-ruler');
    this.playhead = document.getElementById('timeline-playhead');
    this.playheadTime = document.getElementById('playhead-time');
    this.totalDurationEl = document.getElementById('total-duration');

    this.zoom = options.zoom || 100;
    this.clips = [];
    this.selectedClipId = null;
    this.totalDuration = 0;
    this.onClipSelect = null;
    this.onClipMove = null;
    this.onTimeChange = null;
    this.onClipAdded = null;

    this.isDragging = false;
    this.dragClip = null;
    this.dragStartX = 0;
    this.dragStartTime = 0;
    this.dragMode = 'move'; // move | resize-left | resize-right

    this.pxPerSec = pxPerSecond(this.zoom);

    this._initTracks();
    this._initRuler();
    this._initEvents();
    this.render();
  }

  _initTracks() {
    this.tracksContainer.innerHTML = '';
    CONFIG.tracks.forEach((track) => {
      const trackEl = document.createElement('div');
      trackEl.className = 'timeline-track';
      trackEl.dataset.trackId = track.id;
      trackEl.innerHTML = `
        <div class="track-label">${track.label}</div>
        <div class="track-lane" data-track-id="${track.id}"></div>
      `;
      this.tracksContainer.appendChild(trackEl);
    });
  }

  _initRuler() {
    this.ruler.innerHTML = '<div class="ruler-marks"></div>';
  }

  _initEvents() {
    // Playhead click to seek
    this.container.addEventListener('click', (e) => {
      if (e.target.closest('.timeline-clip')) return;
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = x / this.pxPerSec;
      this.seek(time);
    });

    // Mouse down on track area for playhead drag
    this.container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.timeline-clip')) return;
      if (e.target.closest('.track-label')) return;
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      this.seek(x / this.pxPerSec);
    });
  }

  addClip(clip) {
    this.clips.push(clip);
    this._recalcDuration();
    this.render();
    if (this.onClipAdded) this.onClipAdded(clip);
    return clip;
  }

  removeClip(id) {
    this.clips = this.clips.filter((c) => c.id !== id);
    if (this.selectedClipId === id) this.selectedClipId = null;
    this._recalcDuration();
    this.render();
  }

  getClip(id) {
    return this.clips.find((c) => c.id === id);
  }

  selectClip(id) {
    this.selectedClipId = id;
    this.render();
    const clip = this.getClip(id);
    if (clip && this.onClipSelect) this.onClipSelect(clip);
  }

  seek(time) {
    time = Math.max(0, time);
    const x = time * this.pxPerSec;
    this.playhead.style.left = `${x}px`;
    this.playhead.style.display = 'block';
    this.playheadTime.textContent = formatTime(time);
    if (this.onTimeChange) this.onTimeChange(time);
  }

  setZoom(zoomPercent) {
    this.zoom = zoomPercent;
    this.pxPerSec = pxPerSecond(this.zoom);
    document.getElementById('zoom-value').textContent = `${this.zoom}%`;
    this.render();
    this.seek(this.playhead ? this._timeFromPx(parseFloat(this.playhead.style.left || 0)) : 0);
  }

  _timeFromPx(px) {
    return px / this.pxPerSec;
  }

  _pxFromTime(time) {
    return time * this.pxPerSec;
  }

  _recalcDuration() {
    let max = 0;
    for (const clip of this.clips) {
      const end = clip.startTime + clip.duration;
      if (end > max) max = end;
    }
    this.totalDuration = max;
    this.totalDurationEl.textContent = formatTime(this.totalDuration);
    // Extend ruler
    this._drawRuler();
  }

  _drawRuler() {
    const marks = this.ruler.querySelector('.ruler-marks');
    const duration = Math.ceil(this.totalDuration) + 10;
    const step = this._rulerStep(duration);
    const width = duration * this.pxPerSec;
    marks.style.width = `${width}px`;
    marks.innerHTML = '';
    for (let t = 0; t <= duration; t += step) {
      const mark = document.createElement('div');
      mark.className = 'ruler-mark';
      mark.style.left = `${t * this.pxPerSec}px`;
      marks.appendChild(mark);
      const label = document.createElement('div');
      label.className = 'ruler-mark-label';
      label.style.left = `${t * this.pxPerSec}px`;
      label.textContent = formatTime(t);
      marks.appendChild(label);
    }
  }

  render() {
    this._drawRuler();
    // Render clips per track
    CONFIG.tracks.forEach((track) => {
      const lane = this.tracksContainer.querySelector(`.track-lane[data-track-id="${track.id}"]`);
      lane.innerHTML = '';
    });
    for (const clip of this.clips) {
      const lane = this.tracksContainer.querySelector(`.track-lane[data-track-id="${clip.trackId}"]`);
      if (!lane) continue;
      const el = document.createElement('div');
      el.className = `timeline-clip${this.selectedClipId === clip.id ? ' selected' : ''}`;
      el.style.left = `${this._pxFromTime(clip.startTime)}px`;
      el.style.width = `${this._pxFromTime(clip.duration)}px`;
      el.dataset.id = clip.id;
      el.style.backgroundColor = clip.color || '#37006e';
      el.innerHTML = `
        <div class="clip-thumb">
          ${clip.thumbnailUrl ? `<img src="${clip.thumbnailUrl}">` : ''}
        </div>
        <div class="clip-info">
          <div class="clip-name">${clip.name}</div>
          <div class="clip-time">${formatTime(clip.duration)}</div>
        </div>
      `;
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.selectClip(clip.id);
        this._startDrag(e, el, clip);
      });
      lane.appendChild(el);
    }
  }

  _startDrag(e, el, clip) {
    this.isDragging = true;
    this.dragClip = clip;
    this.dragStartX = e.clientX;
    this.dragStartTime = clip.startTime;
    this.dragMode = 'move';

    const onMove = (ev) => {
      const dx = ev.clientX - this.dragStartX;
      const dt = dx / this.pxPerSec;
      if (this.dragMode === 'move') {
        const newTime = Math.max(0, this.dragStartTime + dt);
        clip.startTime = newTime;
      }
      this.render();
      this.seek(clip.startTime + clip.duration);
      if (this.onClipMove) this.onClipMove(clip);
    };
    const onUp = () => {
      this.isDragging = false;
      this.dragClip = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }

  destroy() {}
}

export const timeline = new Timeline(document.getElementById('timeline-wrap'));
