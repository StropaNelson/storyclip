import { formatTime, CONFIG } from './config.js';
import { dbPut, dbGetAll, dbGet, dbDelete, dbAdd } from './db.js';

export class Episode {
  constructor(data = {}) {
    this.id = data.id || crypto.randomUUID();
    this.number = data.number || 1;
    this.title = data.title || `Episódio ${String(this.number).padStart(2, '0')}`;
    this.sourceMediaId = data.sourceMediaId || null;
    this.sourceStart = data.sourceStart !== undefined ? data.sourceStart : 0;
    this.sourceEnd = data.sourceEnd !== undefined ? data.sourceEnd : 0;
    this.duration = data.duration || 0;
    this.opening = data.opening || { type: 'none', mediaId: null, start: 0, end: 0, duration: 0, text: '', number: this.number };
    this.summary = data.summary || { type: 'none', mediaId: null, start: 0, end: 0, duration: 0 };
    this.content = data.content || { mediaId: null, start: 0, end: 0, duration: 0 };
    this.closing = data.closing || { type: 'none', mediaId: null, start: 0, end: 0, duration: 0, text: '', nextNumber: this.number + 1 };
    this.cover = data.cover || { type: 'standard', imageUrl: null, title: this.title, number: this.number };
    this.aspectRatio = data.aspectRatio || CONFIG.defaultAspectRatio;
    this.resolution = data.resolution || CONFIG.defaultResolution;
    this.status = data.status || 'draft'; // draft, rendering, done, error
  }

  totalStructureDuration() {
    return (this.opening.duration || 0) + (this.summary.duration || 0) + (this.content.duration || 0) + (this.closing.duration || 0);
  }
}

export class EpisodeManager {
  constructor() {
    this.episodes = [];
    this.sourceMedia = null;
    this.episodeDuration = 60; // seconds
    this.onChange = null;
    this.summaryStrategy = 'none'; // none, prev-end, prev-segment, manual
    this.summaryDuration = 10;
  }

  async loadFromProject(project) {
    this.episodes = (project.episodes || []).map((e) => new Episode(e));
    this.sourceMedia = project.sourceMedia || null;
    this.episodeDuration = project.episodeDuration || 60;
    this.summaryStrategy = project.summaryStrategy || 'none';
    this.summaryDuration = project.summaryDuration || 10;
    if (this.onChange) this.onChange(this.episodes);
  }

  toProjectData() {
    return {
      sourceMedia: this.sourceMedia,
      episodeDuration: this.episodeDuration,
      summaryStrategy: this.summaryStrategy,
      summaryDuration: this.summaryDuration,
      episodes: this.episodes.map((e) => ({ ...e })),
    };
  }

  setSource(media) {
    this.sourceMedia = media;
  }

  setEpisodeDuration(seconds) {
    this.episodeDuration = seconds;
  }

  setSummaryStrategy(strategy, duration = 10) {
    this.summaryStrategy = strategy;
    this.summaryDuration = duration;
  }

  generateEpisodes() {
    if (!this.sourceMedia) return [];
    const total = this.sourceMedia.duration || 0;
    if (total <= 0) return [];
    this.episodes = [];
    let start = 0;
    let number = 1;
    while (start < total) {
      const end = Math.min(start + this.episodeDuration, total);
      const ep = new Episode({
        number,
        title: `Episódio ${String(number).padStart(2, '0')}`,
        sourceMediaId: this.sourceMedia.id,
        sourceStart: start,
        sourceEnd: end,
        duration: end - start,
        content: { mediaId: this.sourceMedia.id, start, end, duration: end - start },
      });
      this.episodes.push(ep);
      start = end;
      number++;
    }
    this._applySummaryStrategy();
    if (this.onChange) this.onChange(this.episodes);
    return this.episodes;
  }

