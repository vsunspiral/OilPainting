import { FluidSimulation } from './fluid';
import './style.css';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const dropZone = document.getElementById('drop-zone')!;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const controls = document.getElementById('controls')!;

const brushSize = document.getElementById('brush-size') as HTMLInputElement;
const smearStrength = document.getElementById('smear-strength') as HTMLInputElement;
const impasto = document.getElementById('impasto') as HTMLInputElement;

const sim = new FluidSimulation(canvas);
sim.start();

function setLoaded(loaded: boolean) {
  dropZone.classList.toggle('has-image', loaded);
  resetBtn.disabled = !loaded;
  downloadBtn.disabled = !loaded;
  controls.hidden = !loaded;
}

async function loadFile(file: File) {
  if (!file.type.startsWith('image/')) return;

  const url = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  await sim.loadImage(img);
  URL.revokeObjectURL(url);
  setLoaded(true);
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
});

dropZone.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('.btn')) return;
  if (!dropZone.classList.contains('has-image')) fileInput.click();
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

resetBtn.addEventListener('click', () => sim.reset());
downloadBtn.addEventListener('click', () => sim.download());

brushSize.addEventListener('input', () => {
  sim.brushRadius = parseFloat(brushSize.value);
});

smearStrength.addEventListener('input', () => {
  sim.setConfig({ smearStrength: parseFloat(smearStrength.value) });
});

impasto.addEventListener('input', () => {
  sim.setConfig({ impasto: parseFloat(impasto.value) });
});

sim.brushRadius = parseFloat(brushSize.value);

// Demo landscape generated on a canvas (avoids SVG loading quirks)
function createDemoImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 600;
  const ctx = c.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#1a3a5c');
  sky.addColorStop(0.55, '#c96b3a');
  sky.addColorStop(1, '#e8a04a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.fillStyle = '#f4d06f';
  ctx.beginPath();
  ctx.arc(700, 100, 50, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2d5016';
  ctx.beginPath();
  ctx.moveTo(0, 380);
  ctx.bezierCurveTo(200, 320, 400, 360, 900, 340);
  ctx.lineTo(900, 600);
  ctx.lineTo(0, 600);
  ctx.fill();

  ctx.fillStyle = '#4a7c31';
  ctx.beginPath();
  ctx.moveTo(0, 430);
  ctx.bezierCurveTo(250, 390, 500, 420, 900, 400);
  ctx.lineTo(900, 600);
  ctx.lineTo(0, 600);
  ctx.fill();

  ctx.fillStyle = '#6b9e4e';
  ctx.beginPath();
  ctx.moveTo(0, 480);
  ctx.bezierCurveTo(300, 440, 600, 470, 900, 460);
  ctx.lineTo(900, 600);
  ctx.lineTo(0, 600);
  ctx.fill();

  ctx.fillStyle = '#8b4513';
  ctx.fillRect(400, 270, 90, 130);
  ctx.fillStyle = '#5c2e0e';
  ctx.beginPath();
  ctx.moveTo(370, 270);
  ctx.lineTo(445, 190);
  ctx.lineTo(520, 270);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 215, 0, 0.75)';
  ctx.fillRect(425, 330, 28, 45);
  ctx.fillStyle = 'rgba(135, 206, 235, 0.65)';
  ctx.fillRect(465, 310, 22, 28);

  return c;
}

async function loadDemo() {
  try {
    await sim.loadImage(createDemoImage());
    setLoaded(true);
  } catch (err) {
    console.error('Failed to load demo image', err);
  }
}

void loadDemo();
