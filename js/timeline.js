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
    this.onClipResize = null;
    this.onTimeChange = null;
    this.onClipAdded = null;

    this.isDragging = false;
    this.dragClip = null;
    this.dragStartX = 0;
    this.dragStartTime = 0;
    this.dragMode = 'move';
    this.dragStartWidth = 0;
    this.dragStartStart = 0;

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
    // Click na régua/área vazia move playhead
    this.container.addEventListener('mousedown', (e) => {
      if (e.target.closest('.timeline-clip')) return;
      if (e.target.closest('.track-label')) return;
      const rect = this.container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = Math.max(0, x / this.pxPerSec);
      this.seek(time);
    });

    // Arrastar playhead clicando nele
    this.playhead.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const rect = this.container.getBoundingClientRect();
      const startX = e.clientX;
      const startTime = this._timeFromPx(parseFloat(this.playhead.style.left || 0));
      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const t = Math.max(0, startTime + dx / this.pxPerSec);
        this.seek(t);
        if (this.onTimeChange) this.onTimeChange(t);
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp, { once: true });
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

  clear() {
    this.clips = [];
    this.selectedClipId = null;
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
    const curTime = this._timeFromPx(parseFloat(this.playhead.style.left || 0));
    this.seek(curTime);
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
    if (this.totalDurationEl) this.totalDurationEl.textContent = formatTime(this.totalDuration);
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

  _rulerStep(duration) {
    if (duration <= 30) return 5;
    if (duration <= 60) return 10;
    return 30;
  }

  render() {
    this._drawRuler();
    CONFIG.tracks.forEach((track) => {
      const lane = this.tracksContainer.querySelector(`.track-lane[data-track-id="${track.id}"]`);
      if (lane) lane.innerHTML = '';
    });
    for (const clip of this.clips) {
      const lane = this.tracksContainer.querySelector(`.track-lane[data-track-id="${clip.trackId}"]`);
      if (!lane) continue;
      const el = document.createElement('div');
      el.className = `timeline-clip${this.selectedClipId === clip.id ? ' selected' : ''}`;
      el.style.left = `${this._pxFromTime(clip.startTime)}px`;
      el.style.width = `${Math.max(40, this._pxFromTime(clip.duration))}px`;
      el.dataset.id = clip.id;
      el.style.backgroundColor = clip.color || '#37006e';
      el.innerHTML = `
        <div class="clip-thumb">
          ${clip.thumbnailUrl ? `<img src="${clip.thumbnailUrl}" style="width:100%;height:100%;object-fit:cover;display:block;">` : ''}
        </div>
        <div class="clip-info">
          <div class="clip-name">${clip.name}</div>
          <div class="clip-time">${formatTime(clip.duration)}</div>
        </div>
        <div class="clip-handle clip-handle-l" style="position:absolute;left:0;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:3;"></div>
        <div class="clip-handle clip-handle-r" style="position:absolute;right:0;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:3;"></div>
      `;

      // Mover clipe
      el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('clip-handle-l') || e.target.classList.contains('clip-handle-r')) {
          e.stopPropagation();
          this._startResize(e, clip, el, e.target.classList.contains('clip-handle-l') ? 'left' : 'right');
          return;
        }
        e.stopPropagation();
        this.selectClip(clip.id);
        this._startMove(e, clip, el);
      });

      lane.appendChild(el);
    }
  }

  _startMove(e, clip, el) {
    this.isDragging = true;
    this.dragClip = clip;
    this.dragStartX = e.clientX;
    this.dragStartTime = clip.startTime;
    this.dragMode = 'move';

    const onMove = (ev) => {
      const dx = ev.clientX - this.dragStartX;
      const dt = dx / this.pxPerSec;
      const newTime = Math.max(0, this.dragStartTime + dt);
      clip.startTime = newTime;
      this.renderPartial(clip);
      this.seek(clip.startTime + clip.duration);
      if (this.onClipMove) this.onClipMove(clip);
    };
    const onUp = () => {
      this.isDragging = false;
      this.dragClip = null;
      this.render();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }

  _startResize(e, clip, el, side) {
    this.isDragging = true;
    this.dragClip = clip;
    this.dragStartX = e.clientX;
    this.dragStartStart = clip.startTime;
    this.dragStartWidth = clip.duration;
    this.dragMode = side;

    const onMove = (ev) => {
      const dx = ev.clientX - this.dragStartX;
      const dt = dx / this.pxPerSec;
      if (side === 'left') {
        const newStart = Math.max(0, this.dragStartStart + dt);
        const newDuration = Math.max(0.5, this.dragStartStart + this.dragStartWidth - newStart);
        clip.startTime = newStart;
        clip.duration = newDuration;
      } else {
        clip.duration = Math.max(0.5, this.dragStartWidth + dt);
      }
      this.renderPartial(clip);
      if (this.onClipResize) this.onClipResize(clip);
    };
    const onUp = () => {
      this.isDragging = false;
      this.dragClip = null;
      this.render();
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp, { once: true });
  }

  renderPartial(clip) {
    // Re-render só a posição/tamanho de um clipe específico sem redesenhar tudo
    const el = this.container.querySelector(`.timeline-clip[data-id="${clip.id}"]`);
    if (!el) return;
    el.style.left = `${this._pxFromTime(clip.startTime)}px`;
    el.style.width = `${Math.max(40, this._pxFromTime(clip.duration))}px`;
    const timeEl = el.querySelector('.clip-time');
    if (timeEl) timeEl.textContent = formatTime(clip.duration);
  }

  destroy() {}
}

export const timeline = new Timeline(document.getElementById('timeline-wrap'));
