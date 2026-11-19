'use strict';

const get = id => document.getElementById(id);
const fileInput = get('file');
const drop = get('drop');
const preview = get('preview');
const download = get('download');
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d', { willReadFrequently: true });
const cellWidth = 6;
const cellHeight = 10;
const ramp = ' .,:;irsXA253hMHGS#9B&@';

let photo;
let filename;
let previewUrl;
let pendingRender;
let loadVersion = 0;

function escapeXml(value) {
  return value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
}

function makeSvg(pixels, columns, rows, options) {
  const { dark, invert, transparent, contrast } = options;
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const background = dark ? '#0c1018' : '#f5f7fc';
  const foreground = dark ? '#d6ffa0' : '#162617';
  const lines = [];

  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < columns; col++) {
      const index = 4 * (row * columns + col);
      const alpha = pixels[index + 3] / 255;
      const brightness = (pixels[index] * .2126 + pixels[index + 1] * .7152 + pixels[index + 2] * .0722) / 255;
      const tone = invert ? 1 - brightness : brightness;
      const density = Math.max(0, Math.min(1, ((dark ? tone : 1 - tone) - .5) * contrast + .5));
      line += ramp[Math.round(density * alpha * (ramp.length - 1))];
    }
    const visible = line.trimEnd();
    if (visible) {
      lines.push(`<text x="0" y="${row * cellHeight + 8}" textLength="${visible.length * cellWidth}" lengthAdjust="spacingAndGlyphs">${escapeXml(visible)}</text>`);
    }
  }

  const backdrop = transparent ? '' : `<rect width="${width}" height="${height}" fill="${background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="ASCII image">
<title>ASCII image</title>
${backdrop}
<g fill="${foreground}" font-family="ui-monospace, Consolas, monospace" font-size="10" xml:space="preserve">
${lines.join('\n')}
</g>
</svg>`;
}

function render() {
  const detail = Number(get('detail').value);
  const contrast = Number(get('contrast').value);
  const dark = get('theme').value === 'dark';
  get('detail-value').value = detail;
  get('contrast-value').value = contrast + '%';
  if (!photo) return;

  const aspect = photo.naturalWidth / photo.naturalHeight;
  const columns = Math.max(1, Math.min(detail, Math.round(350 * aspect * cellHeight / cellWidth)));
  const rows = Math.max(1, Math.min(350, Math.round(columns * cellWidth / cellHeight / aspect)));
  canvas.width = columns;
  canvas.height = rows;
  context.imageSmoothingQuality = 'high';
  context.drawImage(photo, 0, 0, columns, rows);
  const svg = makeSvg(context.getImageData(0, 0, columns, rows).data, columns, rows, {
    dark, contrast: contrast / 100, invert: get('invert').checked, transparent: get('transparent').checked,
  });
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  preview.src = previewUrl;
  preview.hidden = false;
  get('empty').hidden = true;
  get('stage').classList.toggle('light', !dark);
  get('dimensions').textContent = `${columns} columns × ${rows} rows`;
  download.disabled = false;
}

function scheduleRender() {
  cancelAnimationFrame(pendingRender);
  pendingRender = requestAnimationFrame(render);
}

async function load(file) {
  if (!file) return;
  const version = ++loadVersion;
  get('status').textContent = 'Loading image…';
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    if (version !== loadVersion) return;
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
    photo = image;
    filename = file.name.replace(/\.[^.]+$/, '') || 'image';
    render();
    get('status').textContent = file.name;
  } catch {
    if (version === loadVersion) get('status').textContent = 'Could not read that image. Try a PNG, JPEG, or WebP file.';
  } finally {
    URL.revokeObjectURL(url);
  }
}

fileInput.addEventListener('change', () => {
  load(fileInput.files[0]);
  fileInput.value = '';
});
drop.addEventListener('dragover', event => {
  event.preventDefault();
  drop.classList.add('active');
});
drop.addEventListener('dragleave', () => drop.classList.remove('active'));
drop.addEventListener('drop', event => {
  event.preventDefault();
  drop.classList.remove('active');
  load(event.dataTransfer.files[0]);
});
for (const id of ['detail', 'contrast', 'theme', 'invert', 'transparent']) {
  get(id).addEventListener('input', scheduleRender);
}
download.addEventListener('click', () => {
  cancelAnimationFrame(pendingRender);
  render();
  const link = document.createElement('a');
  link.href = previewUrl;
  link.download = filename + '-ascii.svg';
  document.body.append(link);
  link.click();
  link.remove();
});
