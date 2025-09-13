const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { processVideo } = require("../../utils/index");

// Usage tracking (cục bộ cho module này)
const __vdgirlUsage = new Map();
function __incUsageLocal(service, userId) {
  const key = `${service}:${userId}`;
  const n = (__vdgirlUsage.get(key) || 0) + 1;
  __vdgirlUsage.set(key, n);
  return n;
}

// Lấy nhãn cấp bậc dựa trên global.config
function __getRoleLabelLocal(userId) {
  try {
    const cfg = global?.config || {};
    const ownersRaw = cfg?.owner_bot;
    const adminsRaw = cfg?.admin_bot;
    const owners = Array.isArray(ownersRaw) ? ownersRaw : (ownersRaw ? [ownersRaw] : []);
    const admins = Array.isArray(adminsRaw) ? adminsRaw : (adminsRaw ? [adminsRaw] : []);
    if (owners.map(String).includes(String(userId))) return 'Chủ nhân';
    if (admins.map(String).includes(String(userId))) return 'Admin bot';
    return 'Thành viên';
  } catch { return 'Thành viên'; }
}

// Định dạng bảng thông tin dịch vụ theo chuẩn mới
function __formatPanel({ service, userName, userId, role, usage, notify = 'Không có', howToUse }) {
  const lines = [];
  lines.push('Bảng thông tin dịch vụ');
  lines.push(`ng dùng: ${userName || 'Không xác định'}`);
  lines.push(`dịch vụ : ${service || 'Không xác định'}`);
  lines.push(`id ng dùng: ${userId || 'Chưa xác định'}`);
  lines.push(`cấp bậc: ${role || 'Thành viên'}`);
  lines.push(`số lượt dùng: ${typeof usage !== 'undefined' && usage !== null ? usage : 0}`);
  lines.push(`key đã lấy : 0`);
  lines.push(`số key đã lấy : 0`);
  lines.push(`thông báo: ${notify || 'Không có'}`);
  if (typeof howToUse === 'string') {
    lines.push(`cách dùng: ${howToUse}`);
  }
  return lines.join('\n');
}

const vdgirl = require('../../assets/vdgirl.json');

module.exports.config = {
  name: 'vdgirl',
  aliases: ['vdgai'],
  version: '1.0.2',
  role: 0,
  author: 'ShinTHL09',
  description: 'Xem video gái ngẫu nhiên',
  category: 'Giải trí',
  usage: 'vdgirl',
  cooldowns: 2
};

module.exports.run = async ({ args, event, api, Users }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom;

  const tempDir = path.join(__dirname, 'temp');
  const filePath = path.join(tempDir, 'gai.mp4');

  try {
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const link = vdgirl[Math.floor(Math.random() * vdgirl.length)];

    const res = await axios.get(link, {
      responseType: "arraybuffer",
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://imgur.com/',
        'Accept': 'video/*,*/*;q=0.8'
      }
    });

    fs.writeFileSync(filePath, res.data);

    const videoData = await processVideo(filePath, threadId, type);

    // Lấy tên người dùng để thêm thông tin dịch vụ
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (_) {}

    const usage = __incUsageLocal('bonz video gái', senderId);
    const role = __getRoleLabelLocal(senderId);
    const msgText = __formatPanel({
      service: 'bonz video gái',
      userName,
      userId: senderId,
      role,
      usage,
      notify: '🎥 Video gái ngẫu nhiên',
      howToUse: 'Gửi video gái ngẫu nhiên. Cú pháp: bonz video gái'
    });

    await api.sendVideo({
      videoUrl: videoData.videoUrl,
      thumbnailUrl: videoData.thumbnailUrl,
      duration: videoData.metadata.duration,
      width: videoData.metadata.width,
      height: videoData.metadata.height,
      msg: msgText,
      ttl: 60000
    }, threadId, type);
  } catch (err) {
    console.error("Lỗi xử lý video:", err.message);
    const usage = __incUsageLocal('bonz video gái', senderId || 'unknown');
    const role = __getRoleLabelLocal(senderId || 'unknown');
    const msgText = __formatPanel({
      service: 'bonz video gái',
      userName: 'Người dùng',
      userId: senderId || 'unknown',
      role,
      usage,
      notify: '❌ Không thể tải video'
    });
    await api.sendMessage(msgText, threadId, type);
  }
};
