import { formatTime } from './config.js';

export class IntroOutroLibrary {
  constructor() {
    this.items = [];
    this.onChange = null;
  }

  async loadFromProject(project) {
    this.items = (project.introOutroLibrary || []).map((i) => ({ ...i }));
    if (this.onChange) this.onChange(this.items);
  }

  toProjectData() {
    return this.items.map((i) => ({ ...i }));
  }

  addItem(media, type) {
    const item = {
      id: crypto.randomUUID(),
      type, // 'intro' | 'outro'
      mediaId: media.id,
      name: media.name,
      duration: media.duration || 0,
      thumbnailUrl: media.thumbnailUrl || media.url,
    };
    this.items.push(item);
    if (this.onChange) this.onChange(this.items);
    return item;
  }

  removeItem(id) {
    this.items = this.items.filter((i) => i.id !== id);
    if (this.onChange) this.onChange(this.items);
  }

  getByType(type) {
    return this.items.filter((i) => i.type === type);
  }
}

export const introOutroLibrary = new IntroOutroLibrary();

export class SummarySystem {
  constructor() {
    this.manualSummaries = new Map(); // episodeId -> { mediaId, start, end, duration }
    this.onChange = null;
  }

  setManual(episodeId, data) {
    this.manualSummaries.set(episodeId, { ...data });
    if (this.onChange) this.onChange(this.manualSummaries);
  }

  get(episodeId) {
    return this.manualSummaries.get(episodeId);
  }

  remove(episodeId) {
    this.manualSummaries.delete(episodeId);
    if (this.onChange) this.onChange(this.manualSummaries);
  }
}

export const summarySystem = new SummarySystem();

export class CoverSystem {
  constructor() {
    this.covers = new Map(); // episodeId -> cover data
    this.onChange = null;
  }

  set(episodeId, cover) {
    this.covers.set(episodeId, { ...cover, number: cover.number || 0 });
    if (this.onChange) this.onChange(this.covers);
  }

  get(episodeId) {
    return this.covers.get(episodeId);
  }

  remove(episodeId) {
    this.covers.delete(episodeId);
    if (this.onChange) this.onChange(this.covers);
  }

  captureFrame(videoElement, episodeId) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth || 320;
      canvas.height = videoElement.videoHeight || 180;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        this.set(episodeId, { type: 'custom', imageUrl: url, blob, title: '', number: 0 });
        resolve(url);
      }, 'image/jpeg', 0.8);
    });
  }
}

export const coverSystem = new CoverSystem();
