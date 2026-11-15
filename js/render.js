import { formatTime } from './config.js';

let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;
let isAborting = false;

export class RenderEngine {
  constructor() {
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
    this.isRendering = false;
    this.queue = [];
    this.currentIndex = 0;
    this.abortController = null;
  }

  async loadFFmpeg() {
    if (ffmpegLoaded) return ffmpeg;
    if (ffmpegLoading) {
      return new Promise((resolve, reject) => {
        const iv = setInterval(() => {
          if (!ffmpegLoading) {
            clearInterval(iv);
            if (ffmpegLoaded) resolve(ffmpeg);
            else reject(new Error('FFmpeg.wasm falhou ao carregar'));
          }
        }, 200);
        setTimeout(() => { clearInterval(iv); reject(new Error('Timeout carregando FFmpeg.wasm')); }, 120000);
      });
    }
    ffmpegLoading = true;
    try {
      const { createFFmpeg, fetchFile } = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.12.1/dist/esm/index.js');
      ffmpeg = createFFmpeg({ log: true });
      ffmpeg.setProgress(({ ratio }) => {
        if (this.onProgress) this.onProgress(ratio);
      });
      await ffmpeg.load();
      ffmpegLoaded = true;
      ffmpegLoading = false;
      return ffmpeg;
    } catch (e) {
      ffmpegLoading = false;
      ffmpegLoaded = false;
      throw e;
    }
  }

  async renderEpisode(episode, mediaMap) {
    isAborting = false;
    this.abortController = new AbortController();
    try {
      const ff = await this.loadFFmpeg();
      const source = mediaMap.get(episode.sourceMediaId);
      if (!source || !source.file) throw new Error('Arquivo fonte não disponível localmente');

      // Nome de saída
      const outputName = `Episodio_${String(episode.number).padStart(2, '0')}.mp4`;

      // Escrever arquivo fonte no MEMORY FS do ffmpeg.wasm
      await ff.fs('writeFile', 'input.mp4', await this._fileToBuffer(source.file));

      // Construir lista de segmentos da estrutura do episódio
      // Estrutura: abertura → resumo → conteúdo → fechamento
      const segments = []; // { inputName, start, duration }

      // Abertura
      if (episode.opening && episode.opening.duration > 0 && episode.opening.mediaId) {
        const om = mediaMap.get(episode.opening.mediaId) || source;
        if (om && om.file) {
          const oname = `opening_${episode.id}.mp4`;
          await ff.fs('writeFile', oname, await this._fileToBuffer(om.file));
          segments.push({ name: oname, start: episode.opening.start || 0, duration: episode.opening.duration });
        }
      }

      // Resumo
      if (episode.summary && episode.summary.duration > 0 && episode.summary.mediaId) {
        const sm = mediaMap.get(episode.summary.mediaId) || source;
        if (sm && sm.file) {
          const sname = `summary_${episode.id}.mp4`;
          await ff.fs('writeFile', sname, await this._fileToBuffer(sm.file));
          segments.push({ name: sname, start: episode.summary.start || 0, duration: episode.summary.duration });
        }
      }

      // Conteúdo principal (do vídeo fonte)
      segments.push({ name: 'input.mp4', start: episode.sourceStart, duration: episode.duration });

      // Fechamento
      if (episode.closing && episode.closing.duration > 0 && episode.closing.mediaId) {
        const cm = mediaMap.get(episode.closing.mediaId) || source;
        if (cm && cm.file) {
          const cname = `closing_${episode.id}.mp4`;
          await ff.fs('writeFile', cname, await this._fileToBuffer(cm.file));
          segments.push({ name: cname, start: episode.closing.start || 0, duration: episode.closing.duration });
        }
      }

      // Dimensões
      const dims = this._getDimensions(episode);
      const vf = this._buildVideoFilter(episode, dims);

      // Montar filtro complexo: cortar cada segmento, escalar, concatenar
      const inputs = [];
      const filterParts = [];
      let concatInputs = '';
      let idx = 0;

      for (const seg of segments) {
        const inLabel = `in${idx}`;
        inputs.push('-i', seg.name);
        // Cortar segmento: select=between(t\,start\,start+dur), setpts, scale, pad
        const start = seg.start;
        const end = start + seg.duration;
        const trim = `trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
        const scale = `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2`;
        filterParts.push(`[${idx}:v]${trim},${scale}[v${idx}]`);
        // Áudio
        filterParts.push(`[${idx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${idx}]`);
        concatInputs += `[v${idx}][a${idx}]`;
        idx++;
      }

      // Concatenação
      filterParts.push(`${concatInputs}concat=n=${segments.length}:v=1:a=1[outv][outa]`);

      const filterComplex = filterParts.join(';');

      const args = [
        ...inputs,
        '-filter_complex', filterComplex,
        '-map', '[outv]', '-map', '[outa]',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
        outputName,
      ];

      // Executar com monitoramento de progresso via ffmpeg.stderr não disponível; usamos setProgress global
      await ff.run(...args);

      const data = ff.fs('readFile', outputName);
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      return { success: true, url, blob, name: outputName };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      this.abortController = null;
    }
  }

  async renderAll(episodes, mediaMap) {
    this.queue = [...episodes];
    this.currentIndex = 0;
    this.isRendering = true;
    const results = [];
    for (const ep of this.queue) {
      if (!this.isRendering) break;
      if (this.onProgress) this.onProgress(ep.number, this.queue.length, 'rendering');
      const res = await this.renderEpisode(ep, mediaMap);
      results.push({ episode: ep, ...res });
      this.currentIndex++;
      if (this.onComplete) this.onComplete(ep.number, this.queue.length, res);
    }
    this.isRendering = false;
    return results;
  }

  cancel() {
    this.isRendering = false;
    this.queue = [];
  }

  _getDimensions(episode) {
    const ar = episode.aspectRatio || '9:16';
    const res = episode.resolution || '720p';
    const map = { '480p': 480, '720p': 720, '1080p': 1080, '1440p': 1440, '2160p': 2160 };
    const height = map[res] || 720;
    const [w, h] = ar.split(':').map(Number);
    const width = w && h ? Math.round((height * w) / h) : height * (9 / 16);
    return { width, height };
  }

  _buildVideoFilter(episode, dims) {
    // Filtro de enquadramento baseado no cropMode
    const mode = episode.cropMode || 'center';
    const { width, height } = dims;
    let base = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    if (mode === 'fill-blur') {
      base = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    }
    return base;
  }

  async _fileToBuffer(file) {
    const ab = await file.arrayBuffer();
    return new Uint8Array(ab);
  }
}

export const renderEngine = new RenderEngine();

export function ffmpegAvailable() {
  return ffmpegLoaded;
}
