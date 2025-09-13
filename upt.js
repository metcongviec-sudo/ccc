const os = require('os');
const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const moment = require('moment-timezone');
const { createCanvas } = require('canvas');
const { networkInterfaces } = require('os');

module.exports.config = {
  name: 'upt',
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09, GwenDev',
  description: 'Hiển thị thời gian hoạt động của bot bằng Canvas',
  category: 'Hệ thống',
  usage: 'upt',
  cooldowns: 2,
  dependencies: {
    "canvas": ""
  }
};

// author @GwenDev
const CACHE_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function getIpAddress() {
  return '127.0.0.1';
}


function getSystemRAMUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    totalMem: Math.round(total / 1024 / 1024),
    usedMem: Math.round((total - free) / 1024 / 1024),
    freeMem: Math.round(free / 1024 / 1024)
  };
}

function getHeapMemoryUsage() {
  const heap = process.memoryUsage();
  return {
    heapTotal: Math.round(heap.heapTotal / 1024 / 1024),
    heapUsed: Math.round(heap.heapUsed / 1024 / 1024),
    external: Math.round(heap.external / 1024 / 1024),
    rss: Math.round(heap.rss / 1024 / 1024)
  };
}

function getFilteredUptime() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / (24 * 60 * 60));
  const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((uptime % (60 * 60)) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

async function getDependencyCount() {
  try {
    const json = await fs.promises.readFile(path.join(__dirname, '..','..', 'package.json'), 'utf8');
    const pkg = JSON.parse(json);
    return Object.keys(pkg.dependencies || {}).length;
  } catch {
    return -1;
  }
}

async function getCPUUsage() {
  const start = process.cpuUsage();
  await new Promise(res => setTimeout(res, 100));
  const end = process.cpuUsage(start);
  return ((end.user + end.system) / 1000000).toFixed(1);
}

function wrapText(ctx, text, maxWidth, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = words[0] || "";
  for (let i = 1; i < words.length; i++) {
    const testLine = line + " " + words[i];
    if (ctx.measureText(testLine).width > maxWidth) {
      lines.push(line);
      line = words[i];
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  return lines;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function drawSystemCanvas(data) {
  const width = 1050, height = 720, padding = 55, radius = 38;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, '#222C3E');
  bgGradient.addColorStop(1, '#181d28');
  ctx.fillStyle = bgGradient;
  ctx.beginPath();
ctx.rect(0, 0, width, height); // fill toàn bộ nền
ctx.fill();

  ctx.fill();

  ctx.fillStyle = '#232b3e';
  roundedRect(ctx, padding, padding - 28, width - 2 * padding, 70, 18);
  ctx.fill();

  const lights = ['#ff5f57', '#febb2e', '#28c840'];
  lights.forEach((color, i) => {
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(padding + 34 + i * 40, padding + 9, 12, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.font = "bold 36px Arial";
  ctx.fillStyle = "#F3F4FA";
  ctx.textAlign = "center";
  ctx.fillText("SYSTEM DASHBOARD", width / 2, padding + 29);

  ctx.strokeStyle = "#47b7f5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding + 50, padding + 63);
  ctx.lineTo(width - padding - 50, padding + 63);
  ctx.stroke();

  ctx.globalAlpha = 0.09;
  ctx.fillStyle = "#fff";
  roundedRect(ctx, padding + 6, padding + 74, width - 2 * padding - 12, height - 2 * padding - 56, 24);
  ctx.fill();
  ctx.globalAlpha = 1;

  const labelFont = "bold 23px Arial";
  const valueFont = "bold 23px Arial";
  const labelCol = "#59C0FF";
  const valueCol = "#F7F7F7";
  const labelCol2 = "#FEAD3A";
  const y0 = padding + 110;
  const lineH = 47;
  const colGap = 68;
  const colWidth = (width - 2 * padding - colGap) / 2;
  const leftX = padding + 36;
  const rightX = leftX + colWidth + colGap;

  const left = [
    { label: "Thời gian:", value: data.nowTime, color: labelCol },
    { label: "Uptime:", value: data.uptime, color: labelCol2 },
    { label: "Prefix:", value: data.prefix, color: labelCol },
    { label: "Package:", value: `${data.packages} packages`, color: labelCol },
    { label: "Trạng thái:", value: data.status, color: labelCol },
    { label: "OS:", value: data.osInfo, color: labelCol },
    { label: "IP:", value: data.ip, color: labelCol2 }
  ];
  let y = y0;
  for (const row of left) {
    ctx.font = labelFont;
    ctx.fillStyle = row.color;
    ctx.textAlign = "left";
    ctx.fillText(row.label, leftX, y);
    ctx.font = valueFont;
    ctx.fillStyle = valueCol;
    const valueX = leftX + 200;
    if (row.label === "OS:" && ctx.measureText(row.value).width > colWidth - 140) {
      const lines = wrapText(ctx, row.value, colWidth - 140, valueFont);
      lines.forEach((line, i) => {
        ctx.fillText(line, valueX, y + i * lineH * 0.8);
      });
      y += (lines.length - 1) * lineH * 0.8;
    } else {
      ctx.fillText(row.value, valueX, y);
    }
    y += lineH;
  }

  const right = [
    { label: "CPU core(s):", value: data.cpuCores, color: labelCol },
    { label: "CPU Used:", value: `${data.cpuUsage}%`, color: labelCol2 },
    { label: "RAM:", value: `${data.ram.usedMem}MB / ${data.ram.totalMem}MB`, color: labelCol },
    { label: "RAM free:", value: `${(data.ram.freeMem / 1024).toFixed(2)} GB`, color: labelCol },
    { label: "Heap tổng:", value: `${data.heap.heapTotal}MB`, color: labelCol },
    { label: "Heap dùng:", value: `${data.heap.heapUsed}MB`, color: labelCol2 },
    { label: "Heap ngoài:", value: `${data.heap.external}MB`, color: labelCol },
    { label: "RSS:", value: `${data.heap.rss}MB`, color: labelCol },
    { label: "Ping:", value: `${data.ping} ms`, color: labelCol }
  ];
  y = y0;
  for (const row of right) {
    ctx.font = labelFont;
    ctx.fillStyle = row.color;
    ctx.fillText(row.label, rightX, y);
    ctx.font = valueFont;
    ctx.fillStyle = valueCol;
    ctx.fillText(String(row.value), rightX + 180, y);
    y += lineH;
  }

  const filePath = path.join(CACHE_DIR, `upt_${Date.now()}.png`);
  const out = fs.createWriteStream(filePath);
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  await new Promise(resolve => out.on("finish", resolve));
  return filePath;
}


module.exports.run = async ({ event, api, args }) => {
    const start = Date.now();
    const ram = getSystemRAMUsage();
    const heap = getHeapMemoryUsage();
    const uptime = getFilteredUptime();
    const packages = await getDependencyCount();
    const cpuUsage = await getCPUUsage();
    const ping = Date.now() - start;
    const status = ping < 200 ? "Mượt mà" : ping < 800 ? "Bình thường" : "Lag";
    const nowTime = moment().tz("Asia/Ho_Chi_Minh").format("HH:mm:ss | DD/MM/YYYY");
    const osInfo = `${os.type()} ${os.release()} (${os.arch()})`;
    const ip = getIpAddress();
    const prefix = global.config?.prefix || ".";

    const imagePath = await drawSystemCanvas({
      ram, heap, uptime, packages, cpuUsage, ping,
      status, nowTime, osInfo, ip, prefix,
      cpuCores: os.cpus().length
    });

    await api.sendMessage({
      msg: '',
      attachments: [imagePath]
    }, event.threadId, event.type);

    fs.unlinkSync(imagePath);
  }
