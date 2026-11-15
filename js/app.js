import { CONFIG, formatTime, parseTime } from './config.js';
import { openDB, dbPut, dbGetAll, dbGet } from './db.js';
import { storage } from './storage.js';
import { mediaLibrary } from './media-library.js';
import { Player } from './player.js';
import { Timeline, timeline } from './timeline.js';
import { ui } from './ui.js';
import { EpisodeManager, episodeManager, Episode } from './episode.js';
import { introOutroLibrary, summarySystem, coverSystem } from './intro-outro.js';
import { formatConfig, ASPECT_RATIOS, RESOLUTIONS } from './format.js';
import { projectManager } from './project.js';
import { renderEngine, ffmpegAvailable } from './render.js';

export class App {
  constructor() {
    this.player = null;
    this.currentEpisodeId = null;
    this.mediaMap = new Map();
    this.initPromise = null;
  }

  async init() {
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('/sw.js'); } catch (e) { console.warn('SW', e); }
    }
    await storage.init();
    await mediaLibrary.init();

    this.player = new Player(document.getElementById('preview-video'));
    ui.bindPlayer(this.player);

    this._wireMediaLibrary();
    this._wireHeader();
    this._wireTimeline();
    this._wireEpisodesPanel();
    this._wireEpisodeModal();
    this._wireProjectModal();
    this._wireRender();

    // populate selects
    const asSel = document.getElementById('ep-aspect');
    const resSel = document.getElementById('ep-resolution');
    ASPECT_RATIOS.forEach((a) => {
      const o = document.createElement('option'); o.value = a.id; o.textContent = a.label; asSel.appendChild(o);
    });
    RESOLUTIONS.forEach((r) => {
      const o = document.createElement('option'); o.value = r.id; o.textContent = r.label; resSel.appendChild(o);
    });

    mediaLibrary.render(document.getElementById('media-list'), (id) => {
      mediaLibrary.select(id);
      const item = mediaLibrary.getItem(id);
      if (item) {
        this.player.load(item.url);
        this.player.pause();
        this.mediaMap.set(id, item);
        ui.showToast(item.name);
      }
    });

    ui.showToast('ClipStudio pronto');
  }

  _wireMediaLibrary() {
    mediaLibrary.onChange = (items) => {
      ui.updateMediaList(items);
      const empty = document.getElementById('media-empty');
      if (items.length === 0) empty.classList.remove('hidden');
      else empty.classList.add('hidden');
    };
    document.getElementById('btn-import').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('btn-import-empty').addEventListener('click', () => document.getElementById('file-input').click());
    document.getElementById('file-input').addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      const added = await mediaLibrary.importFiles(files);
      ui.showToast(`${added.length} item(ns) importado(s)`);
      e.target.value = '';
    });
  }

  _wireHeader() {
    document.getElementById('btn-play').addEventListener('click', () => this.player.toggle());
    document.getElementById('btn-export').addEventListener('click', () => {
      ui.showToast('Exportação na aba Episódios');
    });
    document.getElementById('btn-zoom-in').addEventListener('click', () => timeline.setZoom(Math.min(300, timeline.zoom + 25)));
    document.getElementById('btn-zoom-out').addEventListener('click', () => timeline.setZoom(Math.max(25, timeline.zoom - 25)));

    document.getElementById('btn-view-list').addEventListener('click', () => {
      document.getElementById('btn-view-list').classList.add('active');
      document.getElementById('btn-view-grid').classList.remove('active');
    });
    document.getElementById('btn-view-grid').addEventListener('click', () => {
      document.getElementById('btn-view-grid').classList.add('active');
      document.getElementById('btn-view-list').classList.remove('active');
    });

    // Episodes button -> open episodes panel (desktop) or modal? Use panel toggle
    document.getElementById('btn-episodes').addEventListener('click', () => {
      const panel = document.getElementById('panel-episodes');
      const inspector = document.getElementById('panel-inspector');
      if (window.innerWidth >= 769) {
        inspector.style.display = 'none';
        panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
        if (panel.style.display === 'flex') this._renderEpisodesList();
      } else {
        // mobile: show projects modal as episodes entry
        document.getElementById('modal-projects').classList.add('visible');
      }
    });
    document.getElementById('btn-close-episodes').addEventListener('click', () => {
      document.getElementById('panel-episodes').style.display = 'none';
    });
  }

  _wireTimeline() {
    timeline.onClipSelect = (clip) => {
      this.currentEpisodeId = null;
      this.player.load(clip.sourceUrl || clip.url);
      this.player.seek(clip.startTime);
      this.player.play();
      ui.showToast(clip.name);
    };
    timeline.onTimeChange = (time) => {};
  }

  _wireEpisodesPanel() {
    document.getElementById('btn-gen-episodes').addEventListener('click', () => {
      const sel = mediaLibrary.selectedId;
      if (!sel) { ui.showToast('Selecione um vídeo na biblioteca'); return; }
      const media = mediaLibrary.getItem(sel);
      if (!media || media.type !== 'video') { ui.showToast('Selecione um vídeo'); return; }
      episodeManager.setSource(media);
      const dur = parseFloat(document.getElementById('ep-duration').value) || 60;
      episodeManager.setEpisodeDuration(dur);
      const eps = episodeManager.generateEpisodes();
      this.mediaMap.set(sel, media);
      this._renderEpisodesList();
      ui.showToast(`${eps.length} episódio(s) gerado(s)`);
    });

    document.getElementById('btn-render-all').addEventListener('click', async () => {
      if (episodeManager.episodes.length === 0) { ui.showToast('Nenhum episódio'); return; }
      if (!ffmpegAvailable()) {
        ui.showToast('Carregando FFmpeg.wasm…');
      }
      const results = await renderEngine.renderAll(episodeManager.episodes, this.mediaMap);
      const ok = results.filter((r) => r.success).length;
      ui.showToast(`Renderizados ${ok}/${results.length}`);
    });

    document.getElementById('btn-export-zip').addEventListener('click', () => {
      ui.showToast('ZIP em implementação');
    });
  }

  _renderEpisodesList() {
    const container = document.getElementById('episodes-list');
    container.innerHTML = '';
    if (episodeManager.episodes.length === 0) {
      container.innerHTML = '<div style="color:var(--color-text-muted);font-size:12px;padding:12px;">Gere episódios a partir de um vídeo da biblioteca.</div>';
      return;
    }
    for (const ep of episodeManager.episodes) {
      const el = document.createElement('div');
      el.className = `episode-item${this.currentEpisodeId === ep.id ? ' selected' : ''}`;
      el.innerHTML = `
        <div class="episode-header">
          <span class="episode-number">${String(ep.number).padStart(2, '0')}</span>
          <span class="episode-duration">${formatTime(ep.totalStructureDuration())}</span>
        </div>
        <div class="episode-title">${ep.title}</div>
        <div class="episode-meta">${formatTime(ep.sourceStart)} – ${formatTime(ep.sourceEnd)} · ${ep.aspectRatio} · ${ep.resolution}</div>
        <div class="episode-actions">
          <button class="btn-ep" data-id="${ep.id}" data-act="preview">Pré-visualizar</button>
          <button class="btn-ep" data-id="${ep.id}" data-act="config">Configurar</button>
        </div>
      `;
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-ep');
        if (btn) {
          const id = btn.dataset.id;
          const act = btn.dataset.act;
          if (act === 'preview') this._previewEpisode(id);
          else if (act === 'config') this._openEpisodeConfig(id);
          return;
        }
        if (this.currentEpisodeId === ep.id) return;
        this.currentEpisodeId = ep.id;
        this._renderEpisodesList();
        this._previewEpisode(ep.id);
      });
      container.appendChild(el);
    }
  }

  async _previewEpisode(episodeId) {
    const ep = episodeManager.getEpisode(episodeId);
    if (!ep) return;
    document.getElementById('episode-modal-title').textContent = ep.title;
    const media = this.mediaMap.get(ep.sourceMediaId) || mediaLibrary.getItem(ep.sourceMediaId);
    if (media) {
      this.mediaMap.set(ep.sourceMediaId, media);
      this.player.load(media.url);
      this.player.seek(ep.sourceStart);
      this.player.play();
      // load structure clips into timeline
      this._loadEpisodeIntoTimeline(ep);
    }
    ui.showToast(`Pré-visualização: ${ep.title}`);
  }

  _loadEpisodeIntoTimeline(ep) {
    // Clear and render structure clips as visual blocks on timeline
    timeline.clips = [];
    const add = (trackId, start, dur, name, color, mediaId) => {
      if (!dur || dur <= 0) return;
      const media = this.mediaMap.get(mediaId) || mediaLibrary.getItem(mediaId);
      const url = media ? media.url : null;
      timeline.addClip({
        id: crypto.randomUUID(),
        trackId,
        startTime: start,
        duration: dur,
        name,
        color,
        thumbnailUrl: media ? (media.thumbnailUrl || media.url) : null,
        sourceUrl: url,
        sourceMediaId: mediaId,
      });
    };
    if (ep.opening.type !== 'none' && ep.opening.duration > 0) {
      add('opening', 0, ep.opening.duration, 'Abertura', '#4a1a6b', ep.opening.mediaId || ep.sourceMediaId);
    }
    let cursor = (ep.opening.duration || 0);
    if (ep.summary.type !== 'none' && ep.summary.duration > 0) {
      add('summary', cursor, ep.summary.duration, 'Resumo', '#1a4a6b', ep.summary.mediaId || ep.sourceMediaId);
      cursor += ep.summary.duration;
    }
    if (ep.content.duration > 0) {
      add('content', cursor, ep.content.duration, 'Conteúdo', '#1a6b4a', ep.sourceMediaId);
      cursor += ep.content.duration;
    }
    if (ep.closing.type !== 'none' && ep.closing.duration > 0) {
      add('closing', cursor, ep.closing.duration, 'Encerramento', '#6b4a1a', ep.closing.mediaId || ep.sourceMediaId);
    }
    timeline._recalcDuration();
    timeline.render();
    timeline.seek(0);
  }

  _wireEpisodeModal() {
    const modal = document.getElementById('modal-episode');
    document.getElementById('modal-episode-close').addEventListener('click', () => modal.classList.remove('visible'));
    document.getElementById('modal-episode-cancel').addEventListener('click', () => modal.classList.remove('visible'));
    document.getElementById('modal-episode-save').addEventListener('click', () => {
      if (!this.currentEpisodeId) return;
      const ep = episodeManager.getEpisode(this.currentEpisodeId);
      if (!ep) return;
      ep.number = parseInt(document.getElementById('ep-number').value) || ep.number;
      ep.title = document.getElementById('ep-title').value || ep.title;
      ep.aspectRatio = document.getElementById('ep-aspect').value;
      ep.resolution = document.getElementById('ep-resolution').value;
      ep.episodeDuration = parseFloat(document.getElementById('ep-duration').value) || ep.duration;
      this._renderEpisodesList();
      modal.classList.remove('visible');
      ui.showToast('Episódio atualizado');
    });

    // structure buttons
    document.getElementById('ep-set-opening').addEventListener('click', () => this._setStructure('opening'));
    document.getElementById('ep-set-summary').addEventListener('click', () => this._setStructure('summary'));
    document.getElementById('ep-set-closing').addEventListener('click', () => this._setStructure('closing'));
    document.getElementById('ep-set-cover').addEventListener('click', () => this._setStructure('cover'));
  }

  _setStructure(kind) {
    if (!this.currentEpisodeId) return;
    const ep = episodeManager.getEpisode(this.currentEpisodeId);
    const info = document.getElementById('ep-structure-info');
    const media = this.mediaMap.get(ep.sourceMediaId) || mediaLibrary.getItem(ep.sourceMediaId);
    if (!media) { ui.showToast('Sem vídeo fonte'); return; }
    const currentTime = this.player.currentTime || 0;
    if (kind === 'opening') {
      episodeManager.setOpening(this.currentEpisodeId, { type: 'source', mediaId: ep.sourceMediaId, start: currentTime, end: Math.min(currentTime + 10, media.duration), duration: Math.min(10, media.duration - currentTime), text: '', number: ep.number });
    } else if (kind === 'summary') {
      episodeManager.setSummaryStrategy('manual', 10);
      // placeholder manual summary using current playhead
      summarySystem.setManual(this.currentEpisodeId, { mediaId: ep.sourceMediaId, start: currentTime, end: Math.min(currentTime + 10, media.duration), duration: Math.min(10, media.duration - currentTime) });
      ep.summary = { type: 'manual', mediaId: ep.sourceMediaId, start: currentTime, end: Math.min(currentTime + 10, media.duration), duration: Math.min(10, media.duration - currentTime) };
    } else if (kind === 'closing') {
      episodeManager.setClosing(this.currentEpisodeId, { type: 'source', mediaId: ep.sourceMediaId, start: Math.max(0, media.duration - 10), end: media.duration, duration: 10, text: 'Continue no próximo episódio', nextNumber: ep.number + 1 });
    } else if (kind === 'cover') {
      coverSystem.set(this.currentEpisodeId, { type: 'standard', imageUrl: null, title: ep.title, number: ep.number });
    }
    this._renderEpisodesList();
    this._loadEpisodeIntoTimeline(ep);
    info.textContent = `${kind} definido em ${formatTime(currentTime)}`;
    ui.showToast(`${kind} configurado`);
  }

  _openEpisodeConfig(episodeId) {
    this.currentEpisodeId = episodeId;
    const ep = episodeManager.getEpisode(episodeId);
    if (!ep) return;
    document.getElementById('ep-number').value = ep.number;
    document.getElementById('ep-title').value = ep.title;
    document.getElementById('ep-aspect').value = ep.aspectRatio;
    document.getElementById('ep-resolution').value = ep.resolution;
    document.getElementById('ep-duration').value = ep.duration;
    document.getElementById('modal-episode').classList.add('visible');
    this._renderEpisodesList();
  }

  _wireProjectModal() {
    const modal = document.getElementById('modal-projects');
    document.getElementById('modal-projects-close').addEventListener('click', () => modal.classList.remove('visible'));
    document.getElementById('modal-projects-close2').addEventListener('click', () => modal.classList.remove('visible'));
    document.getElementById('proj-new').addEventListener('click', async () => {
      const name = document.getElementById('proj-new-name').value || 'Novo Projeto';
      await projectManager.createNew(name);
      episodeManager.episodes = [];
      this.currentEpisodeId = null;
      this._renderEpisodesList();
      ui.showToast('Projeto criado');
      this._renderProjectList();
    });
    document.getElementById('proj-import-file').addEventListener('click', () => document.getElementById('proj-import-input').click());
    document.getElementById('proj-import-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await projectManager.importFile(file);
      ui.showToast('Projeto importado');
      this._renderProjectList();
      e.target.value = '';
    });
    this._renderProjectList();
  }

  async _renderProjectList() {
    const container = document.getElementById('proj-list');
    const projects = await projectManager.list();
    container.innerHTML = '';
    for (const p of projects) {
      const el = document.createElement('div');
      el.className = 'episode-item';
      el.innerHTML = `
        <div class="episode-header">
          <span class="episode-title">${p.name}</span>
          <span class="episode-duration">${formatTime(p.updatedAt ? 0 : 0)}</span>
        </div>
        <div class="episode-meta">${p.episodes ? p.episodes.length : 0} episódios · ${new Date(p.updatedAt).toLocaleDateString()}</div>
        <div class="episode-actions">
          <button class="btn-ep" data-id="${p.id}" data-act="open">Abrir</button>
          <button class="btn-ep" data-id="${p.id}" data-act="dup">Duplicar</button>
          <button class="btn-ep" data-id="${p.id}" data-act="export">Exportar</button>
        </div>
      `;
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-ep');
        if (!btn) return;
        const id = btn.dataset.id;
        const act = btn.dataset.act;
        if (act === 'open') this._openProject(id);
        else if (act === 'dup') this._dupProject(id);
        else if (act === 'export') this._exportProject(id);
      });
      container.appendChild(el);
    }
  }

  async _openProject(id) {
    const proj = await projectManager.load(id);
    if (!proj) return;
    episodeManager.episodes = (proj.episodes || []).map((e) => new Episode(e));
    episodeManager.sourceMedia = proj.sourceMedia || null;
    episodeManager.episodeDuration = proj.episodeDuration || 60;
    episodeManager.summaryStrategy = proj.summaryStrategy || 'none';
    episodeManager.summaryDuration = proj.summaryDuration || 10;
    if (proj.sourceMedia) this.mediaMap.set(proj.sourceMedia.id, proj.sourceMedia);
    this.currentEpisodeId = null;
    this._renderEpisodesList();
    document.getElementById('modal-projects').classList.remove('visible');
    ui.setProjectName(proj.name);
    ui.showToast(`Projeto aberto: ${proj.name}`);
  }

  async _dupProject(id) {
    await projectManager.duplicate(id);
    this._renderProjectList();
    ui.showToast('Projeto duplicado');
  }

  async _exportProject(id) {
    const proj = await projectManager.getCurrent();
    const exp = await projectManager.exportFile();
    if (!exp) return;
    const a = document.createElement('a');
    a.href = exp.url;
    a.download = exp.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(exp.url);
    ui.showToast('Projeto exportado');
  }

  _wireRender() {
    renderEngine.onProgress = (cur, total, status) => {
      // noop, toast handles
    };
    renderEngine.onComplete = (cur, total, res) => {};
  }
}

export const app = new App();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}
