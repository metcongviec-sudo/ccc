const axios = require('axios');

module.exports.config = {
  name: 'giaitoan',
  aliases: ['math', 'giải toán', 'giaitoan'],
  version: '1.0.0',
  role: 0,
  author: 'Cascade',
  description: 'Giải toán bằng Gemini qua API zeidteam (chatgpt4 endpoint)',
  category: 'Tiện ích',
  usage: 'bonz giải toán <biểu_thức/toán_học_mô_tả>',
  cooldowns: 2
};

module.exports.run = async ({ api, event, args }) => {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const prompt = (args || []).join(' ').trim();
    if (!prompt) {
      return api.sendMessage([
        'Bảng thông tin dịch vụ',
        `ng dùng: ${userName}`,
        'dịch vụ : bonz giải toán',
        `id ng dùng: ${senderId}`,
        'cấp bậc: Thành viên',
        'số lượt dùng: 1',
        'thông báo: Thiếu đề bài/biểu thức',
        'cách dùng: bonz giải toán 2+2*3 hoặc bonz giaitoan đạo hàm của x^2'
      ].join('\n'), threadId, type);
    }

    const cfg = global?.config || {};
    const geminiKey = cfg?.gemini_key || process.env.GEMINI_API_KEY || cfg?.zeid_api_key || '';

    const baseUrl = 'https://api.zeidteam.xyz/ai/chatgpt4';
    const url = `${baseUrl}?prompt=${encodeURIComponent(prompt)}`;

    const headers = {};
    if (geminiKey) {
      headers['apikey'] = geminiKey;           // khả năng 1
      headers['Authorization'] = `Bearer ${geminiKey}`; // khả năng 2
    }

    let resp;
    try {
      resp = await axios.get(url, { headers, timeout: 20000 });
    } catch (e) {
      // fallback: thử truyền key qua query
      if (geminiKey) {
        const alt = `${baseUrl}?prompt=${encodeURIComponent(prompt)}&apikey=${encodeURIComponent(geminiKey)}`;
        resp = await axios.get(alt, { timeout: 20000 });
      } else {
        throw e;
      }
    }

    const data = resp?.data;
    let answer = data?.response || data?.result || data?.answer || '';
    // Nếu API không trả kết quả hợp lệ hoặc có thông báo lỗi, thử tính cục bộ
    const apiText = String(answer || JSON.stringify(data || {}));

    function localCalc(expr) {
      try {
        let s = String(expr || '').trim();
        if (!/^[0-9+\-*/().,^\sA-Za-z]+$/.test(s)) return null; // chặn ký tự lạ
        // thay ^ bằng **
        s = s.replace(/\^/g, '**');
        // thay thế hằng số
        s = s.replace(/\bpi\b/gi, 'Math.PI').replace(/\be\b/g, 'Math.E');
        // hàm toán
        const funcs = ['sin','cos','tan','asin','acos','atan','log','sqrt','abs','ceil','floor','round','exp','pow','min','max'];
        for (const f of funcs) {
          const rx = new RegExp(`\\b${f}\\s*\\(`, 'gi');
          s = s.replace(rx, `Math.${f}(`);
        }
        // chấp nhận chỉ các chữ cái thuộc danh sách cho phép
        const letters = s.match(/[A-Za-z_]+/g) || [];
        for (const w of letters) {
          if (!/^Math\.(PI|E|sin|cos|tan|asin|acos|atan|log|sqrt|abs|ceil|floor|round|exp|pow|min|max)$/.test(w)) {
            return null;
          }
        }
        // eval an toàn tương đối
        // eslint-disable-next-line no-new-func
        const result = Function(`"use strict"; return (${s});`)();
        if (typeof result === 'number' && isFinite(result)) return result;
        return null;
      } catch { return null; }
    }

    if (!answer || /not defined|error|exception|invalid/i.test(apiText)) {
      const local = localCalc(prompt);
      if (local !== null) {
        answer = String(local);
      }
    }
    if (!answer) {
      answer = 'Không có kết quả khả dụng từ API.';
    }

    const header = [
      'Bảng thông tin dịch vụ',
      `ng dùng: ${userName}`,
      'dịch vụ : bonz giải toán',
      `id ng dùng: ${senderId}`,
      'cấp bậc: Thành viên',
      'số lượt dùng: 1',
      'thông báo: Thành công'
    ].join('\n');

    const details = ['','🧮 Đề bài: ', prompt, '', '✅ Kết quả:', String(answer)].join('\n');
    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (e) {
    return api.sendMessage('❌ Không thể giải toán lúc này. Vui lòng thử lại sau.', event.threadId, event.type);
  }
};
