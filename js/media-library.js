import { dbAdd, dbGetAll, dbGet, dbPut, dbDelete, openDB } from './db.js';
import { formatTime } from './config.js';

let mediaItems = [];
let selectedMediaId = null;

export class MediaLibrary {
  constructor() {
    this.items = [];
    this.selectedId = null;
    this.onChange = null;
    this.onSelect = null;
    this.thumbnails = new Map(); // mediaId -> URL
  }

  async init() {
    await openDB();
    await this.load();
  }

  async load() {
    this.items = await dbGetAll('media');
    if (this.onChange) this.onChange(this.items);
  }

  async addFile(file) {
    const id = crypto.randomUUID();
    const url = URL.createObjectURL(file);
    const metadata = await this._extractMetadata(file, url);
    const item = {
      id,
      name: file.name,
      type: file.type.startsWith('video') ? 'video' : 'image',
      mimeType: file.type,
      size: file.size,
      file,
      url,
      ...metadata,
      createdAt: Date.now(),
    };
    await dbAdd('media', item);
    this.items.push(item);
    if (this.onChange) this.onChange(this.items);
    return item;
  }

  async importFiles(files) {
    const added = [];
    for (const file of files) {
      if (file.type.startsWith('video/') || file.type.startsWith('image/')) {
        const item = await this.addFile(file);
        added.push(item);
      }
    }
    return added;
  }

  async _extractMetadata(file, url) {
    const result = { duration: 0, width: 0, height: 0, fps: 0, hasAudio: false };
    if (file.type.startsWith('video/')) {
      try {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = url;
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
        });
        result.duration = video.duration || 0;
        result.width = video.videoWidth || 0;
        result.height = video.videoHeight || 0;
        result.hasAudio = video.audioTracks && video.audioTracks.length > 0;
        video.remove();
      } catch (e) {
        console.warn('Could not extract video metadata', e);
      }
      // Generate thumbnail
      try {
        const thumbUrl = await this.generateThumbnail(url, result.duration);
        result.thumbnailUrl = thumbUrl;
      } catch (e) {
        console.warn('Thumbnail generation failed', e);
      }
    } else if (file.type.startsWith('image/')) {
      try {
        const img = document.createElement('img');
        img.src = url;
        await new Promise((resolve) => { img.onload = resolve; });
        result.width = img.naturalWidth;
        result.height = img.naturalHeight;
        result.thumbnailUrl = url;
        img.remove();
      } catch (e) {
        console.warn('Could not extract image metadata', e);
      }
    }
    return result;
  }

  async generateThumbnail(videoUrl, duration, time = 1) {
    const seekTime = Math.min(time, Math.max(0, duration - 0.5));
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = videoUrl;
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 180;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          const thumbUrl = URL.createObjectURL(blob);
          video.remove();
          resolve(thumbUrl);
        }, 'image/jpeg', 0.7);
      };
      video.onerror = () => {
        video.remove();
        reject(new Error('Video error'));
      };
      video.currentTime = seekTime;
    });
  }

  getItem(id) {
    return this.items.find((i) => i.id === id);
  }

  select(id) {
    this.selectedId = id;
    if (this.onSelect) this.onSelect(this.getItem(id));
  }

  async delete(id) {
    const item = this.getItem(id);
    if (item && item.url) URL.revokeObjectURL(item.url);
    if (item && item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
    await dbDelete('media', id);
    this.items = this.items.filter((i) => i.id !== id);
    if (this.selectedId === id) this.selectedId = null;
    if (this.onChange) this.onChange(this.items);
  }

  render(container, onItemClick) {
    container.innerHTML = '';
    if (this.items.length === 0) return;
    this.items.forEach((item) => {
      const el = document.createElement('div');
      el.className = `media-item${this.selectedId === item.id ? ' selected' : ''}`;
      el.dataset.id = item.id;
      el.style.cursor = 'pointer';
      el.innerHTML = `
        <div class="media-thumb">
          <img src="${item.thumbnailUrl || item.url}" alt="${item.name}">
          ${item.duration > 0 ? `<span class="media-duration">${formatTime(item.duration)}</span>` : ''}
        </div>
        <div class="media-info">
          <div class="media-name">${this._escape(item.name)}</div>
          <div class="media-meta">${item.width}×${item.height} ${item.type}</div>
        </div>
      `;
      el.addEventListener('click', () => {
        onItemClick(item.id);
      });
      container.appendChild(el);
    });
  }

  _escape(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

export const mediaLibrary = new MediaLibrary();
