const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { ThreadType } = require('zca-js');

module.exports.config = {
  name: 'thattinh',
  aliases: ['thất tình', 'that_tinh', 'thatinh', 'that-tinh'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Gửi ngẫu nhiên những câu quote/ảnh thất tình',
  category: 'Giải trí',
  usage: 'bonz thất tình | thattinh',
  cooldowns: 3
};

const QUOTES = [
  'Có những nỗi buồn không tên, chỉ biết im lặng và để nó trôi qua...',
  'Thương một người không thương mình là vết thương sâu nhất.',
  'Hóa ra chúng ta chỉ lướt qua đời nhau như cơn gió.',
  'Cũ rồi, cảm xúc ấy... nhưng mỗi lần nhớ lại vẫn đau như lần đầu.',
  'Em ổn, thật đấy. Chỉ là đôi khi tim nhói một chút khi nhớ về anh.',
  'Người đến thì tình nồng, người đi thì lòng trống rỗng.',
  'Có những hẹn ước chỉ để lại trong lòng, không thể trở thành tương lai.',
  'Buông tay không phải vì hết yêu, chỉ là không thể giữ.',
  'Thất tình không đáng sợ, đáng sợ là không còn tin vào tình yêu.',
  'Giữa phố đông người, vẫn cứ thấy mình lẻ loi.'
];

const IMAGES = [
  // Một vài ảnh minh họa nhẹ nhàng (jpeg/png/gif)
  'https://i.postimg.cc/jjbXJ9tC/sad1.jpg',
  'https://i.postimg.cc/7LQX9JwN/sad2.jpg',
  'https://i.postimg.cc/9f9q3P1M/sad3.jpg',
  'https://i.postimg.cc/90M05mrt/sad4.jpg'
];

module.exports.run = async ({ api, event }) => {
  const { threadId, type } = event;

  // Lấy quote bằng AI, fallback sang QUOTES nếu lỗi
  let quote = '';
  try {
    const uid = event?.data?.uidFrom || event?.authorId || '';
    let displayName = '';
    try {
      const info = await api.getUserInfo(uid);
      displayName = info?.changed_profiles?.[uid]?.displayName || '';
    } catch {}
    const basePrompt = `Viết MỘT câu quote NGẮN (<= 160 ký tự), giọng buồn nhưng tích cực, về thất tình bằng tiếng Việt${displayName ? `, xưng tên ${displayName}` : ''}. Không dùng ký tự trang trí.`;
    const url = `https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(basePrompt)}`;
    const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    let aiText = res?.data;
    if (typeof aiText === 'object') {
      aiText = aiText?.content || aiText?.message || aiText?.data || '';
    }
    if (typeof aiText === 'string') {
      aiText = aiText.replace(/^["'“”\s]+|["'“”\s]+$/g, '');
      if (aiText.length > 200) aiText = aiText.slice(0, 200).trim();
      quote = aiText;
    }
  } catch (_) {}

  if (!quote) {
    quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  }
  const header = '💔 Thất tình ư? Không sao, rồi sẽ ổn thôi...';
  const msg = `${header}\n\n"${quote}"`;

  // 30% kèm ảnh (tránh phụ thuộc mạng quá nhiều)
  const attachImage = Math.random() < 0.3;
  if (!attachImage) {
    return api.sendMessage({ msg }, threadId, type);
  }

  const tmpDir = path.join(__dirname, 'temp');
  try { if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true }); } catch {}

  const imageUrl = IMAGES[Math.floor(Math.random() * IMAGES.length)];
  const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
  const filePath = path.join(tmpDir, `thattinh_${Date.now()}${ext}`);

  try {
    const res = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const buf = Buffer.from(res.data);
    fs.writeFileSync(filePath, buf);

    await api.sendMessage({ msg, attachments: [filePath] }, threadId, type);
  } catch (e) {
    // Nếu tải ảnh lỗi, gửi text thôi
    await api.sendMessage({ msg }, threadId, type);
  } finally {
    // Dọn file sau 5 giây nếu tồn tại
    setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 5000);
  }
};
