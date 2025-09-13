You said:
const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports.config = {
  name: 'bonzvideotrai',
  aliases: ['videotrai', 'video-trai', 'trai'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Gửi video trai từ danh sách có sẵn',
  category: 'Giải trí',
  usage: 'bonzvideotrai [số thứ tự] (tùy chọn)',
  cooldowns: 2,
  dependencies: {}
};

const VIDEO_LINKS = [
  'https://files.catbox.moe/fppnpa.mp4',
  'https://files.catbox.moe/5dlssp.mp4',
  'https://files.catbox.moe/t593xz.mp4',
  'https://files.catbox.moe/u01myx.mp4',
  'https://files.catbox.moe/q79o11.mp4',
  'https://files.catbox.moe/bshavh.mp4',
  'https://files.catbox.moe/yz3mtt.mp4',
  'https://files.catbox.moe/1r7lpa.mp4',
  'https://files.catbox.moe/63o5lg.mp4',
  'https://files.catbox.moe/wejwvv.mp4',
  'https://files.catbox.moe/ph129v.mp4',
  'https://files.catbox.moe/7ubgz9.mp4',
  'https://files.catbox.moe/467y86.mp4',
  'https://files.catbox.moe/may5uk.mp4',
  'https://files.catbox.moe/fshafx.mp4',
  'https://files.catbox.moe/m4aots.mp4',
  'https://files.catbox.moe/uiipb0.mp4',
  'https://files.catbox.moe/h223r4.mp4'
];

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;

  // Chọn index: nếu người dùng nhập số, dùng số đó, otherwise random
  let index = -1;
  const num = parseInt(args[0], 10);
  if (!isNaN(num) && num >= 1 && num <= VIDEO_LINKS.length) {
    index = num - 1;
  } else {
    index = Math.floor(Math.random() * VIDEO_LINKS.length);
  }

  const url = VIDEO_LINKS[index];
  const filename = videotrai_${index + 1}_${Date.now()}.mp4;
  const filePath = path.join(__dirname, 'temp', filename);

  // Thử gửi trực tiếp bằng URL trước (thường sẽ hiển thị dạng video, không phải file)
  try {
    const caption = 🎬 Video trai #${index + 1}/${VIDEO_LINKS.length};
    const urlPayloads = [
      { msg: caption, attachments: [url] },
      { msg: caption, attachments: url },
      { msg: caption, video: url },
      { msg: caption, attachments: [url], asVideo: true },
      { msg: caption, media: url },
    ];
    for (const p of urlPayloads) {
      try { await api.sendMessage(p, threadId, type); return; } catch (_) {}
    }
  } catch (_) {}

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(filePath, response.data);

    const caption = 🎬 Video trai #${index + 1}/${VIDEO_LINKS.length};

    const payloads = [
      { msg: caption, attachments: [filePath] },
      { msg: caption, attachments: filePath },
      { msg: caption, video: filePath },
      { msg: caption, attachments: [filePath], asVideo: true },
    ];

    let sent = false;
    for (const p of payloads) {
      try { await api.sendMessage(p, threadId, type); sent = true; break; } catch (_) {}
    }

    if (!sent) {
      // Fallback cuối: gửi như file đính kèm bình thường
      await api.sendMessage({ msg: caption, attachments: [filePath] }, threadId, type);
    }

    // Xóa file sau khi gửi
    try { fs.unlinkSync(filePath); } catch {}
  } catch (err) {
    console.error('Lỗi tải/gửi video:', err?.message || err);
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
    api.sendMessage('❌ Không thể tải hoặc gửi video. Vui lòng thử lại.', threadId, type);
  }
}; 