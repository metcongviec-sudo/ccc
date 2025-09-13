const SafeMode = require('./safe.js');

module.exports.config = {
  name: 'safemode',
  aliases: ['safe', 'mod', 'moderation'],
  version: '1.0.0',
  role: 1,
  author: 'Cascade',
  description: 'Bật/Tắt hoặc xem trạng thái Chế độ An toàn (lọc nội dung nhạy cảm)',
  category: 'Quản trị',
  usage: 'safemode [on|off|status]',
  cooldowns: 2
};

function isBotAdminOrOwner(uid) {
  try {
    const cfg = global?.config || {};
    const admins = (Array.isArray(cfg.admin_bot) ? cfg.admin_bot : (cfg.admin_bot ? [cfg.admin_bot] : [])).map(String);
    const owners = (Array.isArray(cfg.owner_bot) ? cfg.owner_bot : (cfg.owner_bot ? [cfg.owner_bot] : [])).map(String);
    return admins.includes(String(uid)) || owners.includes(String(uid));
  } catch { return false; }
}

module.exports.run = async function ({ api, event, args }) {
  const { threadId, type, data } = event;
  const action = (args[0] || '').toLowerCase();
  const uid = data?.uidFrom || event?.authorId;

  // Cho phép xem status cho mọi người; thay đổi trạng thái chỉ dành cho admin/chủ bot
  if (!['status', 'trangthai', 'tt', ''].includes(action)) {
    if (!isBotAdminOrOwner(uid)) {
      return api.sendMessage('❌ Bạn không có quyền thay đổi Chế độ An toàn.', threadId, type);
    }
  }

  if (['on', 'bật', 'bat', 'enable'].includes(action)) {
    SafeMode.setSafeMode(true);
    return api.sendMessage('🛡️ ĐÃ BẬT Chế độ An toàn.', threadId, type);
  }

  if (['off', 'tắt', 'tat', 'disable'].includes(action)) {
    SafeMode.setSafeMode(false);
    return api.sendMessage('🛡️ ĐÃ TẮT Chế độ An toàn.', threadId, type);
  }

  const status = SafeMode.getSafeMode() ? '🟢 BẬT' : '🔴 TẮT';
  return api.sendMessage(`🛡️ Trạng thái Chế độ An toàn: ${status}\nDùng: safemode on | off`, threadId, type);
};