  _applySummaryStrategy() {
    if (this.summaryStrategy === 'none') return;
    for (let i = 1; i < this.episodes.length; i++) {
      const prev = this.episodes[i - 1];
      const curr = this.episodes[i];
      if (this.summaryStrategy === 'prev-end') {
        const s = Math.max(prev.sourceEnd - this.summaryDuration, prev.sourceStart);
        curr.summary = { type: 'prev-end', mediaId: prev.sourceMediaId, start: s, end: prev.sourceEnd, duration: prev.sourceEnd - s };
      } else if (this.summaryStrategy === 'prev-segment') {
        const segStart = prev.sourceStart;
        const s = Math.max(segStart, prev.sourceEnd - this.summaryDuration);
        curr.summary = { type: 'prev-segment', mediaId: prev.sourceMediaId, start: s, end: prev.sourceEnd, duration: prev.sourceEnd - s };
      }
    }
    // First episode no summary
    if (this.episodes[0]) this.episodes[0].summary = { type: 'none', mediaId: null, start: 0, end: 0, duration: 0 };
  }

  adjustCut(episodeId, newStart, newEnd) {
    const ep = this.episodes.find((e) => e.id === episodeId);
    if (!ep) return false;
    ep.sourceStart = newStart;
    ep.sourceEnd = newEnd;
    ep.duration = newEnd - newStart;
    ep.content = { ...ep.content, start: newStart, end: newEnd, duration: newEnd - newStart };
    this._rebuildFrom(ep.number);
    if (this.onChange) this.onChange(this.episodes);
    return true;
  }

  _rebuildFrom(fromNumber) {
    // Recompute subsequent episodes start/end to preserve continuity
    let cursor = null;
    for (const ep of this.episodes) {
      if (ep.number < fromNumber) continue;
      if (cursor === null) {
        cursor = ep.sourceStart;
      } else {
        ep.sourceStart = cursor;
      }
      ep.sourceEnd = Math.min(cursor + ep.duration, (this.sourceMedia && this.sourceMedia.duration) || cursor + ep.duration);
      ep.duration = ep.sourceEnd - ep.sourceStart;
      ep.content = { ...ep.content, start: ep.sourceStart, end: ep.sourceEnd, duration: ep.duration };
      cursor = ep.sourceEnd;
    }
    this._applySummaryStrategy();
  }

  duplicateEpisode(episodeId) {
    const ep = this.episodes.find((e) => e.id === episodeId);
    if (!ep) return null;
    const maxNum = Math.max(...this.episodes.map((e) => e.number));
    const copy = new Episode({
      ...ep,
      id: crypto.randomUUID(),
      number: maxNum + 1,
      title: `Episódio ${String(maxNum + 1).padStart(2, '0')}`,
    });
    const idx = this.episodes.findIndex((e) => e.id === episodeId);
    this.episodes.splice(idx + 1, 0, copy);
    this._renumber();
    if (this.onChange) this.onChange(this.episodes);
    return copy;
  }

  deleteEpisode(episodeId) {
    this.episodes = this.episodes.filter((e) => e.id !== episodeId);
    this._renumber();
    if (this.onChange) this.onChange(this.episodes);
  }

  reorderEpisodes(orderedIds) {
    const map = new Map(this.episodes.map((e) => [e.id, e]));
    this.episodes = orderedIds.map((id) => map.get(id)).filter(Boolean);
    this._renumber();
    if (this.onChange) this.onChange(this.episodes);
  }

  _renumber() {
    this.episodes.sort((a, b) => a.sourceStart - b.sourceStart);
    this.episodes.forEach((ep, i) => {
      ep.number = i + 1;
      ep.title = `Episódio ${String(i + 1).padStart(2, '0')}`;
      if (ep.opening.type !== 'none') ep.opening.number = i + 1;
      if (ep.closing.type !== 'none') ep.closing.nextNumber = i + 2;
    });
  }

  getEpisode(id) {
    return this.episodes.find((e) => e.id === id);
  }

  setOpening(episodeId, opening) {
    const ep = this.getEpisode(episodeId);
    if (!ep) return;
    ep.opening = { ...opening, number: ep.number };
  }

  setClosing(episodeId, closing) {
    const ep = this.getEpisode(episodeId);
    if (!ep) return;
    ep.closing = { ...closing, nextNumber: ep.number + 1 };
  }

  setCover(episodeId, cover) {
    const ep = this.getEpisode(episodeId);
    if (!ep) return;
    ep.cover = { ...cover, number: ep.number };
  }

  setFormat(episodeId, aspectRatio, resolution) {
    const ep = this.getEpisode(episodeId);
    if (!ep) return;
    ep.aspectRatio = aspectRatio;
    ep.resolution = resolution;
  }
}

export const episodeManager = new EpisodeManager();
