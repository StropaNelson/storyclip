import { CONFIG } from './config.js';

export const ASPECT_RATIOS = [
  { id: '9:16', label: '9:16 (Reels/TikTok/Shorts)', w: 9, h: 16 },
  { id: '16:9', label: '16:9 (YouTube/Horizontal)', w: 16, h: 9 },
  { id: '1:1', label: '1:1 (Quadrado)', w: 1, h: 1 },
  { id: '4:5', label: '4:5 (Feed vertical)', w: 4, h: 5 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: 'custom', label: 'Personalizado', w: null, h: null },
];

export const RESOLUTIONS = [
  { id: '480p', label: '480p', height: 480 },
  { id: '720p', label: '720p', height: 720 },
  { id: '1080p', label: '1080p', height: 1080 },
  { id: '1440p', label: '1440p', height: 1440 },
  { id: '2160p', label: '2160p', height: 2160 },
];

export class FormatConfig {
  constructor() {
    this.aspectRatio = CONFIG.defaultAspectRatio;
    this.resolution = CONFIG.defaultResolution;
    this.cropMode = 'center'; // center | fit | fill-blur | fill-solid | manual
    this.manualPosition = { x: 0.5, y: 0.5 };
    this.backgroundColor = '#000000';
    this.quality = 'medium'; // low, medium, high
    this.bitrate = null;
  }

  getTargetDimensions() {
    const res = RESOLUTIONS.find((r) => r.id === this.resolution);
    if (!res) return { width: 720, height: 1280 };
    const ar = ASPECT_RATIOS.find((a) => a.id === this.aspectRatio);
    let width = res.height;
    if (ar && ar.w && ar.h) {
      width = Math.round((res.height * ar.w) / ar.h);
    }
    return { width, height: res.height };
  }

  toObject() {
    return {
      aspectRatio: this.aspectRatio,
      resolution: this.resolution,
      cropMode: this.cropMode,
      manualPosition: { ...this.manualPosition },
      backgroundColor: this.backgroundColor,
      quality: this.quality,
      bitrate: this.bitrate,
    };
  }

  fromObject(obj) {
    this.aspectRatio = obj.aspectRatio || this.aspectRatio;
    this.resolution = obj.resolution || this.resolution;
    this.cropMode = obj.cropMode || this.cropMode;
    this.manualPosition = obj.manualPosition || { x: 0.5, y: 0.5 };
    this.backgroundColor = obj.backgroundColor || this.backgroundColor;
    this.quality = obj.quality || this.quality;
    this.bitrate = obj.bitrate || null;
  }
}

export const formatConfig = new FormatConfig();
