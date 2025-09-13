const axios = require('axios');
const fs = require("fs");
const path = require('path');

module.exports.config = {
  name: 'bonzqrheart',
  aliases: ['traitim', 'qrheart', 'trai-tim', 'trai_tim', 'trái_tim', 'trautim'],
  version: '1.0.0',
  role: 0,
  author: 'ShinTHL09',
  description: 'Tạo mã QR trái tim từ văn bản',
  category: 'Tiện ích',
  usage: 'bonzqrheart <nội dung> - <chữ mô tả>',
  cooldowns: 2,
  dependencies: {}
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;

  // Lấy tên người dùng
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  // Xác định cấp bậc từ cấu hình global (owner > admin > thành viên)
  const cfg = global?.config || {};
  const admins = Array.isArray(cfg.admin_bot) ? cfg.admin_bot.map(String) : [];
  const ownersConf = cfg.owner_bot;
  let owners = [];
  if (Array.isArray(ownersConf)) owners = ownersConf.map(String);
  else if (typeof ownersConf === 'string' && ownersConf.trim()) owners = [ownersConf.trim()];
  let roleLabel = 'Thành viên';
  if (owners.includes(String(senderId))) roleLabel = 'Toàn quyền';
  else if (admins.includes(String(senderId))) roleLabel = 'Quản trị';

  // Đếm số lượt dùng theo người dùng (in-memory)
  global.__usage_qrheart = global.__usage_qrheart || {};
  global.__usage_qrheart[String(senderId)] = (global.__usage_qrheart[String(senderId)] || 0) + 1;
  const usageCount = global.__usage_qrheart[String(senderId)] || 0;

  // Formatter bảng thông tin dịch vụ (cục bộ)
  const formatServiceInfo = ({ notify, howToUse }) => [
    'Bảng thông tin dịch vụ',
    `ng dùng: ${userName}`,
    'dịch vụ: bonzqrheart',
    `id ng dùng: ${senderId || 'Chưa xác định'}`,
    `cấp bậc: ${roleLabel}`,
    `số lượt dùng: ${usageCount}`,
    `key đã lấy : 0`,
    `số key đã lấy : 0`,
    `thông báo: ${notify || 'Không có'}`,
    `cách dùng: ${howToUse || 'bonzqrheart <nội dung> - <caption>'}`
  ].join('\n');

  const input = args.join(' ').split('-');
  const text = input[0]?.trim();
  const caption = input[1]?.trim();

  if (!text) {
    const header = formatServiceInfo({
      notify: 'Hướng dẫn sử dụng',
      howToUse: 'bonzqrheart <nội dung> - <caption>'
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    const url = `https://api.zeidteam.xyz/image-generator/qrcode-heart?text=${encodeURIComponent(text)}&caption=${encodeURIComponent(caption)}`;
    const res = await axios.get(url, { responseType: 'arraybuffer' });

    const filePath = path.join(__dirname, 'temp', `qrcode-heart_${Date.now()}.png`);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(filePath, res.data);

    const header = formatServiceInfo({
      notify: 'Thành công',
      howToUse: 'bonzqrheart <nội dung> - <caption>'
    });
    await api.sendMessage({ msg: `${header}\n\nMã QR trái tim của bạn nè:`, attachments: filePath }, threadId, type);
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error(error);
    const header = formatServiceInfo({
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      howToUse: 'bonzqrheart <nội dung> - <caption>'
    });
    api.sendMessage(header, threadId, type);
  }
};
