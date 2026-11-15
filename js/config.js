export const CONFIG = {
  appName: 'ClipStudio',
  version: '1.0.0-phase1',
  dbName: 'ClipStudioDB',
  dbVersion: 1,
  stores: {
    media: 'media',
    projects: 'projects',
    settings: 'settings',
  },
  defaultAspectRatio: '9:16',
  defaultResolution: '720p',
  trackColors: {
    opening: '#4a1a6b',
    summary: '#1a4a6b',
    content: '#1a6b4a',
    closing: '#6b4a1a',
    audio: '#6b1a4a',
    graphics: '#4a6b1a',
  },
  tracks: [
    { id: 'opening', label: 'Abertura', color: '#4a1a6b' },
    { id: 'summary', label: 'Resumo', color: '#1a4a6b' },
    { id: 'content', label: 'Conteúdo', color: '#1a6b4a' },
    { id: 'closing', label: 'Encerramento', color: '#6b4a1a' },
    { id: 'audio', label: 'Áudio / Música', color: '#6b1a4a' },
    { id: 'graphics', label: 'Gráficos / Textos', color: '#4a6b1a' },
  ],
};

export function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':');
}

export function parseTime(str) {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

export function pxPerSecond(zoom) {
  // zoom is percentage; base is 100px per second at 100%
  return (zoom / 100) * 100;
}
