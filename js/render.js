import { formatTime } from './config.js';

let ffmpeg = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

export class RenderEngine {
  constructor() {
    this.onProgress = null;
    this.onComplete = null;
    this.onError = null;
    this.isRendering = false;
    this.queue = [];
    this.currentIndex = 0;
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
        setTimeout(() => { clearInterval(iv); reject(new Error('Timeout carregando FFmpeg.wasm')); }, 60000);
      });
    }
    ffmpegLoading = true;
    try {
      const { createFFmpeg, fetchFile } = await import('https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/esm/index.js');
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
    try {
      const ff = await this.loadFFmpeg();
      const inputName = 'input.mp4';
      const outputName = `Episodio_${String(episode.number).padStart(2, '0')}.mp4`;

      // Registrar arquivo fonte
      const source = mediaMap.get(episode.sourceMediaId);
      if (!source || !source.file) throw new Error('Arquivo fonte não disponível localmente');
      ff.fs('writeFile', inputName, await this._fileToBuffer(source.file));

      const dims = this._getDimensions(episode);
      const vf = this._buildVideoFilter(episode, dims);

      const args = [
        '-i', inputName,
        '-ss', episode.sourceStart.toString(),
        '-t', episode.duration.toString(),
        '-vf', vf,
        '-s', `${dims.width}x${dims.height}`,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', episode.quality || '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
        outputName,
      ];

      await ff.run(...args);

      const data = ff.fs('readFile', outputName);
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      return { success: true, url, blob, name: outputName };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async renderAll(episodes, mediaMap) {
    this.queue = [...episodes];
    this.currentIndex = 0;
    this.isRendering = true;
    const results = [];
    for (const ep of this.queue) {
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
    const { width, height } = dims;
    const mode = episode.cropMode || 'center';
    let filter = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;
    if (mode === 'fill-blur') {
      filter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=luma_radius=min(h,w)/20:luma_power=1:chroma_radius=min(cw,ch)/20:chroma_power=1[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
    }
    return filter;
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
