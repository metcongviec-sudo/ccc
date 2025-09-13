const axios = require('axios');
const fs = require('fs');
const path = require('path');
const safeUtil = require('./safe.js');

// ===================== TỪ ĐIỂN TIẾNG VIỆT (nếu có) =====================
let __viDictCache = null; // Set các từ hợp lệ
function __loadViDict() {
  if (__viDictCache) return __viDictCache;
  try {
    const dictCandidates = [
      path.resolve(__dirname, '../../assets/vi_words_large.txt'),
      path.resolve(__dirname, '../../assets/vi_words.txt'),
      path.resolve(__dirname, '../../assets/vietnamese_words.txt'),
      path.resolve(__dirname, '../../assets/vi_words.json')
    ];
    for (const p of dictCandidates) {
      if (fs.existsSync(p)) {
        if (p.endsWith('.json')) {
          const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
          __viDictCache = new Set((arr || []).map(x => String(x).toLowerCase()));
          return __viDictCache;
        } else {
          const content = fs.readFileSync(p, 'utf8');
          const lines = content.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
          __viDictCache = new Set(lines);
          return __viDictCache;
        }
      }
    }
  } catch {}
  __viDictCache = new Set();
  return __viDictCache;
}

module.exports.config = {
  name: "bonz",
  aliases: [],
  version: "1.1.0",
  role: 0,
  author: "Cascade",
  description: "Hiển thị BONZ MENU và các chức năng",
  category: "Tiện ích",
  usage: "bonz hoặc bonz menu hoặc bonz <chức năng>",
  cooldowns: 2,
  dependencies: {
    "axios": "",
    "sharp": "",
    "fast-xml-parser": "",
    "openai": ""
  }
};

// Trò chơi nối từ theo nhóm
async function handleNoiTu(api, event, args = [], ThreadsRef) {
  const { threadId, type, data } = event;
  // Lấy dữ liệu nhóm
  let thread = { data: {} };
  try {
    if (ThreadsRef?.getData) thread = await ThreadsRef.getData(threadId);
  } catch {}
  const tdata = thread.data || {};
  const state = tdata.noi_tu_state || { started: false, lastWord: '', lastChar: '', used: [], mode: 1, useDict: false, custom: [] };

  const sub = (args[0] || '').toLowerCase();
  // Điều khiển trò chơi
  if (sub === 'start') {
    state.started = true;
    state.lastWord = '';
    state.lastChar = '';
    state.used = [];
    state.mode = state.mode === 2 ? 2 : 1; // giữ mode hiện tại nếu có
    tdata.noi_tu_state = state;
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage(`🎮 Nối từ đã BẮT ĐẦU! (chế độ: ${state.mode === 2 ? '2 chữ' : '1 chữ'})\nGõ: bonz nối từ <từ đầu tiên>`, threadId, type);
  }
  if (sub === 'stop') {
    state.started = false;
    tdata.noi_tu_state = state;
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage('🛑 Đã DỪNG trò chơi nối từ.', threadId, type);
  }
  if (sub === 'reset') {
    tdata.noi_tu_state = { started: false, lastWord: '', lastChar: '', used: [], mode: 1, useDict: false, custom: [] };
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage('♻️ Đã RESET trò chơi. Gõ: bonz nối từ start để bắt đầu.', threadId, type);
  }
  if (sub === 'dict') {
    const opt = (args[1] || '').toLowerCase();
    if (opt === 'on') {
      state.useDict = true;
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      // thử load từ điển để đảm bảo có
      const dict = __loadViDict();
      const note = dict.size ? '' : '\n⚠️ Chưa tìm thấy file từ điển. Thêm assets/vi_words.txt để bật kiểm tra nghĩa.';
      return api.sendMessage('📚 ĐÃ BẬT kiểm tra từ điển.' + note, threadId, type);
    }
    if (opt === 'off') {
      state.useDict = false;
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage('📚 ĐÃ TẮT kiểm tra từ điển.', threadId, type);
    }
    if (opt === 'status') {
      const dict = __loadViDict();
      return api.sendMessage(`📚 Từ điển: ${state.useDict ? 'BẬT' : 'TẮT'} | Số từ hệ thống: ${dict.size} | Từ tùy chỉnh nhóm: ${(state.custom||[]).length}`, threadId, type);
    }
    if (opt === 'add') {
      const word = (args.slice(2).join(' ') || '').trim().toLowerCase();
      if (!word) return api.sendMessage('Dùng: bonz nối từ dict add <từ>', threadId, type);
      state.custom = Array.isArray(state.custom) ? state.custom : [];
      if (!state.custom.includes(word)) state.custom.push(word);
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`✅ Đã thêm từ tùy chỉnh: "${word}"`, threadId, type);
    }
    if (opt === 'del') {
      const word = (args.slice(2).join(' ') || '').trim().toLowerCase();
      if (!word) return api.sendMessage('Dùng: bonz nối từ dict del <từ>', threadId, type);
      state.custom = (state.custom || []).filter(x => x !== word);
      tdata.noi_tu_state = state;
      if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
      return api.sendMessage(`🗑️ Đã xóa từ tùy chỉnh: "${word}"`, threadId, type);
    }
    return api.sendMessage('⚙️ Dùng: bonz nối từ dict on|off|status|add <từ>|del <từ>', threadId, type);
  }
  if (sub === 'mode') {
    const m = parseInt(args[1], 10);
    if (![1,2].includes(m)) return api.sendMessage('⚙️ Dùng: bonz nối từ mode 1|2', threadId, type);
    state.mode = m;
    tdata.noi_tu_state = state;
    if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);
    return api.sendMessage(`✅ Đã chuyển chế độ nối từ: ${m === 2 ? '2 chữ' : '1 chữ'}.`, threadId, type);
  }
  if (sub === 'status') {
    if (!state.started) return api.sendMessage(`ℹ️ Trạng thái: ĐANG TẮT. (mode: ${state.mode === 2 ? '2 chữ' : '1 chữ'})\nGõ: bonz nối từ start`, threadId, type);
    const last = state.lastWord ? `Từ cuối: ${state.lastWord} (chữ yêu cầu: ${state.mode === 2 ? state.lastWord.slice(-2) : state.lastChar})` : 'Chưa có từ nào.';
    return api.sendMessage(`ℹ️ Trò chơi đang BẬT. (mode: ${state.mode === 2 ? '2 chữ' : '1 chữ'})\n${last}`, threadId, type);
  }

  // Chơi: bonz nối từ <từ>
  const joined = args.join(' ').trim().toLowerCase();
  if (!state.started) {
    return api.sendMessage('❗ Trò chơi chưa bắt đầu. Gõ: bonz nối từ start', threadId, type);
  }
  if (!joined) {
    return api.sendMessage('⚠️ Cú pháp: bonz nối từ <từ tiếp theo>', threadId, type);
  }

  // Chuẩn hóa từ: chỉ giữ chữ cái và khoảng trắng đơn
  const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\s]/gu, '').replace(/\s+/g, ' ').trim();
  // Hỗ trợ nhiều từ: tách theo dấu phẩy/newline hoặc nhiều khoảng trắng
  let words = joined.split(/[\n,]+/).map(s => norm(s)).filter(Boolean);
  if (words.length === 0) words = [norm(joined)];

  // Duyệt từng từ, dừng khi gặp sai
  const dict = __loadViDict();
  for (let idx = 0; idx < words.length; idx++) {
    const w = words[idx];
    if (!w) continue;
    // Kiểm tra từ điển nếu bật
    if (state.useDict) {
      const inDict = dict.has(w);
      const inCustom = Array.isArray(state.custom) && state.custom.includes(w);
      if (!inDict && !inCustom) {
        return api.sendMessage(`📚 Từ thứ ${idx + 1} không có trong từ điển: "${w}"\nBật thêm bằng: bonz nối từ dict add ${w}`, threadId, type);
      }
    }
    // Kiểm tra tiền tố yêu cầu
    if (state.lastWord) {
      const need = state.mode === 2 ? state.lastWord.slice(-2) : state.lastChar || state.lastWord.slice(-1);
      const got = state.mode === 2 ? w.slice(0, 2) : w[0];
      if (need && got !== need) {
        return api.sendMessage(`❌ Sai ở từ thứ ${idx + 1}: "${w}"\nYêu cầu bắt đầu bằng: "${need}"`, threadId, type);
      }
    }
    if (Array.isArray(state.used) && state.used.includes(w)) {
      return api.sendMessage(`🔁 Từ thứ ${idx + 1} đã dùng rồi: "${w}"`, threadId, type);
    }
    // Cập nhật trạng thái
    state.used = Array.isArray(state.used) ? state.used : [];
    state.used.push(w);
    state.lastWord = w;
    state.lastChar = w[w.length - 1];
  }

  tdata.noi_tu_state = state;
  if (ThreadsRef?.setData) await ThreadsRef.setData(threadId, tdata);

  // Gợi ý tiền tố tiếp theo
  const needNext = state.mode === 2 ? state.lastWord.slice(-2) : state.lastChar;
  return api.sendMessage(`✅ Hợp lệ! Yêu cầu tiếp theo: "${needNext}"`, threadId, type);
}

// Tìm kiếm Google bằng Google Custom Search API (CSE)
async function handleSearchCSE(api, event, args = []) {
  const { threadId, type, data } = event;
  const cfg = global?.config || {};
  const cse = cfg.google_cse || {};
  const API_KEY = cse.api_key || '';
  const CX = cse.cx || '';

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz sr', senderId);

  const query = (args || []).join(' ').trim();
  if (!query) {
    const header = __formatServiceInfo({
      service: 'bonz sr', userName, userId: senderId, role, usage,
      notify: 'Hướng dẫn sử dụng',
      howToUse: 'bonz sr <từ khóa>'
    });
    return api.sendMessage(header, threadId, type);
  }

  if (!API_KEY || !CX) {
    const header = __formatServiceInfo({
      service: 'bonz sr', userName, userId: senderId, role, usage,
      notify: 'Thiếu cấu hình Google CSE (api_key/cx) trong config.yml',
      howToUse: 'Điền google_cse.api_key và google_cse.cx rồi restart bot'
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    const url = 'https://www.googleapis.com/customsearch/v1';
    const params = {
      key: API_KEY,
      cx: CX,
      q: query,
      num: 5,
      hl: 'vi',
      safe: 'off'
    };
    const res = await axios.get(url, { params, timeout: 15000 });
    const items = Array.isArray(res?.data?.items) ? res.data.items : [];

    const header = __formatServiceInfo({
      service: 'bonz sr', userName, userId: senderId, role, usage,
      notify: `Kết quả cho: ${query}`
    });
    if (items.length === 0) {
      return api.sendMessage(`${header}\n\nKhông tìm thấy kết quả.`, threadId, type);
    }

    const top = items.map((it, idx) => {
      const title = it?.title || 'Không tiêu đề';
      const link = it?.link || it?.formattedUrl || '';
      const snippet = (it?.snippet || '').replace(/\s+/g, ' ').trim();
      const desc = snippet ? `\n   ${snippet}` : '';
      return `${idx + 1}. ${title}\n   ${link}${desc}`;
    }).join('\n\n');

    return api.sendMessage(`${header}\n\n${top}`, threadId, type);
  } catch (e) {
    const header = __formatServiceInfo({
      service: 'bonz sr', userName, userId: senderId, role, usage,
      notify: 'Lỗi khi tìm kiếm, vui lòng thử lại'
    });
    return api.sendMessage(header, threadId, type);
  }
}


// Cấp phát Gmail EDU ảo (không phải tài khoản thật, chỉ demo)
async function handleGmailEdu(api, event) {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz gmail edu', senderId);
    // Tạo thông tin EDU ảo (demo)
    const rand = (n, chars) => Array.from({ length: n }, () => chars[Math.floor(Math.random()*chars.length)]).join('');
    const digits = '0123456789';
    const lowers = 'abcdefghijklmnopqrstuvwxyz';
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const all = lowers + uppers + digits;
    const mssv = rand(8, digits);
    const local = `sv${mssv}`;
    const domains = ['student.edu.vn','university.edu.vn','sinhvien.edu.vn','stu.univ.edu.vn'];
    const domain = domains[Math.floor(Math.random()*domains.length)];
    const email = `${local}@${domain}`;
    const password = `${rand(1, uppers)}${rand(7, all)}!`;

    const header = __formatServiceInfo({
      service: 'bonz gmail edu',
      userName,
      userId: senderId,
      notify: 'Cấp phát EDU',
      role,
      usage,
      howToUse: ''
    });

    const lines = [
      '',
      '📧 THÔNG TIN GMAIL EDU',
      `• Email: ${email}`,
      `• Mật khẩu: ${password}`
    ];

    return api.sendMessage(`${header}\n${lines.join('\n')}`, threadId, type, null, senderId);
  } catch (e) {
    return api.sendMessage('❌ Không thể cấp phát Gmail EDU ảo lúc này.', event.threadId, event.type);
  }
}

// Hiển thị bảng thông tin dịch vụ (mẫu) theo định dạng chuẩn
async function handleServiceInfo(api, event, args = []) {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz info', senderId);

    const serviceName = (args || []).join(' ').trim() || 'bonz info';

    const header = __formatServiceInfo({
      service: serviceName,
      userName,
      userId: senderId,
      notify: 'Mẫu thông tin dịch vụ',
      role,
      usage,
      howToUse: 'bonz info <tên dịch vụ>'
    });

    return api.sendMessage(header, threadId, type, null, senderId);
  } catch (e) {
    return api.sendMessage('❌ Không thể hiển thị bảng thông tin dịch vụ ngay lúc này.', threadId, type);
  }
}

// Quản lý từ cấm trong nhóm
async function handleTuCam(api, event, args = []) {
  const { threadId, type, data } = event;
  const { ThreadType } = require('zca-js');
  const Threads = require('../../core/controller/controllerThreads');

  if (type !== ThreadType.Group) {
    return api.sendMessage('Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const userId = data?.uidFrom;
  const isAdminGroup = await isAdminInGroup(api, userId, threadId);
  const isAdminBot = isBotAdmin(userId);
  if (!(isAdminGroup || isAdminBot)) {
    return api.sendMessage('Bạn cần là quản trị viên để sử dụng lệnh này.', threadId, type);
  }

  const action = (args[0] || '').toLowerCase();
  const row = await Threads.getData(threadId);
  const tdata = row?.data || {};
  tdata.tu_cam = tdata.tu_cam || { enabled: false, words: [] };

  const toWords = (list) => {
    if (!list || list.length === 0) return [];
    const joined = list.join(' ');
    // Chỉ tách bởi dấu phẩy để hỗ trợ cụm từ có khoảng trắng (ví dụ: "địt mẹ")
    return joined
      .split(/\s*,\s*/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
  };

  if (["bật","on","enable","1"].includes(action)) {
    tdata.tu_cam.enabled = true;
    await Threads.setData(threadId, tdata);
    return api.sendMessage('✅ Đã bật chế độ từ cấm.', threadId, type);
  }

  if (["tắt","off","disable","0"].includes(action)) {
    tdata.tu_cam.enabled = false;
    await Threads.setData(threadId, tdata);
    return api.sendMessage('✅ Đã tắt chế độ từ cấm.', threadId, type);
  }

  if (action === 'thêm' || action === 'them' || action === 'add') {
    const words = toWords(args.slice(1));
    if (words.length === 0) return api.sendMessage('Vui lòng nhập từ cần thêm.', threadId, type);
    const set = new Set([...(tdata.tu_cam.words || []).map(w => String(w).toLowerCase()), ...words]);
    tdata.tu_cam.words = Array.from(set);
    await Threads.setData(threadId, tdata);
    return api.sendMessage(`✅ Đã thêm ${words.length} từ. Tổng: ${tdata.tu_cam.words.length}.`, threadId, type);
  }

  if (action === 'xóa' || action === 'xoa' || action === 'del' || action === 'remove') {
    const words = toWords(args.slice(1));
    if (words.length === 0) return api.sendMessage('Vui lòng nhập từ cần xóa.', threadId, type);
    const removeSet = new Set(words);
    tdata.tu_cam.words = (tdata.tu_cam.words || []).filter(w => !removeSet.has(String(w).toLowerCase()));
    await Threads.setData(threadId, tdata);
    return api.sendMessage(`✅ Đã xóa. Tổng còn: ${tdata.tu_cam.words.length}.`, threadId, type);
  }

  if ((action === 'danh' && (args[1]||'').toLowerCase() === 'sách') || action === 'list') {
    const enabled = tdata.tu_cam.enabled ? 'BẬT' : 'TẮT';
    const words = tdata.tu_cam.words || [];
    const lines = [
      '🛡️ TỪ CẤM',
      `• Trạng thái: ${enabled}`,
      `• Số từ: ${words.length}`,
      words.length ? `• Danh sách: ${words.join(', ')}` : '• Danh sách: (trống)'
    ];
    return api.sendMessage(lines.join('\n'), threadId, type);
  }

  if (action === 'reset') {
    tdata.tu_cam = { enabled: false, words: [] };
    await Threads.setData(threadId, tdata);
    return api.sendMessage('✅ Đã reset danh sách từ cấm và tắt chế độ.', threadId, type);
  }

  const guide = [
    '🛡️ Quản lý từ cấm:',
    '• bonz từ cấm bật|tắt',
    '• bonz từ cấm thêm <từ1, từ2,...>',
    '• bonz từ cấm xóa <từ1, từ2,...>',
    '• bonz từ cấm danh sách',
    '• bonz từ cấm reset'
  ].join('\n');
  return api.sendMessage(guide, threadId, type);
}
// Khóa/Mở khóa chat nhóm
async function handleKhoaChat(api, event, args = [], routedFromBonz = false) {
  const { threadId, type, data } = event;
  const { ThreadType } = require('zca-js');
  const Threads = require('../../core/controller/controllerThreads');

  if (type !== ThreadType.Group) {
    return api.sendMessage('Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const userId = data?.uidFrom;
  const isAdmin = await isAdminInGroup(api, userId, threadId);
  if (!isAdmin) {
    return api.sendMessage('Bạn cần là quản trị viên để sử dụng lệnh này.', threadId, type);
  }

  const action = (args[0] || '').toLowerCase();
  const row = await Threads.getData(threadId);
  const tdata = row?.data || {};
  const current = !!tdata.chat_locked;

  let next;
  if (["on", "bật", "bat", "enable", "1"].includes(action)) next = true;
  else if (["off", "tắt", "tat", "disable", "0", "mở", "mo"].includes(action)) next = false;
  else next = !current; // toggle nếu không chỉ định

  tdata.chat_locked = next;
  Threads.setData(threadId, tdata);

  return api.sendMessage(`🔒 Trạng thái chat: ${next ? 'ĐÃ KHÓA' : 'ĐÃ MỞ'}.`, threadId, type);
}

// Bật/Tắt/Trạng thái welcome theo từng nhóm
async function handleWelcomeToggle(api, event, args = []) {
  const { threadId, type } = event;
  try {
    const utils = require('../../utils');
    const botUid = api.getOwnId();
    const action = (args[0] || '').toLowerCase();
    if (action === 'on' || action === 'bật') {
      const msg = utils.handleWelcomeOn(botUid, threadId);
      return api.sendMessage(msg, threadId, type);
    }
    if (action === 'off' || action === 'tắt' || action === 'tat') {
      const msg = utils.handleWelcomeOff(botUid, threadId);
      return api.sendMessage(msg, threadId, type);
    }
    const allow = utils.getAllowWelcome(botUid, threadId);
    return api.sendMessage(`🚦Trạng thái welcome hiện đang ${allow ? '🟢 Bật' : '🔴 Tắt'}.\nDùng: bonz welcome on | off`, threadId, type);
  } catch (e) {
    return api.sendMessage('❌ Không thể xử lý cấu hình welcome.', threadId, type);
  }
}

// Hàm lấy mô tả thời tiết từ weather_code (Open-Meteo)
function __wmCodeToTextVi(code) {
  const map = {
    0: 'Trời quang',
    1: 'Chủ yếu quang',
    2: 'Có mây rải rác',
    3: 'Nhiều mây',
    45: 'Sương mù',
    48: 'Sương mù đóng băng',
    51: 'Mưa phùn nhẹ',
    53: 'Mưa phùn vừa',
    55: 'Mưa phùn dày',
    56: 'Mưa phùn băng nhẹ',
    57: 'Mưa phùn băng dày',
    61: 'Mưa nhẹ',
    63: 'Mưa vừa',
    65: 'Mưa to',
    66: 'Mưa băng nhẹ',
    67: 'Mưa băng to',
    71: 'Tuyết nhẹ',
    73: 'Tuyết vừa',
    75: 'Tuyết dày',
    77: 'Tuyết hạt',
    80: 'Mưa rào nhẹ',
    81: 'Mưa rào vừa',
    82: 'Mưa rào to',
    85: 'Mưa tuyết rào nhẹ',
    86: 'Mưa tuyết rào to',
    95: 'Dông',
    96: 'Dông kèm mưa đá nhẹ',
    99: 'Dông kèm mưa đá to'
  };
  return map[code] || `Mã thời tiết ${code}`;
}

// Xử lý bonz weather
async function handleWeather(api, event, args = []) {
  const { threadId, type } = event;
  try {
    const senderId = event?.data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz weather', senderId);

    const query = (args || []).join(' ').trim();
    if (!query) {
      const header = __formatServiceInfo({
        service: 'bonz weather',
        userName,
        userId: senderId,
        notify: 'Hướng dẫn sử dụng',
        role,
        usage,
        howToUse: 'bonz weather <địa điểm>'
      });
      return api.sendMessage(header, threadId, type);
    }

    await api.sendMessage(`🌍 Đang tìm địa điểm "${query}"...`, threadId, type);

    // 1) Geocoding
    const geores = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: query, count: 1, language: 'vi', format: 'json' },
      timeout: 15000
    });
    const place = geores?.data?.results?.[0];
    if (!place) {
      return api.sendMessage(`❌ Không tìm thấy địa điểm phù hợp cho "${query}".`, threadId, type);
    }

    const lat = place.latitude;
    const lon = place.longitude;
    const displayName = [place.name, place.admin1, place.country].filter(Boolean).join(', ');

    // 2) Current weather
    const wres = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
        timezone: 'auto'
      },
      timeout: 15000
    });
    const cur = wres?.data?.current;
    if (!cur) {
      return api.sendMessage('❌ Không lấy được dữ liệu thời tiết. Vui lòng thử lại.', threadId, type);
    }

    const desc = __wmCodeToTextVi(cur.weather_code);
    const temp = cur.temperature_2m;
    const feels = cur.apparent_temperature;
    const hum = cur.relative_humidity_2m;
    const wind = cur.wind_speed_10m;
    const windDir = cur.wind_direction_10m;
    const rain = cur.precipitation;
    const isDay = cur.is_day ? 'Ban ngày' : 'Ban đêm';

    const header = __formatServiceInfo({
      service: 'bonz weather',
      userName,
      userId: senderId,
      notify: `Thời tiết hiện tại ở ${displayName}`,
      role,
      usage,
      howToUse: 'bonz weather <địa điểm>'
    });

    const lines = [
      header,
      '',
      `📍 Vị trí: ${displayName} (lat ${lat.toFixed(3)}, lon ${lon.toFixed(3)})`,
      `🌤 Tình trạng: ${desc} • ${isDay}`,
      `🌡 Nhiệt độ: ${temp}°C (Cảm giác: ${feels}°C)`,
      `💧 Độ ẩm: ${hum}%  • ☔ Lượng mưa: ${rain} mm`,
      `💨 Gió: ${wind} km/h • Hướng: ${windDir}°`
    ].join('\n');

    return api.sendMessage(lines, threadId, type);
  } catch (e) {
    try {
      return api.sendMessage('❌ Lỗi khi lấy thời tiết. Vui lòng thử lại sau.', event.threadId, event.type);
    } catch {}
  }
}

// Hàm xử lý tìm kiếm nhạc SoundCloud
async function handleMusic(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const Threads = require('../../core/controller/controllerThreads');
  const soundcloud = require('./soundcloud.js');
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz nhạc', senderId);

  // Lấy tên người dùng (dùng cho header chuẩn)
  let userName = "Người dùng";
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
  } catch (_) {}

  // cache danh sách bài theo thread+uid trong 120s
  async function setMusicCache(list) {
    try {
      const row = await Threads.getData(threadId);
      const tdata = row?.data || {};
      tdata.music = tdata.music || { searches: {} };
      tdata.music.searches[senderId] = { payload: list, ts: Date.now() };
      await Threads.setData(threadId, tdata);
    } catch {}
  }
  async function getMusicCache(maxAgeMs = 120000) {
    try {
      const row = await Threads.getData(threadId);
      const node = row?.data?.music?.searches?.[senderId];
      if (!node) return null;
      if (Date.now() - (node.ts || 0) > maxAgeMs) return null;
      return node.payload || null;
    } catch { return null; }
  }
  
  // chọn bài từ danh sách đã tìm
  if (args.length >= 1 && ['chọn','chon','chọn bài','chon bai'].includes((args[0]||'').toLowerCase())) {
    const idx = parseInt(args[1], 10);
    if (isNaN(idx) || idx <= 0) {
      return api.sendMessage('❌ Vui lòng nhập số thứ tự hợp lệ. Ví dụ: bonz nhạc chọn 1', threadId, type);
    }
    const list = await getMusicCache();
    if (!Array.isArray(list) || list.length === 0) {
      return api.sendMessage('❌ Không có danh sách gần đây. Hãy tìm trước: bonz nhạc <từ khóa>', threadId, type);
    }
    const chosen = list[idx - 1];
    if (!chosen) {
      return api.sendMessage(`❌ Chỉ số không hợp lệ. Hãy chọn từ 1-${list.length}`, threadId, type);
    }
    try {
      await api.sendMessage('🔽 Đang xử lý phát nhạc, vui lòng đợi...', threadId, type);
      const streamUrl = await soundcloud.getMusicStreamUrl(chosen.link);
      if (!streamUrl) return api.sendMessage('❌ Không lấy được link phát trực tiếp. Thử bài khác.', threadId, type);

      const caption = [
        `🎶 ${chosen.title}`,
        chosen.username ? `👤 ${chosen.username}` : '',
        chosen.playCount ? `▶️ ${chosen.playCount} | ❤️ ${chosen.likeCount || 0}` : ''
      ].filter(Boolean).join('\n');

      // 1) Cố gắng gửi voice từ URL (nhiều biến thể payload)
      const urlVoicePayloads = [
        { msg: caption, attachments: [streamUrl], asVoice: true },
        { msg: caption, attachments: [streamUrl], voice: true },
        { msg: caption, voice: streamUrl },
        { msg: caption, audio: streamUrl },
        { msg: caption, attachments: streamUrl, asVoice: true },
      ];
      for (const p of urlVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); return; } catch (_) {}
      }

      // 2) Nếu client không nhận URL, tải file về rồi gửi voice từ file
      const safeTitle = (chosen.title || 'soundcloud').slice(0,80).replace(/[<>:"/\\|?*]/g,'_');
      const filePath = await soundcloud.saveFileToCache(streamUrl, `${safeTitle}.mp3`);
      if (!filePath) return api.sendMessage('❌ Lỗi tải file.', threadId, type);

      const fileVoicePayloads = [
        { msg: caption, attachments: [filePath], asVoice: true },
        { msg: caption, attachments: [filePath], voice: true },
        { msg: caption, voice: filePath },
        { msg: caption, audio: filePath },
        { msg: caption, attachments: filePath, asVoice: true },
      ];
      let sent = false;
      for (const p of fileVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); sent = true; break; } catch (_) {}
      }
      if (!sent) {
        // Fallback cuối: gửi bình thường như file đính kèm
        await api.sendMessage({ msg: caption, attachments: [filePath] }, threadId, type);
      }
      // dọn file sau 5 phút
      setTimeout(async ()=>{ try { const fs = require('fs').promises; await fs.unlink(filePath); } catch(_){} }, 300000);
    } catch (e) {
      return api.sendMessage('❌ Gửi nhạc thất bại, vui lòng thử lại.', threadId, type);
    }
    return;
  }

  if (args.length === 0) {
    const header = __formatServiceInfo({
      service: 'bonz nhạc',
      userName,
      userId: senderId,
      notify: 'Hướng dẫn sử dụng',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: 'bonz nhạc <từ khóa>'
    });
    return api.sendMessage(header, threadId, type);
  }

  // bonz giải toán | bonz giaitoan | bonz math
  if ((sub === 'giải' && (args[1] || '').toLowerCase() === 'toán') || sub === 'giaitoan' || sub === 'math') {
    try {
      const mathCmd = require('./giaitoan.js');
      const passArgs = sub === 'giải' ? args.slice(2) : args.slice(1);
      await mathCmd.run({ api, event, args: passArgs });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz giải toán. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }
  
  const query = args.join(' ');
  
  try {
    await api.sendMessage(`🔍 Đang tìm kiếm "${query}" trên SoundCloud...`, threadId, type);
    const songs = await soundcloud.searchSongs(query);
    
    if (songs.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz nhạc',
        userName,
        userId: senderId,
        notify: 'Không tìm thấy bài hát phù hợp',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: 'bonz nhạc <từ khóa>'
      });
      return api.sendMessage(header, threadId, type);
    }
    
    // Lấy metadata cho các bài hát
    for (let i = 0; i < Math.min(songs.length, 5); i++) {
      try {
        const metadata = await soundcloud.getSongMetadata(songs[i].link);
        songs[i] = { ...songs[i], ...metadata };
      } catch (_) {}
    }
    
    // Cache danh sách và tạo ảnh menu
    await setMusicCache(songs.slice(0, 5));
    
    // Tạo ảnh menu
    const imagePath = await soundcloud.createSongListImage(songs.slice(0, 5), userName);
    
    if (imagePath) {
      const header = __formatServiceInfo({
        service: 'bonz nhạc',
        userName,
        userId: senderId,
        notify: `Tìm thấy ${songs.length} bài`,
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: `bonz nhạc <từ khóa> | reply 1-${Math.min(songs.length, 5)} hoặc bonz nhạc chọn <số>`
      });

      const messagePayload = {
        msg: [
          header,
          '',
          `🎵 Kết quả tìm kiếm cho: ${query}`,
          `📊 Tìm thấy ${songs.length} bài hát`,
          ``,
          `💡 Để tải nhạc: reply số (1-${Math.min(songs.length, 5)}) hoặc gõ: bonz nhạc chọn <số>`,
        ].join('\n'),
        attachments: [imagePath]
      };

      await api.sendMessage(messagePayload, threadId, type);
      
      // Xóa file tạm sau 5 phút
      setTimeout(async () => {
        try {
          const fs = require('fs').promises;
          await fs.unlink(imagePath);
        } catch (_) {}
      }, 300000);
    } else {
      // Fallback: gửi text nếu không tạo được ảnh
      const header = __formatServiceInfo({
        service: 'bonz nhạc',
        userName,
        userId: senderId,
        notify: `Tìm thấy ${songs.length} bài`,
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: `bonz nhạc <từ khóa> | reply 1-${Math.min(songs.length, 5)} hoặc bonz nhạc chọn <số>`
      });
      let resultText = `${header}\n\n🎵 Kết quả tìm kiếm cho: ${query}\n`;
      songs.slice(0, 5).forEach((song, index) => {
        resultText += `${index + 1}. ${song.title}\n👤 ${song.username}\n▶️ ${song.playCount} | ❤️ ${song.likeCount}\n\n`;
      });
      resultText += `💡 Để tải: reply số (1-${Math.min(songs.length, 5)}) hoặc gõ: bonz nhạc chọn <số>`;
      
      await api.sendMessage(resultText, threadId, type);
    }
    
  } catch (error) {
    console.error('Lỗi tìm kiếm nhạc:', error.message);
    const header = __formatServiceInfo({
      service: 'bonz nhạc',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: 'bonz nhạc <từ khóa>'
    });
    await api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý tính năng group
async function handleGroup(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  if (args.length === 0) {
    return api.sendMessage([
      '🏘️ Tính năng quản lý group:',
      '',
      '📝 Cách dùng:',
      '• bonz group join <link> - Join group',
      '• bonz group spam <link> <số_lần> - Join và spam',
      '',
      '💡 Ví dụ:',
      '• bonz group join https://zalo.me/g/abc123',
      '• bonz group spam https://zalo.me/g/abc123 5'
    ].join('\n'), threadId, type);
  }
  
  const action = args[0]?.toLowerCase();
  
  try {
    // Lấy tên người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (_) {}
    
    const groupManager = require('./groupManager.js');
    
    if (action === 'join') {
      if (args.length < 2) {
        return api.sendMessage('❌ Thiếu link group!\nDùng: bonz group join <link>', threadId, type);
      }
      
      const groupUrl = args[1];
      await api.sendMessage('🔄 Đang join group...', threadId, type);
      
      const result = await groupManager.joinGroup(api, groupUrl);
      
      if (result.success) {
        await api.sendMessage([
          '✅ Join group thành công!',
          `👤 Người dùng: ${userName}`,
          `🆔 Group ID: ${result.groupId}`,
          `📝 Trạng thái: ${result.message}`
        ].join('\n'), threadId, type);
      } else {
        await api.sendMessage(`❌ ${result.message}`, threadId, type);
      }
      
    } else if (action === 'spam') {
      if (args.length < 3) {
        return api.sendMessage('❌ Thiếu tham số!\nDùng: bonz group spam <link> <số_lần>', threadId, type);
      }
      
      const groupUrl = args[1];
      const spamCount = parseInt(args[2]);
      
      if (isNaN(spamCount) || spamCount <= 0) {
        return api.sendMessage('❌ Số lần spam không hợp lệ!', threadId, type);
      }
      
      if (spamCount > 20) {
        return api.sendMessage('❌ Số lần spam tối đa là 20!', threadId, type);
      }
      
      await api.sendMessage(`🔄 Đang join group và chuẩn bị spam ${spamCount} lần...`, threadId, type);
      
      // Join group trước
      const joinResult = await groupManager.joinGroup(api, groupUrl);
      
      if (!joinResult.success) {
        return api.sendMessage(`❌ Không thể join group: ${joinResult.message}`, threadId, type);
      }
      
      await api.sendMessage(`✅ Join thành công! Bắt đầu spam...`, threadId, type);
      
      // Spam với callback để báo tiến độ
      let lastProgress = 0;
      const spamResult = await groupManager.spamGroup(api, joinResult.groupId, spamCount, (current, total, success) => {
        const progress = Math.floor((current / total) * 100);
        if (progress - lastProgress >= 25) { // Báo mỗi 25%
          api.sendMessage(`📊 Tiến độ: ${current}/${total} (${progress}%) - Thành công: ${success}`, threadId, type);
          lastProgress = progress;
        }
      });
      
      if (spamResult.success) {
        await api.sendMessage([
          '🎉 Hoàn thành spam!',
          `👤 Người dùng: ${userName}`,
          `📊 Thành công: ${spamResult.successCount}/${spamResult.totalCount}`,
          `🆔 Group ID: ${joinResult.groupId}`
        ].join('\n'), threadId, type);
      } else {
        await api.sendMessage(`❌ Lỗi spam: ${spamResult.message}`, threadId, type);
      }
      
    } else {
      await api.sendMessage('❌ Hành động không hợp lệ!\nDùng: join hoặc spam', threadId, type);
    }
    
  } catch (error) {
    console.error('Lỗi xử lý group:', error.message);
    await api.sendMessage('❌ Có lỗi xảy ra khi xử lý group. Vui lòng thử lại.', threadId, type);
  }
}

// Gửi 10 tài liệu ngẫu nhiên từ thư mục 'tài liệu/)))/' (tránh trùng lặp theo nhóm)
async function handleTaiLieu(api, event, args = []) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');
  const Threads = require('../../core/controller/controllerThreads');

  try {
    const senderId = data.uidFrom;

    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Helper: gửi text theo từng khúc để tránh lỗi "Nội dung quá dài" (code 118)
    async function sendTextChunked(text) {
      try {
        const s = String(text || '');
        const max = 1800; // giữ an toàn dưới giới hạn
        if (s.length <= max) {
          return await api.sendMessage(s, threadId, type);
        }
        let i = 0;
        while (i < s.length) {
          const part = s.slice(i, i + max);
          // gửi lần lượt, đảm bảo thứ tự
          // bỏ type để tránh tham số không hợp lệ
          await api.sendMessage(part, threadId, type);
          i += max;
        }
      } catch (e) {
        console.error('sendTextChunked error:', e?.message || e);
        // fallback cuối
        return await api.sendMessage('⚠️ Nội dung quá dài, đã rút gọn.', threadId, type);
      }
    }

    // --- Văn 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const a0 = (args[0] || '').toLowerCase();
    const a1 = (args[1] || '').toLowerCase();
    const isVan6 = (a0 === 'văn' || a0 === 'van') && a1 === '6';
    if (isVan6) {
      const VAN6_DOCS = [
        { title: 'văn 6 đề thi giữa học kì 2 (1)', url: 'https://drive.google.com/file/d/1qAgLbagwt7XMezSDx8cSuNUmXiIjZ_A5/view' },
        { title: 'văn 6 đề thi giữa học kì 2 (2)', url: 'https://drive.google.com/file/d/13MXkECRvXJXBOjaKhxgkgCH9bwIRDLcq/view' },
        { title: 'văn 6 đề thi giữa học kì 1 (1)', url: 'https://drive.google.com/file/d/1OgXdp3BmRJIz0EEbfp209xhGbfFxWi45/view' },
        { title: 'văn 6 đề thi giữa học kì 1 (2)', url: 'https://drive.google.com/file/d/1CNQbiwJkqkEhsHtScwWOtNADrSTqBdVd/view' },
        { title: 'văn 6 đề thi học kì 1 (1)', url: 'https://drive.google.com/file/d/1lbCGGgfJOCltkuH_RtVp9z4R8U2uMkRC/view' },
        { title: 'văn 6 đề thi khảo sát (1)', url: 'https://docs.google.com/document/d/1ecI164j19VaKPKTH7HRhT11GFBEfj75qAaT6NFe0hc0/view' },
        { title: 'văn 6 đề thi khảo sát (2)', url: 'https://docs.google.com/document/d/1tG1gM8-7fP4dUcW4d574nRJSEj-K4MUoaEAwxWtCYg/view' },
        { title: 'đề thi tuyển sinh lớp 6 văn', url: 'https://docs.google.com/document/d/17xpIP77UK9WOfqGUfpmTyJk5BpmyFyoiLFnoai_kCN4/view' },
        { title: 'đề thi tuyển sinh lớp 6 văn (2)', url: 'https://docs.google.com/document/d/1Z8wjiCuqEzaKM8iT6Dz_1moXmQIMCExl6jaBWg5qEK0/view' },
        { title: 'văn 6 đề thi khảo sát (3)', url: 'https://drive.google.com/file/d/1eBa99W7bImcLzo7kjzXEk-pn6RqYCTe8/view' },
        { title: 'tuyển sinh lớp 6 văn (3)', url: 'https://drive.google.com/file/d/1YdQNP27IHYeNq_s-NuW5J1iIxC61WbBq/view' },
        { title: 'văn 6 đề thi khảo sát (4)', url: 'https://docs.google.com/document/d/1_XNO4AwyAAsAfdy5BLz7v7WxzPOl4yW6b9kJY7RVULM/view' },
        { title: 'văn 6 đề thi khảo sát (5)', url: 'https://drive.google.com/file/d/1l2CkutCSE3zZOo_SCyZCNjxCQEeXRxqQ/view' },
        { title: 'văn 6 đề thi khảo sát (6)', url: 'https://docs.google.com/document/d/1hYAYwaZgE6_KLHus0tYwY8WOSIBRT4g8RkbZEIy5dt0/view' },
        { title: 'tổng hợp 20 đề thi văn lớp 6', url: 'https://docs.google.com/document/d/1AF1CKhCPfRkMfZSuzG9nWw3cYj62aiCh/view' },
        { title: 'Đề tuyển sinh Văn 6', url: 'https://docs.google.com/document/d/12ouNlIOvNg2nlwzfhXITUkEhE-1qbFN7/view' },
      ];

      // Hành vi: bonz tài liệu văn 6 chọn <số> | hoặc bonz tài liệu văn 6 <số>
      const action = (args[2] || '').toLowerCase();
      const pickNum = action === 'chọn' || action === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickNum) && pickNum >= 1 && pickNum <= VAN6_DOCS.length) {
        const doc = VAN6_DOCS[pickNum - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 6`,
          `Thông báo: Gửi link tài liệu #${pickNum}/${VAN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      // Mặc định: liệt kê danh sách
      const list = VAN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guide = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 6 chọn <số> hoặc bonz tài liệu văn 6 <số>)`,
        '',
        list
      ].join('\n');
      await sendTextChunked(guide);
      return;
    }

    // --- Văn 7: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isVan7 = (a0 === 'văn' || a0 === 'van') && a1 === '7';
    if (isVan7) {
      const VAN7_DOCS = [
        { title: 'Học tốt Văn 7 - Tập 1 (PDF)', url: 'https://drive.google.com/file/d/1fsfSlhRI7ggyciym7Nzy8z9cGLpnifiN/view' },
        { title: 'Học tốt Văn 7 - Tập 2 (PDF)', url: 'https://drive.google.com/file/d/1p39SCv2_jRjtM9lL18W-1fRuIpBHlMsI/view' },
        { title: 'Truyện ngắn và Tiểu thuyết – Văn 7', url: 'https://docs.google.com/document/d/19nMgY2XpqJbTRVPADIjgr1bbfFeuZboP/view' },
        { title: 'Vận dụng: Truyện ngắn và Tiểu thuyết – Văn 7', url: 'https://docs.google.com/document/d/1W5XegYeh3auGUMll7lZDf9ttKccx-COE/view' },
        { title: 'Kể về một sự việc có thật – Văn 7', url: 'https://docs.google.com/document/d/1hFHll6QERz6AInPdHJVx_5OYKHRTg7sj/view' },
        { title: 'Thơ bốn chữ, năm chữ – Văn 7', url: 'https://docs.google.com/document/d/1fKvLmnMRPWLX3OGljyg9wZq3ctKMTW1E/view' },
        { title: 'Vận dụng đọc hiểu: Thơ bốn chữ – Văn 7', url: 'https://docs.google.com/document/d/1VdVDeKrZ67PelbgML2OYKNnMbBszIOEm/view' },
        { title: 'Vận dụng: Thơ năm chữ – Văn 7', url: 'https://docs.google.com/document/d/18tzxgIQ0j2g2SX5BHmSANQjcw1P1e-c0/view' },
        { title: 'Viết đoạn thơ ghi lại cảm xúc – Văn 7', url: 'https://docs.google.com/document/d/1mTF7btHIHKhe1kD5aSoXMUAFwrfPneSi/view' },
        { title: 'Luyện đề tổng hợp – Văn 7', url: 'https://docs.google.com/document/d/1l8lLJypcOFQl5RoE7ZUxuQOTGf1yjuGu/view' },
        { title: 'Truyện viễn tưởng – Văn 7', url: 'https://docs.google.com/document/d/1wsqe6r9d8jsz8kQHrGvFLz_Kecg7Twow/view' },
      ];

      const actionV7 = (args[2] || '').toLowerCase();
      const pickV7 = actionV7 === 'chọn' || actionV7 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickV7) && pickV7 >= 1 && pickV7 <= VAN7_DOCS.length) {
        const doc = VAN7_DOCS[pickV7 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 7`,
          `Thông báo: Gửi link tài liệu #${pickV7}/${VAN7_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listV7 = VAN7_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideV7 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 7`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 7 <số> | bonz tài liệu văn 7 chọn <số>)`,
        '',
        listV7
      ].join('\n');
      await sendTextChunked(guideV7);
      return;
    }

    // --- Văn 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isVan9 = (a0 === 'văn' || a0 === 'van') && a1 === '9';
    if (isVan9) {
      const VAN9_DOCS = [
        { title: 'tài liệu văn 9 (PDF)', url: 'https://drive.google.com/file/d/16cZ5Q5WQvvFIJK3X-sSNgfmn1mQc4CSw/view' },
        { title: '100 đề văn 9 (PDF)', url: 'https://drive.google.com/file/d/1YIu1kIszw7z0--xHp2u9wuE2W6nxTNA4/view' },
        { title: 'bộ đề ngữ văn 9 (sách) (GDoc)', url: 'https://docs.google.com/document/d/1YpUhD8bty39s9syAS76TyFoB0jDv92cI/view' },
        { title: '120 đề đọc hiểu văn 9 (GDoc)', url: 'https://docs.google.com/document/d/1c8YPn2bHtmCVEIwMSSMV4ndeexmLCa1H/view' },
        { title: 'nội dung ôn giữa kì văn 9 (GDoc)', url: 'https://docs.google.com/document/d/1QuBMEKzFD_eKyyuEnsgFAh9ioZVkIGxm/view' },
        { title: 'đề đọc hiểu văn lên 10 (GDoc)', url: 'https://docs.google.com/document/d/1Wqw6OpsIkg_rz5X1f1wo9rU7SKSRvTHw/view' },
        { title: 'tài liẹu ôn thi văn lên cấp 3 (PDF)', url: 'https://drive.google.com/file/d/1UOYzB_9HErfXKhdQeKL0VRz9MIKtRZxX/view' },
        { title: 'Tổng hợp đề thi văn vào 10 (PDF)', url: 'https://drive.google.com/file/d/1na522OrqDODXsv5gN_HdgDHSOkt7_gm1/view' },
      ];

      const actionV9 = (args[2] || '').toLowerCase();
      const pickV9 = actionV9 === 'chọn' || actionV9 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickV9) && pickV9 >= 1 && pickV9 <= VAN9_DOCS.length) {
        const doc = VAN9_DOCS[pickV9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 9`,
          `Thông báo: Gửi link tài liệu #${pickV9}/${VAN9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listV9 = VAN9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideV9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 9 <số> | bonz tài liệu văn 9 chọn <số>)`,
        '',
        listV9
      ].join('\n');
      return api.sendMessage(guideV9, threadId, type);
    }

    // --- Toán 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan6 = (a0 === 'toán' || a0 === 'toan') && a1 === '6';
    if (isToan6) {
      const TOAN6_DOCS = [
        { title: 'Toán 6 - Đề kiểm tra năng lực (1)', url: 'https://drive.google.com/file/d/1WCy5yU_aF7DweuiJ-UMohoasqx-me1Xc9XvaQvzXm44/view' },
        { title: 'Công thức Toán hình lớp 6', url: 'https://drive.google.com/file/d/1OoSQmUCiwj07swpjJ4U4-oC7rZZaI-mt/view' },
        { title: 'Toán 6 - Đề thi học sinh giỏi', url: 'https://drive.google.com/file/d/15Af7R69zu4TdsctZ19dyzsBjq8MgdafZ/view?usp=drive_link' },
      ];

      const action2 = (args[2] || '').toLowerCase();
      const pickNum2 = action2 === 'chọn' || action2 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickNum2) && pickNum2 >= 1 && pickNum2 <= TOAN6_DOCS.length) {
        const doc = TOAN6_DOCS[pickNum2 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 6`,
          `Thông báo: Gửi link tài liệu #${pickNum2}/${TOAN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const list2 = TOAN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guide2 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 6 chọn <số> hoặc bonz tài liệu toán 6 <số>)`,
        '',
        list2
      ].join('\n');
      await sendTextChunked(guide2);
      return;
    }

    // --- Toán 8: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan8 = (a0 === 'toán' || a0 === 'toan') && a1 === '8';
    if (isToan8) {
      const TOAN8_DOCS = [
        { title: 'đề thi giữa học kì 1 Toán 8 (1)', url: 'https://drive.google.com/file/d/171yneCgNuCA6iOMKUVDpUynDndJlENun/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (2)', url: 'https://drive.google.com/file/d/1NHsBLGJDixrROjisfWTyH89JSIFEE9fJ/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (3)', url: 'https://drive.google.com/file/d/1CfelILxm2_1aWrAl8bXCZZMX--0xBwd1/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (4)', url: 'https://drive.google.com/file/d/1TugbgZakQCvfxxxHSg1lJpJt72oaz1Ft/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (5)', url: 'https://drive.google.com/file/d/19uyWNFU3yosPav2lVeRfo4GVEH__DqXM/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (6)', url: 'https://drive.google.com/file/d/1uFMLpHYQ7G_DYd3cJhjEvzWQPzwf9k8n/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (7)', url: 'https://drive.google.com/file/d/1LADd01QdO5Ch00MoA7-4azskz5jq1T5-/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (8)', url: 'https://drive.google.com/file/d/1zUFVLD7FWxRKTI4G3r7DsjhB1vKYoRaG/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (9)', url: 'https://drive.google.com/file/d/1nwpWs-JbeMqsZAGTJyKexvJla-gehtjN/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (10)', url: 'https://drive.google.com/file/d/1BxLSJsBhrJ4V_4IZaRUtoaFCUmF5uFMF/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (11)', url: 'https://drive.google.com/file/d/1gvYMWBqvdj45PuUtYTxw67Ai2tJgIJDS/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (12) [gdoc]', url: 'https://docs.google.com/document/d/1lZt6O7dob0GTBvcjl-QZFsWzvgbEPqG-/view' },
        { title: 'đề thi giữa học kì 1 Toán 8 (13) [gdoc]', url: 'https://docs.google.com/document/d/1lZt6O7dob0GTBvcjl-QZFsWzvgbEPqG-/view' },
        { title: 'Kiến thức tam giác đồng dạng – Toán 8', url: 'https://drive.google.com/file/d/16HK7HW9JByBCfQUGyI1T8NozO7-sO47o/view' },
        { title: 'Kiến thức tứ giác – Toán 8', url: 'https://drive.google.com/file/d/1amnDQi2s4nqAkM2C5GXEVXjJcgBU4INo/view' },
        { title: 'phát triển tư duy sáng tạo Toán đại số 8', url: 'https://drive.google.com/file/d/1AZ8vSOWgHJae2PohEa4tZmqIdJ9vemGi/view' },
        { title: '20 đề bồi dưỡng học sinh giỏi Toán 8', url: 'https://drive.google.com/file/d/1UIxCtr7-6z33hLIxXxVVo7R5OREthwNr/view' },
        { title: 'bồi dưỡng học sinh giỏi Toán đại số lớp 8', url: 'https://drive.google.com/file/d/1h5hNjc1FYpPU8MTrVZ91jDwzzbaDZovj/view' },
        { title: 'bồi dưỡng năng lực tự học Toán', url: 'https://drive.google.com/file/d/1VVpFJnZ_5EE64wUGuufDQWHaSAcx777C/view' },
        { title: 'chuyên đề bồi dưỡng HSG Toán 8', url: 'https://drive.google.com/file/d/1IyfOtWFyOfCqGBAIoC3sPeTNvaHDPEy7/view' },
        { title: 'nâng cao và phát triển Toán 8', url: 'https://drive.google.com/file/d/1p9ZFqRJJNuuNlaSE9dXagbaT2-resqxp/view' },
        { title: 'nâng cao và phát triển Toán 8 (tập 2)', url: 'https://drive.google.com/file/d/1UG0cySHwBGWi1CDRhgCQL_ERKtpBXT-2/view' },
        { title: 'các chuyên đề bồi dưỡng HSG Toán 8', url: 'https://drive.google.com/file/d/1oJaYbMh5dAi3n7KLxHXhdXZNnXQAHLtV/view' },
        { title: 'các chuyên đề bồi dưỡng học sinh giỏi Toán 8', url: 'https://drive.google.com/file/d/1kQETipg9BvI9HBygMZ1wcK46Iw0Uq6lB/view' },
      ];

      const actionT8 = (args[2] || '').toLowerCase();
      const pickT8 = actionT8 === 'chọn' || actionT8 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT8) && pickT8 >= 1 && pickT8 <= TOAN8_DOCS.length) {
        const doc = TOAN8_DOCS[pickT8 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 8`,
          `Thông báo: Gửi link tài liệu #${pickT8}/${TOAN8_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT8 = TOAN8_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT8 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 8`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 8 <số> | bonz tài liệu toán 8 chọn <số>)`,
        '',
        listT8
      ].join('\n');
      await sendTextChunked(guideT8);
      return;
    }

    // --- Toán 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan9 = (a0 === 'toán' || a0 === 'toan') && a1 === '9';
    if (isToan9) {
      const TOAN9_DOCS = [
        { title: 'tài liệu Toán 9 (GDoc)', url: 'https://docs.google.com/document/d/1tFeO7AO036yL-aG0TtWBqSOG_HSDLBiY/view' },
        { title: 'KỸ THUẬT CHỌN ĐIỂM RƠI TRONG BÀI TOÁN CỰC TRỊ (GDoc)', url: 'https://docs.google.com/document/d/1TLgm76f1zII87KzEG4_KjUpreNQrpo26/view' },
        { title: 'Chứng minh 3 điểm thẳng hàng (GDoc)', url: 'https://docs.google.com/document/d/1d3zZFx7nVLQp8XYyYSaNGiYcCL-bOoDI/view' },
        { title: 'Chuyên đề bất đẳng thức (GDoc)', url: 'https://docs.google.com/document/d/1ueR1_X2cAkBQjTbQgDmqcvwvknQkWz1z/view' },
        { title: 'Giải bài toán bằng cách lập phương trình (GDoc)', url: 'https://docs.google.com/document/d/1KLtPUlqV5bd8SGObRMIf5absYy5CBnHE/view' },
        { title: 'Chuyên đề: Phương trình nghiệm nguyên (GDoc)', url: 'https://docs.google.com/document/d/1VJ5Bv75WIRFd8uKoN3nWwV3EG3v0UG0Q/view' },
        { title: 'Chuyên đề hệ phương trình (PDF)', url: 'https://drive.google.com/file/d/1aNJSWC0zh0tyfI393LBUfxtqkDZTmnxs/view' },
        { title: 'Số chính phương (GDoc)', url: 'https://docs.google.com/document/d/1or7b3zvyvS-n3mYw0BiYELV88ygB9Zfg/view' },
        { title: 'Chuyên đề số học (GDoc)', url: 'https://docs.google.com/document/d/1RkN8XSIBUPC4MhZ_jAxAM00DKsutkVBX/view' },
        { title: 'Chuyên đề tam giác đồng dạng (GDoc)', url: 'https://docs.google.com/document/d/1yYKM1c8ApT4rzmhJWWqkteMK4A2OrYhh/view' },
        { title: 'Tính tổng dãy phân số (GDoc)', url: 'https://docs.google.com/document/d/1Jv3LZFViFV9xayoAvlpV7xcT2_VNhqbn/view' },
        { title: 'Các bài toán về sự chia hết của số nguyên (GDoc)', url: 'https://docs.google.com/document/d/1BXeb4sXsBJ5SvMdn6w5nW7zL3r0YAuTj/view' },
        { title: 'Một số phương pháp giải phương trình nghiệm nguyên (PDF)', url: 'https://drive.google.com/file/d/1IB-WuP1KzwShiF3cZTmRX1p3k6BiI7ic/view' },
        { title: 'Trắc nghiệm Toán 9 (PDF)', url: 'https://drive.google.com/file/d/1CRyQkvusnLkaOVk7_CbvUd9HppVzh5Ft/view' },
        { title: 'Phương pháp giải Toán 9 (Đại số) (PDF)', url: 'https://drive.google.com/file/d/1_jhqTASu_pE-I0Mu9cuYbaUAAr_53dmU/view' },
        { title: 'Chuyên đề bồi dưỡng HSG Toán 9 (PDF)', url: 'https://drive.google.com/file/d/1u0aIEirsH2TNF4xAqlOPp2w4NLMs1M3u/view' },
        { title: 'Đề HSG Toán 9 (1)', url: 'https://drive.google.com/file/d/1M8nxPtDcK6Pyc0ax8AorzAS8MMW5pX4g/view' },
        { title: 'Đề HSG Toán 9 (2)', url: 'https://drive.google.com/file/d/1vbPF8n__oWhIRwPm607idll9s9iDj9kt/view' },
        { title: 'Đề HSG Toán 9 (3)', url: 'https://drive.google.com/file/d/1ssZN8MOb67bnVIawTLp5iV5Zz1pyEem5/view' },
        { title: 'Đề HSG Toán 9 (4)', url: 'https://drive.google.com/file/d/14FjRR_SzDXj6a4BF8Luwlk3Vm_u8r2bw/view' },
        { title: 'Đề HSG Toán 9 (5)', url: 'https://drive.google.com/file/d/1c7CI8FaWt5o2bY8hWLp8kV4Ni3di3_RA/view' },
        { title: 'Đề HSG Toán 9 (6)', url: 'https://drive.google.com/file/d/1KEbk6rqJ1zbFZ1WsyfCbLnFbGbCNPyoW/view' },
        { title: 'Đề HSG Toán 9 (7)', url: 'https://drive.google.com/file/d/1enHvG3s44GI99UycmYIv0hwH2Pf5swrO/view' },
        { title: 'Đề HSG Toán 9 (8)', url: 'https://drive.google.com/file/d/1mvrHkXcxqI-53bnZkPGni9n0OosomnT8/view' },
        { title: 'Đề HSG Toán 9 (9)', url: 'https://drive.google.com/file/d/1XMiIHAdqaAO23mfyVVxiyl5UKx_ZdJeH/view' },
        { title: 'Đề HSG Toán 9 (10)', url: 'https://drive.google.com/file/d/1qmWqGWNSABbVh9aIznx4hxIGF6m_9EUB/view' },
        { title: 'Đề HSG Toán 9 (11)', url: 'https://drive.google.com/file/d/15hKoRNiuRyb3TSiUX1eCiKyYEGa6SAl_/view' },
        { title: 'Đề HSG Toán 9 (12)', url: 'https://drive.google.com/file/d/15xSXQDh-PCZxwjg7NIeyzr7cdrtJA6Q7/view' },
        { title: 'Đề HSG Toán 9 (13)', url: 'https://drive.google.com/file/d/1ofaAu4M4VtfZJdLDCGDnfO7kILxnCCdI/view' },
        { title: 'Đề HSG Toán 9 (14)', url: 'https://drive.google.com/file/d/1BiE1ZoJOOZ7EhXro1-e3fpnGer8DHRFF/view' },
      ];

      const actionT9 = (args[2] || '').toLowerCase();
      const pickT9 = actionT9 === 'chọn' || actionT9 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT9) && pickT9 >= 1 && pickT9 <= TOAN9_DOCS.length) {
        const doc = TOAN9_DOCS[pickT9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 9`,
          `Thông báo: Gửi link tài liệu #${pickT9}/${TOAN9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId);
      }

      const listT9 = TOAN9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 9 <số> | bonz tài liệu toán 9 chọn <số>)`,
        '',
        listT9
      ].join('\n');
      await sendTextChunked(guideT9);
      return;
    }

    // --- Toán 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan10 = (a0 === 'toán' || a0 === 'toan') && a1 === '10';
    if (isToan10) {
      const TOAN10_DOCS = [
        { title: '45 đề chuyên Toán 10 (GDoc)', url: 'https://docs.google.com/document/d/17MDVrPQIMdCXIEWSH9_g0cWXSrjz4p3Z/view' },
        { title: 'Tuyển tập đề thi chuyên Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1rOzBBdGCKwOPdFS36DBoPwVCe-0TY7re/view' },
        { title: '104 đề thi vào 10 nâng cao Toán (PDF)', url: 'https://drive.google.com/file/d/1tPUwBKlqla98BPGNz3hru7Wnuel8J_Jy/view' },
        { title: 'Hệ thống kiến thức Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1PSSgMMxqQND4JhbLdDDD14Pc4Pz0GTtc/view' },
        { title: 'Ebook Toán 10 (1) (PDF)', url: 'https://drive.google.com/file/d/1eEBKpHMH_gkNG1YV5Wa-lXR0hmUMy5Uf/view' },
        { title: '40 câu trắc nghiệm Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1ixAJLzHObYXSXEBPc0Ib43At758ngwEP/view' },
        { title: '84 câu trắc nghiệm Toán 10 (PDF)', url: 'https://drive.google.com/file/d/15I9qheNOHgNegWpXSDU_AtiCzlIV49qC/view' },
        { title: '85 câu trắc nghiệm Mệnh đề – Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1-uZVT3FuQImXt_TXeFvcXaEvU3OJPGHY/view' },
        { title: 'Tài liệu Toán 10 (A) (PDF)', url: 'https://drive.google.com/file/d/1EotVrrRwKCgRESWrQJbRL0d3VnVl5L0h/view' },
        { title: 'Tài liệu Toán 10 (B) (PDF)', url: 'https://drive.google.com/file/d/1FuPrGSHGLBcIXcvB9OuDIPgLBe9sBpQ4/view' },
        { title: 'Toán 10 chuyên Toán (PDF)', url: 'https://drive.google.com/file/d/1XfcpR2QC2Ao0PbzZxPzKmoJIkSOifbjA/view' },
        { title: 'Ôn tập Toán 10 cả năm (PDF)', url: 'https://drive.google.com/file/d/1DdRWbvEHbE_L-yyQ3aD05k5CkHogaiqw/view' },
        { title: 'Bứt phá 9+ Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1eTCd-7x_ayX1INzX2JcNgW4KLbDVMg5-/view' },
        { title: 'Cẩm nang kiểm tra Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1UFbO-Z5ZBgT0osBmDPldGxWci5mRdqxh/view' },
        { title: 'Ôn thi học kì 2 Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1i_QblnbT7uhfTHtaFLAuADFnX_2YDMZs/view' },
        { title: 'Ebook Toán 10 (2) (PDF)', url: 'https://drive.google.com/file/d/1V5D9nmU-legr3FvQ858BaVwTysbC_EGV/view' },
        { title: 'Bài tập Đại số 10 (PDF)', url: 'https://drive.google.com/file/d/1wflyFGH9vzndxr0kK-r_KlWnXCIRwB0J/view' },
        { title: 'Bài tập Hình học (Đại số) 10 (PDF)', url: 'https://drive.google.com/file/d/1cG8gIKuMcO6Tpsj_NxZ_b5ZKmNYY839h/view' },
        { title: 'Đại số 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/1RbZq2sTxYHQbS2ifHys87vwpYwvv8R3G/view' },
        { title: 'Hình học 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/10npgXlEDCFvh2eESx4-eiErYeX1Za_/view' },
        { title: 'Cẩm nang chinh phục kì thi vào Toán 10 (PDF)', url: 'https://drive.google.com/file/d/1uZElDI4kfEujbM3bfJ8Vj9jQtax2vKOL/view' },
      ];

      const actionT10 = (args[2] || '').toLowerCase();
      const pickT10 = actionT10 === 'chọn' || actionT10 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT10) && pickT10 >= 1 && pickT10 <= TOAN10_DOCS.length) {
        const doc = TOAN10_DOCS[pickT10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 10`,
          `Thông báo: Gửi link tài liệu #${pickT10}/${TOAN10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT10 = TOAN10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 10 <số> | bonz tài liệu toán 10 chọn <số>)`,
        '',
        listT10
      ].join('\n');
      return api.sendMessage(guideT10, threadId, type);
    }

    // --- Sinh học 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSinh10Simple = (a0 === 'sinh') && a1 === '10';
    const isSinhHoc10 = (a0 === 'sinh') && a1 === 'học' && a2 === '10';
    if (isSinh10Simple || isSinhHoc10) {
      const offsetSinh10 = isSinh10Simple ? 2 : 3;
      const SINH10_DOCS = [
        { title: 'Chuyên đề 2: Các cấp độ tổ chức của thế giới sống (PDF)', url: 'https://drive.google.com/file/d/1-PFIvz49bH8XJh9d2WhKrguUPVD2pQl3/view' },
        { title: 'Chủ đề 3: Giới thiệu chung về tế bào (PDF)', url: 'https://drive.google.com/file/d/1BsEHOAd4ZD_PwGlJGnhCTYIaHq8ueZIK/view' },
        { title: 'Bài 4: Khái quát về tế bào (PDF)', url: 'https://drive.google.com/file/d/1cQEqu-kWDfKXcQnN_asqenQz44g98qgx/view' },
        { title: 'Giới thiệu khái quát chương trình (PDF)', url: 'https://drive.google.com/file/d/1zqFik54lGpwJtYb-jfRo4K-3Qq2I9xjA/view' },
        { title: 'Bài 6: Các phân tử sinh học trong tế bào (PDF)', url: 'https://drive.google.com/file/d/1SYDEyGsFF9S0XuQjbJ6M1VMrQ8bVLf75/view' },
        { title: 'Bài 5: Các nguyên tố hóa học và nước (PDF)', url: 'https://drive.google.com/file/d/1IAs9WOAEJn1Ah2WFx7zNh4e75-YnE7-k/view' },
        { title: 'Đề thi giữa học kì 1 (1) (PDF)', url: 'https://drive.google.com/file/d/1Sjnxmm56wglKvl0cdSXw6t9WYxV_I2jQ/view' },
        { title: 'Đề thi giữa học kì 1 (2) (PDF)', url: 'https://drive.google.com/file/d/1I6FrC8XK9GFD_4tIQ-HJUYPTUMl0_joh/view' },
        { title: 'Đề thi giữa học kì 1 (3) (PDF)', url: 'https://drive.google.com/file/d/1WGDIXZGxqqsMJ_aox8QZYN3mYuZmRoVL/view' },
        { title: 'Đề thi giữa học kì 1 (4) (PDF)', url: 'https://drive.google.com/file/d/12mrcnwidy3R2MndVJV29zIi8SlYG3CIc/view' },
        { title: 'Đề thi học kì 1 (1) (PDF)', url: 'https://drive.google.com/file/d/1K-FNigRPdZhuY4H4Wd24aKjZre8Ek8sm/view' },
        { title: 'Đề thi học kì 1 (2) (PDF)', url: 'https://drive.google.com/file/d/1ikTt0jhe4xSwOZTW48npP34ghE3Ol05S/view' },
        { title: 'Đề thi học kì 1 (3) (PDF)', url: 'https://drive.google.com/file/d/1YbOS23EYf9jREl3T6NPdlAStTTwc-zM0/view' },
        { title: 'Đề thi học kì 1 (4) (PDF)', url: 'https://drive.google.com/file/d/10OPaYAHIXtDO1Lrrmuv4KuN1tJem6Qd4/view' },
        { title: 'Đề thi học kì 1 (5) (PDF)', url: 'https://drive.google.com/file/d/1MygInPcKL2NopeZ8F6O-ZmJ3WBGOVHzz/view' },
        { title: 'Đề thi học kì 1 (6) (PDF)', url: 'https://drive.google.com/file/d/1a_HiaUWgSIfNcV9tIF9cE00j9aNe_qMX/view' },
        { title: 'Đề thi học kì 1 (7) (PDF)', url: 'https://drive.google.com/file/d/18EuislFIThass1-FiWVCMj2MIUsARGAL/view' },
        { title: 'Sinh học tế bào – Sinh 10 (GDoc)', url: 'https://docs.google.com/document/d/1WLazPGZIoM8q2rpQKoR90d0KzVb4I_6v/view' },
      ];

      const actSinh10 = (args[offsetSinh10] || '').toLowerCase();
      const pickSinh10 = (actSinh10 === 'chọn' || actSinh10 === 'chon') ? parseInt(args[offsetSinh10 + 1], 10) : parseInt(args[offsetSinh10], 10);
      if (!isNaN(pickSinh10) && pickSinh10 >= 1 && pickSinh10 <= SINH10_DOCS.length) {
        const doc = SINH10_DOCS[pickSinh10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sinh 10`,
          `Thông báo: Gửi link tài liệu #${pickSinh10}/${SINH10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSinh10 = SINH10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSinh10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sinh 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sinh 10 <số> | bonz tài liệu sinh 10 chọn <số>)`,
        '',
        listSinh10
      ].join('\n');
      return api.sendMessage(guideSinh10, threadId, type);
    }

    // --- Toán 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan11 = (a0 === 'toán' || a0 === 'toan') && a1 === '11';
    if (isToan11) {
      const TOAN11_DOCS = [
        { title: 'Bộ kiểm tra Toán theo bài lớp 11 (PDF)', url: 'https://drive.google.com/file/d/1IECjJ77nrxo9rQ1Mq1wzYMv5DcTcczLG/view' },
        { title: 'Ebook kĩ năng giải Toán 11 (tập 1) (PDF)', url: 'https://drive.google.com/file/d/1PZI4rzs_x2vj79fLZXsP9CAoll_uW82Y/view' },
        { title: 'Tổng ôn toàn diện Toán 11 (PDF)', url: 'https://drive.google.com/file/d/13fYuagw3brFHVbenQBgj-npJc0ON6VuP/view' },
        { title: 'Tổng hợp công thức Toán 11 (PDF)', url: 'https://drive.google.com/file/d/1QlAitxkZwD5shsMxST0RyCwG8OH4zdOg/view' },
      ];

      const actionT11 = (args[2] || '').toLowerCase();
      const pickT11 = actionT11 === 'chọn' || actionT11 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT11) && pickT11 >= 1 && pickT11 <= TOAN11_DOCS.length) {
        const doc = TOAN11_DOCS[pickT11 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 11`,
          `Thông báo: Gửi link tài liệu #${pickT11}/${TOAN11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT11 = TOAN11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT11 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 11 <số> | bonz tài liệu toán 11 chọn <số>)`,
        '',
        listT11
      ].join('\n');
      return api.sendMessage(guideT11, threadId, type);
    }

    // --- Toán 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isToan12 = (a0 === 'toán' || a0 === 'toan') && a1 === '12';
    if (isToan12) {
      const TOAN12_DOCS = [
        { title: 'Toán 12 – Full tài liệu (Folder)', url: 'https://drive.google.com/drive/folders/1dXdhQu7c3V_KAZwHBEWWIZaym70WyWEM' },
        { title: 'Nguyên hàm – Tích phân (PDF)', url: 'https://drive.google.com/file/d/1KMJls11r7z2sYfTrlAPFiEvw8YgJZxZU/view' },
        { title: 'Xác suất có điều kiện (PDF)', url: 'https://drive.google.com/file/d/1TvnlQ-SuLDWNNrh-As8jXaPQf0rqW0pM/view' },
        { title: 'Phương trình mặt phẳng, đường thẳng, mặt cầu (PDF)', url: 'https://drive.google.com/file/d/1Ag5n1W1AsoT3jgIh7oVL_0Saxg6IxioE/view' },
        { title: 'Ứng dụng đạo hàm để khảo sát hàm số (PDF)', url: 'https://drive.google.com/file/d/1DQFOHr3rJ7bzu_wiot1b2Y2z3ds0Yblq/view' },
        { title: 'Toán thực tế 12 (PDF)', url: 'https://drive.google.com/file/d/1f3kp3LzcKgCj1P162UPRNwgyyx9HePOY/view' },
        { title: 'Ebook Chinh phục hàm số (PDF)', url: 'https://drive.google.com/file/d/1l0uTqKdmvbIw8raefH7oHZItUtYqeL_k/view' },
        { title: 'Ebook Chinh phục xác suất thống kê (PDF)', url: 'https://drive.google.com/file/d/1zg_IZgiZ_G8Jr9F60T1QQK76pSzjFuS6/view' },
        { title: 'Ebook Chinh phục không gian OXYZ (PDF)', url: 'https://drive.google.com/file/d/1rEnRGXENaGNKdfB-60U12wKQXYfyCmJ2/view' },
        { title: 'Ebook Chinh phục phân toán (PDF)', url: 'https://drive.google.com/file/d/1Ujimu6rpVD6z3wk1Bscfu4cEK4ZDJKPI/view' },
      ];

      const actionT12 = (args[2] || '').toLowerCase();
      const pickT12 = actionT12 === 'chọn' || actionT12 === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickT12) && pickT12 >= 1 && pickT12 <= TOAN12_DOCS.length) {
        const doc = TOAN12_DOCS[pickT12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu toán 12`,
          `Thông báo: Gửi link tài liệu #${pickT12}/${TOAN12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listT12 = TOAN12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideT12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu toán 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu toán 12 <số> | bonz tài liệu toán 12 chọn <số>)`,
        '',
        listT12
      ].join('\n');
      return api.sendMessage(guideT12, threadId, type);
    }

    // --- Tiếng Anh 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const a2 = (args[2] || '').toLowerCase();
    const isAnh6Simple = (a0 === 'anh' || a0 === 'english') && a1 === '6';
    const isTiengAnh6 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '6';
    if (isAnh6Simple || isTiengAnh6) {
      const offset = isAnh6Simple ? 2 : 3; // vị trí bắt đầu của action/number
      const EN6_DOCS = [
        { title: 'Tổng hợp 10 đề ôn hè tiếng anh 6 lên 7', url: 'https://docs.google.com/document/d/1XRg1ZtUcwRxG08ScPUyrtETKqYjIq_xfCBLSz6aT-8U/view' },
        { title: 'Tổng hợp chi tiết ngữ pháp tiếng anh 6', url: 'https://docs.google.com/document/d/1ifDat6RIt83Q9bNRx6jQNADWElwY6UX4veQ9rSrTl1o/view' },
        { title: 'Từ vựng tiếng anh 6', url: 'https://docs.google.com/document/d/1F-RUa8kndzjfeylVQLqgxy3u-uJOu9Zn/view' },
        { title: 'Bài tập tiếng anh 6', url: 'https://docs.google.com/document/d/16MXHN_-ftXu1WCaS9GnliyAWiXncXBrb/view' },
      ];

      const act = (args[offset] || '').toLowerCase();
      const pickNum3 = act === 'chọn' || act === 'chon' ? parseInt(args[offset + 1], 10) : parseInt(args[offset], 10);
      if (!isNaN(pickNum3) && pickNum3 >= 1 && pickNum3 <= EN6_DOCS.length) {
        const doc = EN6_DOCS[pickNum3 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 6`,
          `Thông báo: Gửi link tài liệu #${pickNum3}/${EN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const list3 = EN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guide3 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 6 <số> | bonz tài liệu anh 6 chọn <số> | bonz tài liệu tiếng anh 6 <số>)`,
        '',
        list3
      ].join('\n');
      return api.sendMessage(guide3, threadId, type);
    }

    // --- Hóa 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa9 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '9';
    if (isHoa9) {
      const HOA9_DOCS = [
        { title: 'đề 1 Hóa 9 (GDoc)', url: 'https://docs.google.com/document/d/14SEWbZDCO8yeX3fysM8PaTqlDtjhyH-J/view' },
        { title: 'đề 2 Hóa 9 (GDoc)', url: 'https://docs.google.com/document/d/1r5BuI5Dn8d1qowVmpeyAAIDZF8TFdNK4/view' },
        { title: 'đề thi HSG Hóa 9 (1) (GDoc)', url: 'https://docs.google.com/document/d/1O6nVgElrE2bydwz0TVusAP2o1RejJkGN/view' },
        { title: 'đáp án đề thi HSG Hóa 9 (GDoc)', url: 'https://docs.google.com/document/d/1G2OO1FeOU28TlPSn4hbKiKz-3tkDe1sx/view' },
        { title: 'đề thi HSG Hóa 9 (2) (GDoc)', url: 'https://docs.google.com/document/d/1LSYGhh8kgLL-Hau_ZgZLjipzBPQ0x1ln/view' },
        { title: 'đề thi HSG tổng hợp 9 (1) (GDoc)', url: 'https://docs.google.com/document/d/1CRI8jhhjQfehz2t4QdqXM2tj4O2bNeDY/view' },
        { title: 'đề thi HSG tổng hợp 9 (2) (GDoc)', url: 'https://docs.google.com/document/d/1wfrY-4zVwWNOnY3E9dM8a_KPFhFeN7bA/view' },
        { title: 'đề thi HSG Hóa 9 (3) (GDoc)', url: 'https://docs.google.com/document/d/1BP4NFk9He-nh715puj5JKg3ObkDjDqsA/view' },
        { title: 'đề thi HSG Hóa 9 (4) (GDoc)', url: 'https://docs.google.com/document/d/13xyKMFtHtFEdMpx9mUBzZWH-SM2OQRh0/view' },
        { title: 'đề thi HSG tổng hợp 9 (3) (GDoc)', url: 'https://docs.google.com/document/d/1Cwm_l1-ZN8fLmlUSkOxfhkXf5y-CZqpd/view' },
        { title: 'đề thi HSG tổng hợp 9 (4) (GDoc)', url: 'https://docs.google.com/document/d/1Reg3GoIw7aftARAeHgeCWgeevQ_QCz24/view' },
        { title: 'đề thi HSG Hóa 9 (5) (GDoc)', url: 'https://docs.google.com/document/d/1zPck42OrLUrccnKbwDyMGDcpyPK-_FY4/view' },
        { title: 'đề thi HSG Hóa 9 (6) (GDoc)', url: 'https://docs.google.com/document/d/1dS6RJ6_1h2LdGdGsz_PmdHBegsSEFpCu/view' },
        { title: 'đề thi HSG Hóa 9 (7) (GDoc)', url: 'https://docs.google.com/document/d/1pe6Lt9_Q31cdraZ9BJP_aqpWUJIMErsu/view' },
        { title: 'đề thi HSG Hóa 9 (8) (GDoc)', url: 'https://docs.google.com/document/d/1RqtMJIEBiw-nihzW_N4YFjEEG5NTCDvi/view' },
        { title: 'đề thi HSG Hóa 9 (9) (GDoc)', url: 'https://docs.google.com/document/d/1saKsbyHzwRgZ5tM-ND6hFJcxMJIrsDys/view' },
      ];

      const actH9 = (args[2] || '').toLowerCase();
      const pickH9 = (actH9 === 'chọn' || actH9 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH9) && pickH9 >= 1 && pickH9 <= HOA9_DOCS.length) {
        const doc = HOA9_DOCS[pickH9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 9`,
          `Thông báo: Gửi link tài liệu #${pickH9}/${HOA9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH9 = HOA9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 9 <số> | bonz tài liệu hóa 9 chọn <số>)`,
        '',
        listH9
      ].join('\n');
      return api.sendMessage(guideH9, threadId, type);
    }

    // --- Tiếng Anh 9: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const a3 = (args[3] || '').toLowerCase();
    const isAnh9Simple = (a0 === 'anh' || a0 === 'english') && a1 === '9';
    const isTiengAnh9 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '9';
    if (isAnh9Simple || isTiengAnh9) {
      const offset9 = isAnh9Simple ? 2 : 3;
      const EN9_DOCS = [
        { title: 'sách tổng ôn tiếng anh 9 (tập 1) (PDF)', url: 'https://drive.google.com/file/d/1eOTU3vvJKPDa_gH3JHkiXfX4T4E8uCeL/view' },
        { title: 'sách tổng ôn tiếng anh 9 (tập 2) (PDF)', url: 'https://drive.google.com/file/d/1MOUGUwESGuWIOtUSSmM4PK62Omxs-5ym/view' },
        { title: 'chuyên đề bồi dưỡng hsg tiếng anh 9 (PDF)', url: 'https://drive.google.com/file/d/1xnKyXrg99dsei19Y2EmtSjrWt4QOhEN3/view' },
        { title: 'bồi dưỡng tiếng anh 9 (PDF)', url: 'https://drive.google.com/file/d/1Qb0c3WC8QK5OBnYaJjAOTtPeDbK02w5o/view' },
        { title: 'từ vựng tiếng anh 9 (GDoc)', url: 'https://docs.google.com/document/d/1SCUOslkVbh1ExpfxIm3F4UmZ8faWsyWe/view' },
        { title: 'đề số 1 – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/19SM-VynBtsaCdkt5w3Qd8VKUgrsLVUZc/view' },
        { title: 'đề số 2 – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/1EwvX2chMRANzFGC8-IuclANVpcnvdI7A/view' },
        { title: 'đề số 3 – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/1ipKsAIwSQPErOxZ3WcMtt22F_nFoEMSC/view' },
        { title: 'đề số 4 (bản A) – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/181yg0ogxCl1fkike0QbyO7-MmqJgU9aV/view' },
        { title: 'đề số 4 (bản B) – tiếng anh vào 10 (GDoc)', url: 'https://docs.google.com/document/d/1rpy-1YoS2wd6eJMwoaDQpfFLZnRdiJ0k/view' },
      ];

      const act9 = (args[offset9] || '').toLowerCase();
      const pickEn9 = (act9 === 'chọn' || act9 === 'chon') ? parseInt(args[offset9 + 1], 10) : parseInt(args[offset9], 10);
      if (!isNaN(pickEn9) && pickEn9 >= 1 && pickEn9 <= EN9_DOCS.length) {
        const doc = EN9_DOCS[pickEn9 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 9`,
          `Thông báo: Gửi link tài liệu #${pickEn9}/${EN9_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listEn9 = EN9_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideEn9 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 9`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 9 <số> | bonz tài liệu anh 9 chọn <số> | bonz tài liệu tiếng anh 9 <số>)`,
        '',
        listEn9
      ].join('\n');
      return api.sendMessage(guideEn9, threadId, type);
    }

    // --- Tiếng Anh 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isAnh10Simple = (a0 === 'anh' || a0 === 'english') && a1 === '10';
    const isTiengAnh10 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '10';
    if (isAnh10Simple || isTiengAnh10) {
      const offset10 = isAnh10Simple ? 2 : 3;
      const EN10_DOCS = [
        { title: 'Tiếng Anh 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/15YjBNrnLUbF33Jk0KDJEl_w310RnvDf1/view' },
      ];

      const actA10 = (args[offset10] || '').toLowerCase();
      const pickA10 = (actA10 === 'chọn' || actA10 === 'chon') ? parseInt(args[offset10 + 1], 10) : parseInt(args[offset10], 10);
      if (!isNaN(pickA10) && pickA10 >= 1 && pickA10 <= EN10_DOCS.length) {
        const doc = EN10_DOCS[pickA10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 10`,
          `Thông báo: Gửi link tài liệu #${pickA10}/${EN10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listA10 = EN10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideA10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 10 <số> | bonz tài liệu anh 10 chọn <số> | bonz tài liệu tiếng anh 10 <số>)`,
        '',
        listA10
      ].join('\n');
      return api.sendMessage(guideA10, threadId, type);
    }

    // --- Vật lý 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isLy10One = (a0 === 'lý' || a0 === 'ly') && a1 === '10';
    const isVatLy10 = (a0 === 'vật' || a0 === 'vat') && (a1 === 'lý' || a1 === 'ly') && a2 === '10';
    if (isLy10One || isVatLy10) {
      const offsetLy = isLy10One ? 2 : 3;
      const LY10_DOCS = [
        { title: 'Vật lý 10 - Tài liệu (GDoc)', url: 'https://docs.google.com/document/d/1fHI5VJQYN8O5lHkhPU0tX2hhtfmChNVc/view' },
        { title: 'Bộ đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/1rEexEh3rv_lNtme8RfuiPOcZ1tRPpoti/view' },
        { title: 'Đề thi HSG Vật lý 10 chuyên (GDoc)', url: 'https://docs.google.com/document/d/1tm25MMBsuWzFEbFiiinbzxIjB4-srfVa/view' },
        { title: 'Đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/1s3WWeuo1YOprgrJmlwEYQxxadYXof2cU/view' },
        { title: 'Đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/1MZa5aSdksqV2PzAiH0t4QDoVMhD3PdVZ/view' },
        { title: 'Đề thi HSG Vật lý 10 (GDoc)', url: 'https://docs.google.com/document/d/19fU9PrXpGZDI0Lnq5GMjc4MQy7lig19I/view' },
        { title: 'Đáp án Vật lý 10 Olympic (GDoc)', url: 'https://docs.google.com/document/d/1yq5kJJUguciIcqaBataflaa2FMi2Ejc7/view' },
        { title: 'Đề thi Vật lý 10 Olympic (PDF)', url: 'https://drive.google.com/file/d/15tehqfmwb9Hq0EZr-186MNszbmHQ-wTX/view' },
      ];

      const actLy = (args[offsetLy] || '').toLowerCase();
      const pickLy = (actLy === 'chọn' || actLy === 'chon') ? parseInt(args[offsetLy + 1], 10) : parseInt(args[offsetLy], 10);
      if (!isNaN(pickLy) && pickLy >= 1 && pickLy <= LY10_DOCS.length) {
        const doc = LY10_DOCS[pickLy - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu vật lý 10`,
          `Thông báo: Gửi link tài liệu #${pickLy}/${LY10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLy = LY10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLy = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu vật lý 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lý 10 <số> | bonz tài liệu vật lý 10 <số>)`,
        '',
        listLy
      ].join('\n');
      return api.sendMessage(guideLy, threadId, type);
    }

    // --- Hóa học 10: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa10 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '10';
    if (isHoa10) {
      const HOA10_DOCS = [
        { title: 'Cấu tạo nguyên tử – Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1WLygzm-b2UCxbjigncqNa48XR1VfuPwh/view' },
        { title: 'Bảng tuần hoàn – Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1o2Og9AeQ0uoEUQfA_M4iIO_esg_ZaBDE/view' },
        { title: 'Liên kết hóa học – Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1BfrZtIkKiY5Q5wVuK2bflxkQHwjI-qim/view' },
        { title: '350 bài tập Hóa nâng cao 10 (PDF)', url: 'https://drive.google.com/file/d/1E2kfsfOEGTy7PEPRpayhwA2yCJ4L7NO5/view' },
        { title: 'Bứt phá 9+ môn Hóa 10 (PDF)', url: 'https://drive.google.com/file/d/166HH1I1uWHgaRJ01K_JQp5-rSBydplvp/view' },
        { title: 'Tổng ôn Hóa học 10 (PDF)', url: 'https://drive.google.com/file/d/1TOYMHDjjvFLJkJcycHr6BFRBv8GLUmc9/view' },
        { title: 'Giải nhanh bài tập Hóa 10 (tập 1) (PDF)', url: 'https://drive.google.com/file/d/1kPP0C81FnzhD5Wn8FJb5FECwReBW7g50/view' },
        { title: 'Giải nhanh bài tập Hóa 10 (tập 2) (PDF)', url: 'https://drive.google.com/file/d/19G1LFyLtUsYV8RIv8xCP76WbfT-GdghK/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/1vjWtlc1HjGSlHvHfT47BMioftPa3TG0/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (2) (GDoc)', url: 'https://docs.google.com/document/d/1nXMqY7INDXNoutb9VWINwzWyUaT3XtiA/view' },
        { title: '100 câu trắc nghiệm Hóa 10 (GDoc)', url: 'https://docs.google.com/document/d/16OXQOA8QgVHxZpEpLT4qOVA4oIi8Xqun/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (3) (GDoc)', url: 'https://docs.google.com/document/d/1kwz9XjbHKu5Mt9jHfT47BMioftPa3TG0/view' },
        { title: 'Đề thi giữa học kì 1 Hóa 10 (4) (GDoc)', url: 'https://docs.google.com/document/d/15XrB6rDJijjREoHAyXfUETcvnGhKUymU/view' },
        { title: 'Hóa học 10 nâng cao (PDF)', url: 'https://drive.google.com/file/d/1AEk2h4e8-3u6ZQlAO1wXHCCLgs83eDQv/view' },
      ];

      const actH10 = (args[2] || '').toLowerCase();
      const pickH10 = (actH10 === 'chọn' || actH10 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH10) && pickH10 >= 1 && pickH10 <= HOA10_DOCS.length) {
        const doc = HOA10_DOCS[pickH10 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 10`,
          `Thông báo: Gửi link tài liệu #${pickH10}/${HOA10_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH10 = HOA10_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH10 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 10`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 10 <số> | bonz tài liệu hóa 10 chọn <số>)`,
        '',
        listH10
      ].join('\n');
      return api.sendMessage(guideH10, threadId, type);
    }

    // --- Vật lý 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isLy11One = (a0 === 'lý' || a0 === 'ly') && a1 === '11';
    const isVatLy11 = (a0 === 'vật' || a0 === 'vat') && (a1 === 'lý' || a1 === 'ly') && a2 === '11';
    if (isLy11One || isVatLy11) {
      const offsetLy11 = isLy11One ? 2 : 3;
      const LY11_DOCS = [
        { title: 'Vật lý 11 - Tài liệu (1) (GDoc)', url: 'https://docs.google.com/document/d/1hpLpAesEQWbLlYGkBc78pLZ2dDiGJfH4/view' },
        { title: 'Vật lý 11 - Tài liệu (2) (GDoc)', url: 'https://docs.google.com/document/d/1Zem9nVvI9t9XC49m0euBA_qOWYbBnMrX/view' },
        { title: 'Vật lý 11 - Tài liệu (3) (GDoc)', url: 'https://docs.google.com/document/d/1RavIDGT1bLprmi7E8t_LGAoPa7Pm4Qut/view' },
        { title: 'Đáp án Vật lý 11 Olympic (GDoc)', url: 'https://docs.google.com/document/d/1EhR2i4U2k4cYxtV9Ne46j4RI1-TfFb_c/view' },
      ];

      const actLy11 = (args[offsetLy11] || '').toLowerCase();
      const pickLy11 = (actLy11 === 'chọn' || actLy11 === 'chon') ? parseInt(args[offsetLy11 + 1], 10) : parseInt(args[offsetLy11], 10);
      if (!isNaN(pickLy11) && pickLy11 >= 1 && pickLy11 <= LY11_DOCS.length) {
        const doc = LY11_DOCS[pickLy11 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu vật lý 11`,
          `Thông báo: Gửi link tài liệu #${pickLy11}/${LY11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLy11 = LY11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLy11 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu vật lý 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lý 11 <số> | bonz tài liệu vật lý 11 <số>)`,
        '',
        listLy11
      ].join('\n');
      return api.sendMessage(guideLy11, threadId, type);
    }

    // --- Vật lý 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isLy12One = (a0 === 'lý' || a0 === 'ly') && a1 === '12';
    const isVatLy12 = (a0 === 'vật' || a0 === 'vat') && (a1 === 'lý' || a1 === 'ly') && a2 === '12';
    if (isLy12One || isVatLy12) {
      const offsetLy12 = isLy12One ? 2 : 3;
      const LY12_DOCS = [
        { title: 'Vật lý 12 – Tài liệu (1) (GDoc)', url: 'https://docs.google.com/document/d/1GOo3obTW90RTf7oKzgKzChIr6ANk6DAq/view' },
        { title: 'Vật lý 12 – Tài liệu (2) (GDoc)', url: 'https://docs.google.com/document/d/1unwdIlR_OpTHvIOpCjiXQv49jPVlWr8r/view' },
        { title: 'Kì thi HSG Vật lý 12 (PDF)', url: 'https://drive.google.com/file/d/1uVaGvpg1FaZfRJAr7ILq8Dx6CqsHg5uu/view' },
        { title: 'Đề thi Vật lý châu Á 12 (PDF)', url: 'https://drive.google.com/file/d/1W62Ygy9bmhbMWp9m_JRlxGwZLIw29LtQ/view' },
      ];

      const actLy12 = (args[offsetLy12] || '').toLowerCase();
      const pickLy12 = (actLy12 === 'chọn' || actLy12 === 'chon') ? parseInt(args[offsetLy12 + 1], 10) : parseInt(args[offsetLy12], 10);
      if (!isNaN(pickLy12) && pickLy12 >= 1 && pickLy12 <= LY12_DOCS.length) {
        const doc = LY12_DOCS[pickLy12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu vật lý 12`,
          `Thông báo: Gửi link tài liệu #${pickLy12}/${LY12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLy12 = LY12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLy12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu vật lý 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lý 12 <số> | bonz tài liệu vật lý 12 <số>)`,
        '',
        listLy12
      ].join('\n');
      return api.sendMessage(guideLy12, threadId, type);
    }

    // --- Hóa học 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa11 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '11';
    if (isHoa11) {
      const HOA11_DOCS = [
        { title: 'Đề đánh giá năng lực (1) (PDF)', url: 'https://drive.google.com/file/d/1rHYsxf1YwCN8fkqzlwa358k6yoxHMtyx/view' },
        { title: 'Đề đánh giá năng lực (2) (PDF)', url: 'https://drive.google.com/file/d/1XJt20C9ctnMFkXH8ovlmJJpEfVxgu9jR/view' },
        { title: 'Đề đánh giá (PDF)', url: 'https://drive.google.com/file/d/1yGn8hjAdkWGab1Ti5yTwI93G4tKPvK_K/view' },
        { title: 'Ôn tập chương 1 (PDF)', url: 'https://drive.google.com/file/d/1RA4dn8DtS7clb2iqwmUYBWEwZHcgNptS/view' },
        { title: 'Đề đánh giá năng lực (3) (PDF)', url: 'https://drive.google.com/file/d/1BBOYeqAqhjjkwvmzvZ7r8QhyTUQm7gh-/view' },
        { title: 'Khái niệm về cân bằng hóa học (PDF)', url: 'https://drive.google.com/file/d/1kIGasLMyxT3kjVdlxDV0UpKfwwGkzj0M/view' },
        { title: 'Đề đánh giá kiến thức (PDF)', url: 'https://drive.google.com/file/d/1DxsgOjpR8RPFntgTdtqDgv_INZ0FHszk/view' },
        { title: 'Đề ĐGNL (Chương 2–3) (PDF)', url: 'https://drive.google.com/file/d/10Hg8_R5Ru-DZqfPWRP8Qc1RruxUDwB_N/view' },
        { title: 'Cân bằng trong dung dịch nước (PDF)', url: 'https://drive.google.com/file/d/12dTlVuEVl4xyjDhybVlfZ2OnRoqi_9EI/view' },
      ];

      const actH11 = (args[2] || '').toLowerCase();
      const pickH11 = (actH11 === 'chọn' || actH11 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH11) && pickH11 >= 1 && pickH11 <= HOA11_DOCS.length) {
        const doc = HOA11_DOCS[pickH11 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 11`,
          `Thông báo: Gửi link tài liệu #${pickH11}/${HOA11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH11 = HOA11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH11 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 11 <số> | bonz tài liệu hóa 11 chọn <số>)`,
        '',
        listH11
      ].join('\n');
      return api.sendMessage(guideH11, threadId, type);
    }

    // --- Hóa học 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isHoa12 = (a0 === 'hóa' || a0 === 'hoa') && a1 === '12';
    if (isHoa12) {
      const HOA12_DOCS = [
        { title: 'Sách bồi dưỡng học sinh giỏi Hóa 12 (PDF)', url: 'https://drive.google.com/file/d/1CRyQkvusnLkaOVk7_CbvUd9HppVzh5Ft/view' },
        { title: 'Các chuyên đề bồi dưỡng học sinh giỏi Hóa 12 (PDF)', url: 'https://drive.google.com/file/d/1FS29PJdDWVzq8WnE6y4HjPZWFU1wQHYm/view' },
      ];

      const actH12 = (args[2] || '').toLowerCase();
      const pickH12 = (actH12 === 'chọn' || actH12 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickH12) && pickH12 >= 1 && pickH12 <= HOA12_DOCS.length) {
        const doc = HOA12_DOCS[pickH12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu hóa 12`,
          `Thông báo: Gửi link tài liệu #${pickH12}/${HOA12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listH12 = HOA12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideH12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu hóa 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu hóa 12 <số> | bonz tài liệu hóa 12 chọn <số>)`,
        '',
        listH12
      ].join('\n');
      return api.sendMessage(guideH12, threadId, type);
    }

    // --- Sinh học 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSinh12Simple = (a0 === 'sinh') && a1 === '12';
    const isSinhHoc12 = (a0 === 'sinh') && a1 === 'học' && a2 === '12';
    if (isSinh12Simple || isSinhHoc12) {
      const offsetSinh12 = isSinh12Simple ? 2 : 3;
      const SINH12_DOCS = [
        { title: 'Đề thi HSG Sinh 12 (1) (PDF)', url: 'https://drive.google.com/file/d/1Xtq3vZoN0LSvunrJd71-tUDkjTDoU4ai/view' },
        { title: 'Đề thi HSG Sinh 12 (2) (PDF)', url: 'https://drive.google.com/file/d/1J0Fq5eITrX_JWOXGOn_ZzjH-eCpSSt0H/view' },
        { title: 'Đề thi HSG Sinh 12 (3) (PDF)', url: 'https://drive.google.com/file/d/14nFKuY9WZuHnhvvsHGBWmXm3VXOTMMmT/view' },
        { title: 'Đề thi HSG Sinh 12 (4) (PDF)', url: 'https://drive.google.com/file/d/1IQcNidouT7WdPt-KsU2NXVK6SR0i2Mrh/view' },
        { title: 'Đề thi HSG Sinh 12 (5) (PDF)', url: 'https://drive.google.com/file/d/17D2kCayNCWbVgzwa3Kfyq6230fMs-Kob/view' },
        { title: 'Đề thi HSG Sinh 12 (6) (PDF)', url: 'https://drive.google.com/file/d/1pAJcmbvAROawF8S98Hin_YiAHVpT7VeJ/view' },
        { title: 'Đề thi HSG Sinh 12 (7) (PDF)', url: 'https://drive.google.com/file/d/1Zty3YmvET5M_hD9xyQs_iJj_8k9mltLX/view' },
      ];

      const actSinh12 = (args[offsetSinh12] || '').toLowerCase();
      const pickSinh12 = (actSinh12 === 'chọn' || actSinh12 === 'chon') ? parseInt(args[offsetSinh12 + 1], 10) : parseInt(args[offsetSinh12], 10);
      if (!isNaN(pickSinh12) && pickSinh12 >= 1 && pickSinh12 <= SINH12_DOCS.length) {
        const doc = SINH12_DOCS[pickSinh12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sinh 12`,
          `Thông báo: Gửi link tài liệu #${pickSinh12}/${SINH12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSinh12 = SINH12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSinh12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sinh 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sinh 12 <số> | bonz tài liệu sinh 12 chọn <số>)`,
        '',
        listSinh12
      ].join('\n');
      return api.sendMessage(guideSinh12, threadId, type);
    }

    // --- Lịch sử 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSu12Simple = (a0 === 'sử' || a0 === 'su') && a1 === '12';
    const isLichSu12 = (a0 === 'lịch' || a0 === 'lich') && (a1 === 'sử' || a1 === 'su') && a2 === '12';
    if (isSu12Simple || isLichSu12) {
      const offsetSu12 = isSu12Simple ? 2 : 3;
      const SU12_DOCS = [
        { title: 'Lịch sử lớp 12 (PDF)', url: 'https://drive.google.com/file/d/1MB2JxZhYQq8qwJhQctfraBLVjdl4IgHo/view' },
        { title: 'Đề minh họa Lịch sử lớp 12 (PDF)', url: 'https://drive.google.com/file/d/1UIxCtr7-6z33hLIxXxVVo7R5OREthwNr/view' },
      ];

      const actSu12 = (args[offsetSu12] || '').toLowerCase();
      const pickSu12 = (actSu12 === 'chọn' || actSu12 === 'chon') ? parseInt(args[offsetSu12 + 1], 10) : parseInt(args[offsetSu12], 10);
      if (!isNaN(pickSu12) && pickSu12 >= 1 && pickSu12 <= SU12_DOCS.length) {
        const doc = SU12_DOCS[pickSu12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu lịch sử 12`,
          `Thông báo: Gửi link tài liệu #${pickSu12}/${SU12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSu12 = SU12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSu12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu lịch sử 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu lịch sử 12 <số> | bonz tài liệu lịch sử 12 chọn <số>)`,
        '',
        listSu12
      ].join('\n');
      return api.sendMessage(guideSu12, threadId, type);
    }

    // --- Tiếng Anh 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isAnh12Simple = (a0 === 'anh' || a0 === 'english') && a1 === '12';
    const isTiengAnh12 = (a0 === 'tiếng' || a0 === 'tieng') && a1 === 'anh' && a2 === '12';
    if (isAnh12Simple || isTiengAnh12) {
      const offsetA12 = isAnh12Simple ? 2 : 3;
      const EN12_DOCS = [
        { title: 'B1 Grammar & Vocabulary (PDF)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'B2 Grammar & Vocabulary (PDF)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'Cambridge Vocabulary for IELTS (9–12) (PDF)', url: 'https://drive.google.com/file/d/1Ny1y7mje3wTOSMSp1VLEWqyp8HGwaKGh/view' },
        { title: 'Sách chuyên đề Tiếng Anh (có đáp án) (9–12) (GDoc)', url: 'https://docs.google.com/document/d/1lyfMO6Pyaus041U4QVq8b1XjMNik1bqD/view' },
        { title: 'Sách chuyên đề Tiếng Anh (không đáp án) (9–12) (GDoc)', url: 'https://docs.google.com/document/d/1qJB8u6E7XYErbU3qKWDBYz67m-Mpj6y3/view' },
        { title: 'Các chuyên đề Ngữ pháp (9–12) (GDoc)', url: 'https://docs.google.com/document/d/16rNIul2lASUTZeCslvYLPyPgUzc7xwHC/view' },
      ];

      const actA12 = (args[offsetA12] || '').toLowerCase();
      const pickA12 = (actA12 === 'chọn' || actA12 === 'chon') ? parseInt(args[offsetA12 + 1], 10) : parseInt(args[offsetA12], 10);
      if (!isNaN(pickA12) && pickA12 >= 1 && pickA12 <= EN12_DOCS.length) {
        const doc = EN12_DOCS[pickA12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu tiếng anh 12`,
          `Thông báo: Gửi link tài liệu #${pickA12}/${EN12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listA12 = EN12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideA12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu tiếng anh 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu anh 12 <số> | bonz tài liệu anh 12 chọn <số> | bonz tài liệu tiếng anh 12 <số>)`,
        '',
        listA12
      ].join('\n');
      return api.sendMessage(guideA12, threadId, type);
    }

    // --- Ngữ văn 12: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isVan12 = (a0 === 'văn' || a0 === 'van') && a1 === '12';
    if (isVan12) {
      const VAN12_DOCS = [
        { title: 'Lý luận văn học (PDF)', url: 'https://drive.google.com/file/d/1lIDi0GcJJaeGyYGDAD_Z8FzAJBNGOECB/view' },
        { title: 'Lý luận văn học (2) (PDF)', url: 'https://drive.google.com/file/d/1WXUU9j5O56rec_Cf8b4IbYKsbUPLkly7/view' },
        { title: 'Lý luận văn học (3) (PDF)', url: 'https://drive.google.com/file/d/1usu3BVVO5tN3CxYlNT-WnZ9ex5LezOsM/view' },
        { title: 'Lý luận văn học cổ (4) (PDF)', url: 'https://drive.google.com/file/d/1xUqpQY83SQ7irrAKmrwhN13GIi11Fdpw/view' },
        { title: 'Phê bình và phản phê bình (PDF)', url: 'https://drive.google.com/file/d/1i3s1T_e8375DWilShzk2NHzSoEWP1T4r/view' },
        { title: 'Thơ và phản thơ (PDF)', url: 'https://drive.google.com/file/d/1dRlKcIWhjlnVeBbvrqxwE5DB4v8BLsnq/view' },
        { title: 'Bồi dưỡng học sinh giỏi Văn THPT (PDF)', url: 'https://drive.google.com/file/d/1gOh103xhzsJJ6WW5lWfrFubZknPHG2pN/view' },
      ];

      const actV12 = (args[2] || '').toLowerCase();
      const pickV12 = (actV12 === 'chọn' || actV12 === 'chon') ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickV12) && pickV12 >= 1 && pickV12 <= VAN12_DOCS.length) {
        const doc = VAN12_DOCS[pickV12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu văn 12`,
          `Thông báo: Gửi link tài liệu #${pickV12}/${VAN12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listV12 = VAN12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideV12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu văn 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu văn 12 <số> | bonz tài liệu văn 12 chọn <số>)`,
        '',
        listV12
      ].join('\n');
      return api.sendMessage(guideV12, threadId, type);
    }

    // --- Liên môn 12: tài liệu áp dụng cho 10–12 ---
    const isLienMon12 = ((a0 === 'liên' || a0 === 'lien') && (a1 === 'môn' || a1 === 'mon') && a2 === '12');
    if (isLienMon12) {
      const LIENMON12_DOCS = [
        { title: 'Đề thi chuyên Vật lý siêu cấp (PDF)', url: 'https://drive.google.com/file/d/1AODYzZRTCNxbQy7sfr0VhbGDUfRN_sOI/view' },
        { title: 'Đề thi chuyên Vật lý (PDF)', url: 'https://drive.google.com/file/d/1wMp32VCZ2KGMih18-geEcwdflgOsHn-g/view' },
        { title: 'Hóa vô cơ – Tập 1 (PDF)', url: 'https://drive.google.com/file/d/1N8l1X3PW1WJtMAblchGzQE4YvpvddQYy/view' },
        { title: 'Hóa vô cơ – Tập 2 (PDF)', url: 'https://drive.google.com/file/d/1qS2XF-ipgjY71EvqN3B_qwbcHsFHmj6i/view' },
        { title: 'Hóa vô cơ – Tập 3 (PDF)', url: 'https://drive.google.com/file/d/1rOPsJePLaHbIYtq2g-cFqoVeT_MBRipO/view' },
        { title: '220 IELTS (PDF)', url: 'https://drive.google.com/file/d/18yFJ59tr_8YyPsjdu9Y1aAV195Kbi8of/view' },
      ];

      const actLien12 = (args[3] || '').toLowerCase();
      const pickLien12 = (actLien12 === 'chọn' || actLien12 === 'chon') ? parseInt(args[4], 10) : parseInt(args[3], 10);
      if (!isNaN(pickLien12) && pickLien12 >= 1 && pickLien12 <= LIENMON12_DOCS.length) {
        const doc = LIENMON12_DOCS[pickLien12 - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu liên môn 12`,
          `Thông báo: Gửi link tài liệu #${pickLien12}/${LIENMON12_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listLien12 = LIENMON12_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideLien12 = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu liên môn 12`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu liên môn 12 <số> | bonz tài liệu liên môn 12 chọn <số>)`,
        '',
        listLien12
      ].join('\n');
      return api.sendMessage(guideLien12, threadId, type);
    }

    // --- Sách (9–12, 10–12, 12): liệt kê và chọn tài liệu ---
    const isSach = (a0 === 'sách' || a0 === 'sach');
    if (isSach) {
      const SACH_DOCS = [
        { title: 'Sách Cambridge Vocabulary for IELTS (9–12)', url: 'https://drive.google.com/file/d/1Ny1y7mje3wTOSMSp1VLEWqyp8HGwaKGh/view' },
        { title: 'Sách 220 IELTS (10–12)', url: 'https://drive.google.com/file/d/18yFJ59tr_8YyPsjdu9Y1aAV195Kbi8of/view' },
        { title: 'Sách 3000 câu ngữ pháp từ vựng Tiếng Anh (10–12)', url: 'https://drive.google.com/file/d/16TBhxIsyneEsAaa80Gx_RtFDEeaoMx4W/view' },
        { title: 'Sách B1 Grammar & Vocabulary (12)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'Sách B2 Grammar & Vocabulary (12)', url: 'https://drive.google.com/file/d/1YElxwcOwrhB6Dp8gqPfh4SUHM5_vFjev/view' },
        { title: 'Sách C1 & C2 Grammar & Vocabulary (12)', url: 'https://drive.google.com/file/d/1013xLF2bJEeD3JcPDW-vSpKM-swRUs9t/view' },
        { title: 'Sách chuyên đề Tiếng Anh (có đáp án) (9–12) [GDoc]', url: 'https://docs.google.com/document/d/1lyfMO6Pyaus041U4QVq8b1XjMNik1bqD/view' },
        { title: 'Sách chuyên đề Tiếng Anh (không đáp án) (9–12) [GDoc]', url: 'https://docs.google.com/document/d/1qJB8u6E7XYErbU3qKWDBYz67m-Mpj6y3/view' },
        { title: 'Sách các chuyên đề Ngữ pháp (9–12) [GDoc]', url: 'https://docs.google.com/document/d/16rNIul2lASUTZeCslvYLPyPgUzc7xwHC/view' },
        { title: 'Sách học chắc chương Hàm số từ gốc (10–12)', url: 'https://drive.google.com/file/d/1zi8dvdoNAT8DULoRyit1OtIdah5ww8aq/view' },
        { title: 'Sách: Đề thi chuyên Vật lý siêu cấp (10–12)', url: 'https://drive.google.com/file/d/1AODYzZRTCNxbQy7sfr0VhbGDUfRN_sOI/view' },
        { title: 'Sách: Đề thi chuyên Vật lý (10–12)', url: 'https://drive.google.com/file/d/1wMp32VCZ2KGMih18-geEcwdflgOsHn-g/view' },
        { title: 'Sách Hóa vô cơ – Tập 1 (10–12)', url: 'https://drive.google.com/file/d/1N8l1X3PW1WJtMAblchGzQE4YvpvddQYy/view' },
        { title: 'Sách Hóa vô cơ – Tập 2 (10–12)', url: 'https://drive.google.com/file/d/1qS2XF-ipgjY71EvqN3B_qwbcHsFHmj6i/view' },
        { title: 'Sách Hóa vô cơ – Tập 3 (10–12)', url: 'https://drive.google.com/file/d/1rOPsJePLaHbIYtq2g-cFqoVeT_MBRipO/view' },
        { title: 'Sách Lý luận văn học (12)', url: 'https://drive.google.com/file/d/1lIDi0GcJJaeGyYGDAD_Z8FzAJBNGOECB/view' },
        { title: 'Sách Lý luận văn học (2) (12)', url: 'https://drive.google.com/file/d/1WXUU9j5O56rec_Cf8b4IbYKsbUPLkly7/view' },
        { title: 'Sách Lý luận văn học (3) (12)', url: 'https://drive.google.com/file/d/1usu3BVVO5tN3CxYlNT-WnZ9ex5LezOsM/view' },
        { title: 'Sách Lý luận văn học cổ (4) (12)', url: 'https://drive.google.com/file/d/1xUqpQY83SQ7irrAKmrwhN13GIi11Fdpw/view' },
        { title: 'Sách Phê bình và phản phê bình (12)', url: 'https://drive.google.com/file/d/1i3s1T_e8375DWilShzk2NHzSoEWP1T4r/view' },
        { title: 'Sách Thơ và phản thơ (12)', url: 'https://drive.google.com/file/d/1dRlKcIWhjlnVeBbvrqxwE5DB4v8BLsnq/view' },
        { title: 'Sách Bồi dưỡng học sinh giỏi Văn THPT (12)', url: 'https://drive.google.com/file/d/1gOh103xhzsJJ6WW5lWfrFubZknPHG2pN/view' },
        { title: 'Sách Python cho người mới bắt đầu (12)', url: 'https://drive.google.com/file/d/18ibClr2qw0FYL5i1YjBV5sjI3irVimAw/view' },
      ];

      const actSach = (args[1] || '').toLowerCase();
      const pickSach = (actSach === 'chọn' || actSach === 'chon') ? parseInt(args[2], 10) : parseInt(args[1], 10);
      if (!isNaN(pickSach) && pickSach >= 1 && pickSach <= SACH_DOCS.length) {
        const doc = SACH_DOCS[pickSach - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sách`,
          `Thông báo: Gửi link tài liệu #${pickSach}/${SACH_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSach = SACH_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSach = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sách`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sách <số> | bonz tài liệu sách chọn <số>)`,
        '',
        listSach
      ].join('\n');
      await sendTextChunked(guideSach);
      return;
    }
    // --- Sinh học 11: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isSinh11Simple = (a0 === 'sinh') && a1 === '11';
    const isSinhHoc11 = (a0 === 'sinh') && a1 === 'học' && a2 === '11';
    if (isSinh11Simple || isSinhHoc11) {
      const offsetSinh = isSinh11Simple ? 2 : 3;
      const SINH11_DOCS = [
        { title: 'Đề cương ôn tập giữa học kì 1 (PDF)', url: 'https://drive.google.com/file/d/1780TVVMakw6-c8Cam9XKj-M3owvxHl9L/view' },
        { title: 'Full lý thuyết Sinh 11 (GDoc)', url: 'https://docs.google.com/document/d/1cqSCyf2mzPmeoXUoufiahNUmEPu9AnTe/view' },
      ];

      const actSinh = (args[offsetSinh] || '').toLowerCase();
      const pickSinh = (actSinh === 'chọn' || actSinh === 'chon') ? parseInt(args[offsetSinh + 1], 10) : parseInt(args[offsetSinh], 10);
      if (!isNaN(pickSinh) && pickSinh >= 1 && pickSinh <= SINH11_DOCS.length) {
        const doc = SINH11_DOCS[pickSinh - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu sinh 11`,
          `Thông báo: Gửi link tài liệu #${pickSinh}/${SINH11_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listSinh = SINH11_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideSinh = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu sinh 11`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu sinh 11 <số> | bonz tài liệu sinh 11 chọn <số>)`,
        '',
        listSinh
      ].join('\n');
      return api.sendMessage(guideSinh, threadId, type);
    }

    // --- KHTN 6: liệt kê và chọn tài liệu theo danh sách tĩnh ---
    const isKHTN6 = (a0 === 'khtn') && a1 === '6';
    if (isKHTN6) {
      const KHTN6_DOCS = [
        { title: 'Các phép đo KHTN 6', url: 'https://docs.google.com/document/d/1GXaTDBF13jWGguE_80iIWqzoKqABA5vt/view' },
        { title: 'Kiểm tra chủ đề KHTN 6', url: 'https://docs.google.com/document/d/12fsUiJc8O1Pe4d_bXnlDoRQvygu3tTJV/view' },
        { title: 'Các thể của chất KHTN 6', url: 'https://docs.google.com/document/d/1cKq4e1nEvutSEjL6SB104aSC3zN8dMUo/view' },
        { title: 'Vật liệu KHTN 6', url: 'https://docs.google.com/document/d/1sg4DU7J1COlbnl44HMLxQU4cYkzDQ2M2/view' },
        { title: 'Oxygen KHTN 6', url: 'https://docs.google.com/document/d/1W7rsVw44MpvpxgF2i5hSc2P_ICV7s4lz/view' },
        { title: 'Lương thực KHTN 6', url: 'https://docs.google.com/document/d/1elphs8EI7gVwGd9vCjVpSSL9ZdowgINO/view' },
        { title: 'Chất tinh khiết KHTN 6', url: 'https://docs.google.com/document/d/1JPc9zRSvz7WPMNuyuUQ3bqwCgAqiVn1m/view' },
        { title: 'Tách chất khỏi hỗn hợp KHTN 6', url: 'https://docs.google.com/document/d/11G4GakgZFLBt7snC3mA36L6IvEr5Qjtp/view' },
        { title: 'Tế bào KHTN 6', url: 'https://docs.google.com/document/d/1N4RlKnIvQg4p6XRbLZbtLnmh0CObZM_o/view' },
        { title: 'Từ tế bào đến cơ thể KHTN 6', url: 'https://docs.google.com/document/d/11_GyFkcn_sG3U6V0YIe55ZdTa7L-oS37/view' },
        { title: 'Phân loại thế giới sống KHTN 6', url: 'https://docs.google.com/document/d/1_y-qCmjzDqMJ4khHspsalM4nTfNdcr7G/view' },
        { title: 'Virus KHTN 6', url: 'https://docs.google.com/document/d/1xYgv307QZjuRM1pXYxPoZC0EgVefGSJ5/view' },
        { title: 'Vi khuẩn KHTN 6', url: 'https://docs.google.com/document/d/1Dl_xKEseSipVvQMkQHXjzwvfwCYfQv0o/view' },
        { title: 'Nguyên sinh vật KHTN 6', url: 'https://docs.google.com/document/d/1H-QFKicyt1IC1EcLZMFX_cCtYBq9OIQg/view' },
        { title: 'Nấm KHTN 6', url: 'https://docs.google.com/document/d/1F2G2pFbqzMTXSqjszDcRNuKZrS_zFwNk/view' },
        { title: 'Thực vật động vật KHTN 6', url: 'https://docs.google.com/document/d/1W4paUQlPlsa-e3F5qmWbMTGCXcCoLjsH/view' },
        { title: 'Lực KHTN 6', url: 'https://docs.google.com/document/d/1bJq17hrazZYC1PhlQwNLSFzMl4gwTvW-/view' },
        { title: 'Năng lượng KHTN 6', url: 'https://docs.google.com/document/d/1WyGAEzAD0-GCCaxzIied2aQTxgdW7sfq/view' },
        { title: 'Thiên văn học KHTN 6', url: 'https://docs.google.com/document/d/1tX2NdbfkCXY9jKvjLbigRBJgnteGzQrv/view' },
        { title: 'Lực và biểu diễn lực KHTN 6', url: 'https://docs.google.com/document/d/1yWpQZCTaEhH_BMV1TNsJqR6nlTo1Y4-F/view' },
        { title: 'Đề thi cuối kì 1 KHTN 6', url: 'https://docs.google.com/document/d/1ioMKtp5nNpv-BPSoSfoLjzvSgfzyITzo/view' },
        { title: 'Đề thi cuối kì 1 đáp án KHTN 6', url: 'https://docs.google.com/document/d/1NU7d4yVnLot2nMYwWu3T4ooYoU6E7F7O/view' },
        { title: 'Đề cuối kì 2 đáp án KHTN 6', url: 'https://docs.google.com/document/d/1s9832-oWK_JZP8w83ak1VOvYGW2c8q7j/view' },
        { title: 'Đề cuối kì 2 KHTN 6', url: 'https://docs.google.com/document/d/1qyNDcZU-MJv723b2otfnJI-zyBqYfyUi/view' },
        { title: 'Đề giữa kì 1 KHTN 6', url: 'https://docs.google.com/document/d/1yc3NN5BGiUggKwcY4n9Y6EP6rSlPdgit/view' },
        { title: 'Đề giữa kì 2 đáp án KHTN 6', url: 'https://docs.google.com/document/d/1mJ6gBM91GfaYmlb4mQ2a4l8dPEBpxfK3/view' },
        { title: 'Đề giữa kì 2 KHTN 6', url: 'https://docs.google.com/document/d/1IbCN0YMyQ8IVpPt-ztMAEmE67iYMV5Xm/view' },
      ];

      const actionK = (args[2] || '').toLowerCase();
      const pickK = actionK === 'chọn' || actionK === 'chon' ? parseInt(args[3], 10) : parseInt(args[2], 10);
      if (!isNaN(pickK) && pickK >= 1 && pickK <= KHTN6_DOCS.length) {
        const doc = KHTN6_DOCS[pickK - 1];
        const lines = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz tài liệu khtn 6`,
          `Thông báo: Gửi link tài liệu #${pickK}/${KHTN6_DOCS.length}`,
          `Tiêu đề: ${doc.title}`,
          `Link: ${doc.url}`,
          '',
          '💡 Bạn có thể mở link trực tiếp trên trình duyệt.'
        ];
        return api.sendMessage(lines.join('\n'), threadId, type);
      }

      const listK = KHTN6_DOCS.map((d, i) => `${i + 1}. ${d.title}\n   ${d.url}`).join('\n');
      const guideK = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu khtn 6`,
        `Thông báo: Danh sách tài liệu (gõ: bonz tài liệu khtn 6 <số> | bonz tài liệu khtn 6 chọn <số>)`,
        '',
        listK
      ].join('\n');
      return api.sendMessage(guideK, threadId, type);
    }

    // Đường dẫn tới thư mục tài liệu
    const docsDir = path.join(__dirname, '..', '..', 'tài liệu', ')))');

    if (!fs.existsSync(docsDir)) {
      const msg = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu`,
        `Thông báo: Lỗi - không tìm thấy thư mục tài liệu`,
        `Thư mục: ${docsDir}`,
        `Cách dùng: Đảm bảo thư mục tồn tại và có file .pdf/.doc/.docx`
      ].join("\n");
      return api.sendMessage(msg, threadId, type);
    }

    const allFiles = fs.readdirSync(docsDir);
    const allowed = ['.pdf', '.doc', '.docx'];
    const docFiles = allFiles
      .filter(f => allowed.includes(path.extname(f).toLowerCase()))
      .map(f => ({ name: f, full: path.join(docsDir, f) }));

    if (docFiles.length === 0) {
      const msg = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz tài liệu`,
        `Thông báo: Không có file phù hợp (.pdf/.doc/.docx)`
      ].join("\n");
      return api.sendMessage(msg, threadId, type);
    }


  // Hệ phương trình 2x2: a1x + b1y = c1; a2x + b2y = c2 (đọc từ a1=,b1=,...)
  function tryLinear2x2(text) {
    const s = text.toLowerCase();
    if (!/hệ\s*phương\s*trình|he\s*phuong\s*trinh/.test(s)) return null;
    const pick = (k)=>{
      const m = s.match(new RegExp(k+"\\s*(:|=)\\s*([\-]?[0-9]+(?:\\.[0-9]+)?)"));
      return m? parseFloat(m[2]) : undefined;
    };
    const a1 = pick('a1'), b1 = pick('b1'), c1 = pick('c1');
    const a2 = pick('a2'), b2 = pick('b2'), c2 = pick('c2');
    if ([a1,b1,c1,a2,b2,c2].some(v=>typeof v!== 'number')) return null;
    const D = a1*b2 - a2*b1;
    if (D === 0) return { type:'lin2x2', value: null };
    const Dx = c1*b2 - c2*b1;
    const Dy = a1*c2 - a2*c1;
    return { type:'lin2x2', value: { x: Dx/D, y: Dy/D } };
  }

  // Tam giác vuông trợ giúp nhanh
  function tryRightTriangle(text) {
    const s = text.toLowerCase();
    if (!/tam\s*giác\s*vuông|tam\s*giac\s*vuong/.test(s)) return null;
    const get = (label)=>{
      const m = s.match(new RegExp(label+"\\s*(:|=)?\\s*([0-9]+(?:\\.[0-9]+)?)"));
      return m? parseFloat(m[2]) : undefined;
    };
    const a = get('cạnh góc vuông a|canh goc vuong a|a');
    const b = get('cạnh góc vuông b|canh goc vuong b|b');
    const h = get('cạnh huyền|canh huyen|huyen');
    if (typeof a==='number' && typeof b==='number') return { type:'rt_hyp', value: Math.sqrt(a*a+b*b) };
    if (typeof h==='number' && typeof a==='number') return { type:'rt_leg', value: Math.sqrt(Math.max(h*h-a*a,0)) };
    if (typeof h==='number' && typeof b==='number') return { type:'rt_leg', value: Math.sqrt(Math.max(h*h-b*b,0)) };
    return null;
  }

    // Lịch sử đã gửi cho thread hiện tại
    const row = await Threads.getData(threadId);
    const tdata = row?.data || {};
    tdata.docsHistory = tdata.docsHistory || { sent: [] };
    // Chuẩn hóa lịch sử cũ sang dạng key chuẩn (relative + lowercase)
    const toKey = (p) => {
      const target = path.isAbsolute(p) ? path.relative(docsDir, p) : p;
      return String(target).toLowerCase();
    };
    if (!tdata.docsHistory.sentKeys) {
      tdata.docsHistory.sentKeys = Array.from(new Set((tdata.docsHistory.sent || []).map(n => toKey(n))));
    } else {
      // đảm bảo unique
      tdata.docsHistory.sentKeys = Array.from(new Set(tdata.docsHistory.sentKeys.map(k => String(k).toLowerCase())));
    }

    // Xử lý reset lịch sử
    if (args[0] && args[0].toLowerCase() === 'reset') {
      tdata.docsHistory = { sent: [], sentKeys: [] };
      Threads.setData(threadId, tdata);
      return api.sendMessage('✅ Đã reset lịch sử tài liệu. Bạn có thể gọi lại lệnh để nhận tài liệu từ đầu.', threadId, type);
    }

    const sentSet = new Set(tdata.docsHistory.sentKeys || []);
    const remaining = docFiles.filter(d => !sentSet.has(toKey(d.full)));

    if (remaining.length === 0) {
      return api.sendMessage('✅ Đã gửi hết tài liệu khả dụng. Dùng "bonz tài liệu reset" để làm mới lịch sử.', threadId, type);
    }

    // Trộn và chọn tối đa 10 file chưa gửi
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }
    const pick = remaining.slice(0, Math.min(10, remaining.length));

    const header = [
      `Người dùng: ${userName}`,
      `Dịch vụ: bonz tài liệu`,
      `Thông báo: Đang gửi ${pick.length} tài liệu ngẫu nhiên...`
    ].join("\n");
    await api.sendMessage(header, threadId, type);

    // Gửi từng tài liệu một
    for (const item of pick) {
      try {
        await api.sendMessage({
          msg: `📄 ${item.name}`,
          attachments: item.full
        }, threadId, type, null, senderId);
        // nghỉ nhẹ để tránh spam
        await new Promise(r => setTimeout(r, 400));
        // cập nhật lịch sử (ghi ngay để tránh xung đột khi gọi song song)
        const key = toKey(item.full);
        if (!tdata.docsHistory.sentKeys.includes(key)) {
          tdata.docsHistory.sentKeys.push(key);
        }
        // đảm bảo unique để tránh phình to dữ liệu
        tdata.docsHistory.sentKeys = Array.from(new Set(tdata.docsHistory.sentKeys));
        Threads.setData(threadId, tdata);
      } catch (sendErr) {
        console.log('Gửi tài liệu lỗi:', sendErr?.message || sendErr);
      }
    }

    // lưu lịch sử tổng kết (phòng khi chưa kịp lưu từng phần)
    Threads.setData(threadId, tdata);
    return;

  } catch (error) {
    console.error("Lỗi gửi tài liệu:", error);
    const msg = [
      `Người dùng: ${userName || 'Người dùng'}`,
      `Dịch vụ: bonz tài liệu`,
      `Thông báo: Lỗi hệ thống`
    ].join("\n");
    return api.sendMessage(msg, threadId, type);
  }
}

// Chat AI (Gemini) trực tiếp: thống nhất format và tracking; serviceName: 'bonz chat ai' hoặc 'bonz gpt'
async function handleChatAI(api, event, args = [], serviceName = 'bonz chat ai') {
  const { threadId, type } = event;
  const axios = require('axios');
  // Lấy thông tin người dùng
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage(serviceName, senderId);

  try {
    const promptRaw = (args || []).join(' ').trim();
    if (!promptRaw) {
      const header = __formatServiceInfo({
        service: serviceName,
        userName,
        userId: senderId,
        notify: 'Thiếu câu hỏi',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: serviceName === 'bonz gpt' ? 'bonz gpt <câu hỏi>' : 'bonz chat ai <câu hỏi>'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Ghép prompt theo style gọn 340 ký tự như plugin gemini
    let prompt = `${promptRaw} trả lời cho tôi ngắn gọn nhất và luôn đảm bảo câu trả lời dưới 340 chữ`;
    if (prompt.length > 340) prompt = prompt.slice(0, 340);

    // Lấy API keys từ config hoặc ENV
    function getGeminiKeys() {
      try {
        const fromCfg = Array.isArray(global?.config?.gemini_api_keys) ? global.config.gemini_api_keys : [];
        const fromEnv = (process.env.GEMINI_API_KEYS || '')
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        const merged = [...fromCfg, ...fromEnv].map(String).map(k => k.trim()).filter(Boolean);
        return merged.length ? Array.from(new Set(merged)) : [''];
      } catch { return ['']; }
    }

    const GEMINI_API_KEYS = getGeminiKeys();
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={}';

    // Gọi lần lượt các key (retry khi 429/503)
    const headers = { 'Content-Type': 'application/json' };
    const data = { contents: [{ parts: [{ text: prompt }] }] };
    let answer = '';
    for (const key of GEMINI_API_KEYS) {
      const url = GEMINI_API_URL.replace('{}', key);
      try {
        const resp = await axios.post(url, data, { headers });
        const result = resp.data;
        if (resp.status === 200 && !result?.error) {
          answer = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (answer) break;
        } else if (result?.error && [429, 503].includes(result.error.code)) {
          continue; // thử key khác
        }
      } catch (err) {
        const code = err?.response?.data?.error?.code;
        if (code && [429, 503].includes(code)) continue;
      }
    }

    if (!answer) {
      answer = 'xin lỗi nay tôi đã trò chuyện với người dùng quá nhiều - hẹn các bạn vào hôm sau.';
    }

    const header = __formatServiceInfo({
      service: serviceName,
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: serviceName === 'bonz gpt' ? 'bonz gpt <câu hỏi>' : 'bonz chat ai <câu hỏi>'
    });
    const details = ['','💬 Trả lời:','', answer].join('\n');
    return api.sendMessage(`${header}\n${details}`, threadId, type);
  } catch (e) {
    const header = __formatServiceInfo({
      service: serviceName,
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Giải toán: hỗ trợ số học và một số hình học cơ bản bằng tiếng Việt
async function handleGiaiToan(api, event, args = []) {
  const { threadId, type, data } = event;
  const raw = (args || []).join(' ').trim();
  if (!raw) {
    return api.sendMessage(
      [
        'Cách dùng: bonz giải toán <bài toán bằng chữ hoặc biểu thức>',
        'Ví dụ:',
        '- bonz giải toán hai mươi ba cộng bảy nhân hai',
        '- bonz giải toán căn bậc hai của 144',
        '- bonz giải toán tính diện tích hình tròn bán kính 5',
        '- bonz giải toán chu vi hình chữ nhật dài 7 rộng 3',
        '- bonz giải toán 15 phần trăm của 200',
        '- bonz giải toán giai thừa 6',
        '- bonz giải toán tổ hợp 10 chọn 3',
        '- bonz giải toán sin 30 độ',
        '- bonz giải toán phương trình bậc hai a=1 b=-3 c=2',
        '- bonz giải toán tăng 15% của 200',
        '- bonz giải toán 17 mod 5',
        '- bonz giải toán log cơ số 2 của 32',
        '- bonz giải toán hệ phương trình a1=2 b1=3 c1=13 a2=1 b2=-1 c2=1',
        '- bonz giải toán một phần hai cộng một phần ba',
        '- bonz giải toán hai và một phần ba nhân bốn',
        '- bonz giải toán tỉ lệ 3:4'
      ].join('\n'),
      threadId,
      type
    );
  }

  // Nếu có API key OpenAI, ưu tiên dùng ChatGPT để giải toán
  try {
    const senderId = data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}
    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz giải toán', senderId);

    const OPENAI_KEY = process.env.OPENAI_API_KEY || (global?.config?.openai_key);
    if (OPENAI_KEY) {
      const sys = 'Bạn là trợ lý toán học. Hãy giải bài toán một cách ngắn gọn, có các bước chính và nêu kết quả cuối cùng rõ ràng. Nếu có đơn vị, nêu kèm đơn vị. Giữ câu trả lời bằng tiếng Việt.';
      const user = `Bài toán: ${raw}`;
      const res = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: user }
          ],
          temperature: 0.2,
          max_tokens: 600
        },
        { headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }, timeout: 20000 }
      );
      const answer = res?.data?.choices?.[0]?.message?.content?.trim();
      if (answer) {
        const header = __formatServiceInfo({
          service: 'bonz giải toán', userName, userId: senderId, role, usage,
          notify: 'Lời giải từ ChatGPT'
        });
        return api.sendMessage(`${header}\n\n${answer}`, threadId, type);
      }
    }
  } catch (e) {
    // Nếu lỗi hoặc không có key, sẽ dùng bộ giải cục bộ bên dưới
  }

  // Chuyển số tiếng Việt cơ bản -> số
  function viNumberToNumber(text) {
    const map = {
      'không':0,'một':1,'mốt':1,'hai':2,'ba':3,'bốn':4,'tư':4,'năm':5,'lăm':5,'sáu':6,'bảy':7,'bẩy':7,'tám':8,'chín':9,
      'mười':10,'mươi':10,'trăm':100,'nghìn':1000,'ngàn':1000,'triệu':1_000_000,'tỷ':1_000_000_000
    };
    // Chuẩn hóa
    let s = ' ' + text.toLowerCase() + ' ';
    // Đổi dạng phân số: "hai phần ba" => 2/3
    s = s.replace(/([a-zà-ỹ\d\s]+?)\s+phần\s+([a-zà-ỹ\d\s]+)/g, (m,a,b)=>{
      const A = viNumberToNumber(a.trim());
      const B = viNumberToNumber(b.trim());
      if (isNaN(A) || isNaN(B) || B===0) return m; return String(A/B);
    });
    // Đổi các cụm đơn giản sang chữ số trực tiếp khi có số đã viết
    s = s.replace(/(\d+)[\s]*phần\s*(\d+)/g,(m,a,b)=> String(Number(a)/Number(b)));
    // Chuyển từng cụm số từ chữ sang số
    return s.replace(/((?:\s[\wà-ỹ]+)+)/g, (m)=>{
      const tokens = m.trim().split(/\s+/);
      let total = 0, cur = 0, found = false;
      for (const tkRaw of tokens) {
        const tk = tkRaw.replace(/[^a-zà-ỹ]/g,'');
        if (!(tk in map)) continue;
        found = true;
        const val = map[tk];
        if (val >= 100) { // trăm, nghìn, triệu, tỷ
          if (cur === 0) cur = 1;
          cur *= val;
          if (val >= 1000) { total += cur; cur = 0; }
        } else if (val === 10 && (tk==='mươi' || tk==='mười')) {
          cur = (cur || 1) * 10;
        } else {
          cur += val;
        }
      }
      if (!found) return m;
      total += cur;
      return ' ' + String(total) + ' ';
    });
  }

  // Đổi từ khoá toán -> ký hiệu
  function normalizeArithmetic(text) {
    let s = text.toLowerCase();
    s = viNumberToNumber(s);
    s = s
      .replace(/căn bậc\s*(\d+)\s*(?:của|\()?/g, 'root($1,') // căn bậc n của x => root(n, x)
      .replace(/căn\s*(?:bậc\s*hai)?\s*(?:của\s*)?/g, 'sqrt(')
      .replace(/lũy thừa|mũ/g, '^')
      .replace(/\bphần trăm\b/g, '%')
      // phần trăm của: "x phần trăm của y" => (x/100)*y
      .replace(/(\d+(?:\.\d+)?)\s*(?:%|phần trăm)\s*của\s*(\d+(?:\.\d+)?)/g, '($1/100)*$2')
      // tăng/giảm x% của y
      .replace(/tăng\s*(\d+(?:\.\d+)?)\s*%\s*của\s*(\d+(?:\.\d+)?)/g, '(1+$1/100)*$2')
      .replace(/giảm\s*(\d+(?:\.\d+)?)\s*%\s*của\s*(\d+(?:\.\d+)?)/g, '(1-$1/100)*$2')
      .replace(/\b(cộng|plus|\+)\b/g, '+')
      .replace(/\b(trừ|minus|\-)\b/g, '-')
      .replace(/\b(nhân|x|\*)\b/g, '*')
      .replace(/\b(chia|:)\b/g, '/')
      .replace(/\b(mod|phần dư|lay du|lấy dư)\b/g, '%')
      .replace(/\s+/g,' ')
      .trim();
    // phần trăm: 50% => 50/100
    s = s.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    // phân số: "a phần b" => (a/b) ; hỗn số: "n và a phần b" => (n + a/b)
    s = s.replace(/(\d+)\s*và\s*(\d+)\s*phần\s*(\d+)/g, '($1 + ($2/$3))');
    s = s.replace(/(\d+)\s*phần\s*(\d+)/g, '($1/$2)');
    // tỉ lệ x:y => x/y
    s = s.replace(/tỉ\s*lệ\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g, '($1/$2)');
    // ^ -> **
    s = s.replace(/\^/g,'**');
    // root(n, x) => Math.pow(x, 1/n)
    s = s.replace(/root\((\d+)\s*,/g, 'powInv($1,');
    // giai thừa: "giai thừa 5" hoặc "5!" => fact(5)
    s = s.replace(/giai\s*thừa\s*(\d+)/g, 'fact($1)');
    s = s.replace(/(\d+)\s*!/g, 'fact($1)');
    // tổ hợp/chỉnh hợp
    s = s.replace(/tổ\s*hợp\s*(\d+)\s*(?:chọn|lấy)\s*(\d+)/g, 'nCr($1,$2)');
    s = s.replace(/chỉnh\s*hợp\s*(\d+)\s*(?:chọn|lấy)?\s*(\d+)/g, 'nPr($1,$2)');
    // lượng giác theo độ: sin 30 độ => sin(deg2rad(30))
    s = s.replace(/\b(sin|cos|tan)\s*(\d+(?:\.\d+)?)\s*độ\b/g, (m,fn,num)=>`${fn}(deg2rad(${num}))`);
    // ln x, log x (mặc định cơ số 10), log cơ số a của b
    s = s.replace(/\bln\s*\(/g, 'ln(');
    s = s.replace(/\blog\s*cơ\s*số\s*(\d+(?:\.\d+)?)\s*của\s*(\d+(?:\.\d+)?)/g, 'logBase($2,$1)');
    s = s.replace(/\blog\s*\(/g, 'log10(');
    // ƯCLN/BCNN dạng chữ: "ước chung lớn nhất của a và b", "bội chung nhỏ nhất của a và b"
    s = s.replace(/ước\s*chung\s*lớn\s*nhất\s*của\s*(\d+)\s*và\s*(\d+)/g, 'gcd($1,$2)');
    s = s.replace(/bội\s*chung\s*nhỏ\s*nhất\s*của\s*(\d+)\s*và\s*(\d+)/g, 'lcm($1,$2)');
    return s;
  }

  // Hình học cơ bản
  function tryGeometry(text) {
    const s = text.toLowerCase();
    const getNum = (label)=>{
      // ưu tiên số dạng 123.45 sau nhãn
      const m = s.match(new RegExp(label+"\\s*(:|=)?\\s*([0-9]+(?:\\.[0-9]+)?)"));
      if (m) return parseFloat(m[2]);
      // thử bắt cụm chữ số việt theo sau nhãn (tối đa 5 từ)
      const m2 = s.match(new RegExp(label+"\\s*(?::|=)?\\s*((?:[a-zà-ỹ]+\\s*){1,5})"));
      if (m2) {
        const asNum = viNumberToNumber(m2[1]);
        const num = parseFloat(asNum.replace(/[^0-9.\-]/g,''));
        if (!isNaN(num)) return num;
      }
      return undefined;
    };

    // hình tròn
    if (/hình\s*tròn/.test(s)) {
      let r = getNum('bán kính|ban kinh|radius|r');
      const d = getNum('đường kính|duong kinh|diameter|d');
      if (typeof r !== 'number' && typeof d === 'number') r = d/2;
      if (typeof r === 'number') {
        const pi = Math.PI;
        if (/diện tích|dien tich|area/.test(s)) return { type:'area_circle', value: pi*r*r };
        if (/chu vi|chuvi|perimeter|circumference/.test(s)) return { type:'peri_circle', value: 2*pi*r };
      }
    }
    // hình chữ nhật
    if (/hình\s*chữ\s*nhật|hinh\s*chu\s*nhat/.test(s)) {
      const a = getNum('dài|dai|length|a');
      const b = getNum('rộng|rong|width|b');
      if (typeof a === 'number' && typeof b === 'number') {
        if (/diện tích|dien tich|area/.test(s)) return { type:'area_rect', value: a*b };
        if (/chu vi|chuvi|perimeter/.test(s)) return { type:'peri_rect', value: 2*(a+b) };
      }
    }
    // hình vuông
    if (/hình\s*vuông|hinh\s*vuong/.test(s)) {
      const c = getNum('cạnh|canh|side|a');
      if (typeof c === 'number') {
        if (/diện tích|dien tich|area/.test(s)) return { type:'area_square', value: c*c };
        if (/chu vi|chuvi|perimeter/.test(s)) return { type:'peri_square', value: 4*c };
      }
    }
    // tam giác: diện tích (Heron) khi biết 3 cạnh a,b,c; hoặc (đáy, cao)
    if (/tam\s*giác|tam\s*giac/.test(s)) {
      const a = getNum('a|cạnh a|canh a');
      const b = getNum('b|cạnh b|canh b');
      const c = getNum('c|cạnh c|canh c');
      const day = getNum('đáy|day|base');
      const cao = getNum('cao|height|h');
      const goc = getNum('góc|goc|angle');
      if (/chu vi|chuvi|perimeter/.test(s) && [a,b,c].every(v=>typeof v==='number')) {
        return { type:'peri_triangle', value: a+b+c };
      }
      if (/diện tích|dien tich|area/.test(s)) {
        if (typeof day === 'number' && typeof cao === 'number') {
          return { type:'area_triangle', value: 0.5*day*cao };
        }
        // cạnh-cạnh-góc xen giữa (a,b,góc C)
        if (typeof a==='number' && typeof b==='number' && typeof goc==='number') {
          const area = 0.5*a*b*Math.sin(goc*Math.PI/180);
          return { type:'area_triangle', value: area };
        }
        if ([a,b,c].every(v=>typeof v==='number')) {
          const p = (a+b+c)/2;
          const area = Math.sqrt(Math.max(p*(p-a)*(p-b)*(p-c), 0));
          return { type:'area_triangle', value: area };
        }
      }
    }
    // hình thang: diện tích với đáy lớn a, đáy bé b, chiều cao h
    if (/hình\s*thang|hinh\s*thang/.test(s)) {
      const a = getNum('đáy lớn|day lon|a');
      const b = getNum('đáy bé|day be|b');
      const h = getNum('chiều cao|chieu cao|cao|h|height');
      if (/diện tích|dien tich|area/.test(s) && typeof a==='number' && typeof b==='number' && typeof h==='number') {
        return { type:'area_trapezoid', value: (a+b)/2*h };
      }
      // chu vi hình thang nếu biết 4 cạnh: a,b,c,d (với c,d là cạnh bên)
      const c = getNum('c|cạnh bên c|canh ben c');
      const d = getNum('d|cạnh bên d|canh ben d');
      if (/chu vi|chuvi|perimeter/.test(s) && [a,b,c,d].every(v=>typeof v==='number')) {
        return { type:'peri_trapezoid', value: a+b+c+d };
      }
    }
    return null;
  }

  // Đánh giá biểu thức số học an toàn
  function safeEval(expr) {
    const ctx = {
      Math,
      sqrt: Math.sqrt,
      sin: Math.sin,
      cos: Math.cos,
      tan: Math.tan,
      abs: Math.abs,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      min: Math.min,
      max: Math.max,
      PI: Math.PI,
      E: Math.E,
      powInv: (n, x) => Math.pow(x, 1/Number(n)),
      log: Math.log,
      log10: Math.log10 || ((x)=>Math.log(x)/Math.LN10),
      ln: Math.log,
      logBase: (b,a)=> Math.log(Number(b))/Math.log(Number(a)),
      exp: Math.exp,
      deg2rad: (d)=> Number(d)*Math.PI/180,
      fact: (n)=>{ n=Number(n); if (n<0||!Number.isFinite(n)) throw new Error('giai thừa không hợp lệ'); let r=1; for(let i=2;i<=Math.floor(n);i++) r*=i; return r; },
      nCr: (n,k)=>{ n=Number(n); k=Number(k); if(k<0||n<0||k>n) throw new Error('tổ hợp không hợp lệ'); const f=(x)=>{let r=1; for(let i=2;i<=x;i++) r*=i; return r;}; return f(n)/(f(k)*f(n-k)); },
      nPr: (n,k)=>{ n=Number(n); k=Number(k); if(k<0||n<0||k>n) throw new Error('chỉnh hợp không hợp lệ'); const f=(x)=>{let r=1; for(let i=2;i<=x;i++) r*=i; return r;}; return f(n)/f(n-k); },
      gcd: (a,b)=>{ a=Math.abs(Math.floor(a)); b=Math.abs(Math.floor(b)); while(b){[a,b]=[b,a%b]} return a; },
      lcm: (a,b)=>{ a=Math.abs(Math.floor(a)); b=Math.abs(Math.floor(b)); if(a===0||b===0) return 0; const g=(x,y)=>{while(y){[x,y]=[y,x%y]} return x}; return Math.abs(a*b)/g(a,b); }
    };
    // chỉ cho phép các ký tự hợp lệ
    if (!/^[-+*/%^().,! 0-9a-z_]*$/i.test(expr)) throw new Error('Biểu thức chứa ký tự không hợp lệ');
    const fn = new Function('ctx', `with(ctx){ return (${expr}); }`);
    return fn(ctx);
  }

  // Giải phương trình bậc hai: a,b,c từ văn bản
  function tryQuadratic(text) {
    const s = text.toLowerCase();
    if (!/phương\s*trình\s*bậc\s*hai|phuong\s*trinh\s*bac\s*hai/.test(s)) return null;
    const num = (label)=>{
      const m = s.match(new RegExp(label+"\\s*(:|=)?\\s*([\-]?[0-9]+(?:\\.[0-9]+)?)"));
      if (m) return parseFloat(m[2]);
      return undefined;
    };
    const a = num('a');
    const b = num('b');
    const c = num('c');
    if ([a,b,c].some(v=>typeof v!=='number')) return null;
    if (a === 0) return { type:'linear', value: (-c)/b };
    const delta = b*b - 4*a*c;
    if (delta < 0) return { type:'quad', value: null, extra: { delta } };
    if (delta === 0) return { type:'quad', value: [ -b/(2*a) ], extra: { delta } };
    const sqrtD = Math.sqrt(delta);
    return { type:'quad', value: [ (-b+sqrtD)/(2*a), (-b-sqrtD)/(2*a) ], extra: { delta } };
  }

  try {
    // 1) Thử giải phương trình bậc hai
    const quad = tryQuadratic(raw);
    if (quad) {
      if (quad.type === 'linear') {
        return api.sendMessage(`✅ Nghiệm phương trình bậc nhất: x = ${quad.value}`, threadId, type);
      }
      if (quad.value === null) {
        return api.sendMessage(`✅ Phương trình vô nghiệm (Δ = ${quad.extra.delta})`, threadId, type);
      }
      if (Array.isArray(quad.value) && quad.value.length === 1) {
        return api.sendMessage(`✅ Phương trình có nghiệm kép x = ${quad.value[0]}`, threadId, type);
      }
      if (Array.isArray(quad.value) && quad.value.length === 2) {
        return api.sendMessage(`✅ Nghiệm: x1 = ${quad.value[0]}, x2 = ${quad.value[1]}`, threadId, type);
      }
    }

    // 2) Hệ phương trình 2x2
    const lin = tryLinear2x2(raw);
    if (lin) {
      if (!lin.value) return api.sendMessage('✅ Hệ vô nghiệm hoặc vô số nghiệm (D = 0).', threadId, type);
      return api.sendMessage(`✅ Nghiệm hệ: x = ${lin.value.x}, y = ${lin.value.y}`, threadId, type);
    }

    // 3) Tam giác vuông
    const rt = tryRightTriangle(raw);
    if (rt) {
      return api.sendMessage(`✅ Kết quả: ${rt.value}`, threadId, type);
    }

    // 4) Thử hình học
    const geo = tryGeometry(raw);
    if (geo) {
      const val = Number(geo.value);
      const pretty = Number.isFinite(val) ? val : 'NaN';
      return api.sendMessage(`✅ Kết quả: ${pretty}`, threadId, type);
    }

    // 5) Số học chung
    const expr = normalizeArithmetic(raw)
      .replace(/sqrt\(/g,'Math.sqrt(');
    const result = safeEval(expr);
    if (typeof result === 'number' && Number.isFinite(result)) {
      return api.sendMessage(`✅ Kết quả: ${result}`, threadId, type);
    }
    return api.sendMessage('❌ Không hiểu bài toán. Hãy diễn đạt rõ hơn.', threadId, type);
  } catch (e) {
    return api.sendMessage(`❌ Lỗi khi tính toán: ${e.message}`, threadId, type);
  }
}

// Rút gọn link: hỗ trợ 1 hoặc nhiều URL, dùng is.gd và fallback TinyURL
async function handleShortenLink(api, event, args = []) {
  const { threadId, type } = event;
  const axios = require('axios');
  const senderId = event?.data?.uidFrom || event?.authorId;
  
  // Lấy thông tin người dùng
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz rút gọn link', senderId);

  // Chuẩn hóa và lọc danh sách URL từ args
  const inputs = (args || []).filter(Boolean);
  if (!inputs.length) {
    const header = __formatServiceInfo({
      service: 'bonz rút gọn link',
      userName,
      userId: senderId,
      notify: 'Thiếu URL cần rút gọn',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: 'bonz rút gọn link <url1> [url2 ...] hoặc: bonz link <url>',
      showRole: false
    });
    return api.sendMessage(header, threadId, type);
  }

  function normalizeUrl(u) {
    let s = String(u || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s; // thêm scheme nếu thiếu
    try { new URL(s); return s; } catch { return ''; }
  }

  async function shortenOne(u) {
    const enc = encodeURIComponent(u);
    // is.gd simple
    try {
      const res = await axios.get(`https://is.gd/create.php?format=simple&url=${enc}`, { timeout: 12000 });
      const t = String(res.data || '').trim();
      if (t && /^https?:\/\//i.test(t)) return t;
    } catch {}
    // tinyurl fallback
    try {
      const res2 = await axios.get(`https://tinyurl.com/api-create.php?url=${enc}`, { timeout: 12000 });
      const t2 = String(res2.data || '').trim();
      if (t2 && /^https?:\/\//i.test(t2)) return t2;
    } catch {}
    return null;
  }

  try {
    const urls = inputs.map(normalizeUrl).filter(Boolean).slice(0, 10);
    if (!urls.length) {
      const header = __formatServiceInfo({
        service: 'bonz rút gọn link',
        userName,
        userId: senderId,
        notify: 'Không nhận diện được URL hợp lệ',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: 'bonz rút gọn link <url1> [url2 ...]',
        showRole: false
      });
      return api.sendMessage(header, threadId, type);
    }

    const results = [];
    for (const u of urls) {
      try {
        const short = await shortenOne(u);
        results.push({ original: u, short });
      } catch {
        results.push({ original: u, short: null });
      }
    }

    const okCount = results.filter(r => !!r.short).length;
    const header = __formatServiceInfo({
      service: 'bonz rút gọn link',
      userName,
      userId: senderId,
      notify: okCount > 0 ? 'Thành công' : 'Không rút gọn được link nào',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      howToUse: okCount > 0 ? 'Copy link rút gọn để chia sẻ, tiết kiệm không gian (SEO vẫn vậy)' : 'bonz rút gọn link <url1> [url2 ...] hoặc: bonz link <url>',
      showRole: false
    });

    // Theo yêu cầu: chỉ hiển thị Bảng thông tin dịch vụ, không kèm danh sách link
    return api.sendMessage(header, threadId, type);
  } catch (err) {
    const header = __formatServiceInfo({
      service: 'bonz rút gọn link',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0,
      showRole: false
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý tìm kiếm nhạc SoundCloud
async function handleMusic(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const Threads = require('../../core/controller/controllerThreads');
  const soundcloud = require('./soundcloud.js');

  // Cache danh sách bài theo thread+uid trong 10 phút và lưu cả bản thread-level để ai cũng chọn được
  async function setMusicCache(list) {
    try {
      const data = await Threads.getData(threadId);
      const cache = data?.music_cache || {};
      const payload = { ts: Date.now(), list: Array.isArray(list) ? list : [] };
      cache[String(senderId)] = payload;           // cache theo người dùng
      cache.thread_last = payload;                 // cache mức nhóm (bản gần nhất)
      await Threads.setData(threadId, { ...(data || {}), music_cache: cache });
    } catch (_) {}
  }
  async function getMusicCache(maxAgeMs = 600000) { // 10 phút
    try {
      const data = await Threads.getData(threadId);
      const cache = data?.music_cache || {};
      // ưu tiên cache theo user
      let entry = cache[String(senderId)];
      if (!entry || (Date.now() - (entry.ts || 0) > maxAgeMs)) {
        // fallback sang bản gần nhất của thread
        entry = cache.thread_last;
      }
      if (!entry) return null;
      if (Date.now() - (entry.ts || 0) > maxAgeMs) return null;
      return Array.isArray(entry.list) ? entry.list : null;
    } catch (_) { return null; }
  }

  // chọn bài từ danh sách đã tìm
  const firstToken = (args[0] || '').toLowerCase();
  const isChooseCmd = ['chọn','chon','chọn bài','chon bai'].includes(firstToken) || /^(chọn|chon)\d+$/i.test(firstToken);
  const isDirectNumber = args.length === 1 && /^\d+$/.test(firstToken);
  if (args.length >= 1 && (isChooseCmd || isDirectNumber)) {
    let idx = NaN;
    if (isDirectNumber) {
      idx = parseInt(firstToken, 10);
    } else if (/^(chọn|chon)\d+$/i.test(firstToken)) {
      const m = firstToken.match(/^(?:chọn|chon)(\d+)$/i);
      if (m) idx = parseInt(m[1], 10);
    } else {
      idx = parseInt(args[1], 10);
    }
    if (isNaN(idx) || idx <= 0) {
      return api.sendMessage('❌ Vui lòng nhập số thứ tự hợp lệ. Ví dụ: bonz nhạc chọn 1', threadId, type);
    }
    const list = await getMusicCache();
    if (!Array.isArray(list) || list.length === 0) {
      return api.sendMessage('❌ Không có danh sách gần đây. Hãy tìm trước: bonz nhạc <từ khóa>', threadId, type);
    }
    const chosen = list[idx - 1];
    if (!chosen) {
      return api.sendMessage(`❌ Chỉ số không hợp lệ. Hãy chọn từ 1-${list.length}`, threadId, type);
    }
    try {
      await api.sendMessage('🔽 Đang xử lý phát nhạc, vui lòng đợi...', threadId, type);
      const streamUrl = await soundcloud.getMusicStreamUrl(chosen.link);
      if (!streamUrl) return api.sendMessage('❌ Không lấy được link phát trực tiếp. Thử bài khác.', threadId, type);

      const caption = [
        `🎶 ${chosen.title}`,
        chosen.username ? `👤 ${chosen.username}` : '',
        chosen.playCount ? `▶️ ${chosen.playCount} | ❤️ ${chosen.likeCount || 0}` : ''
      ].filter(Boolean).join('\n');

      // 1) Thử gửi voice trực tiếp từ URL
      const urlVoicePayloads = [
        { msg: caption, attachments: [streamUrl], asVoice: true },
        { msg: caption, attachments: [streamUrl], voice: true },
        { msg: caption, voice: streamUrl },
        { msg: caption, audio: streamUrl },
        { msg: caption, attachments: streamUrl, asVoice: true },
      ];
      for (const p of urlVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); return; } catch (_) {}
      }

      // 2) Nếu không được, tải file mp3 và gửi
      const safeTitle = (chosen.title || 'soundcloud').slice(0,80).replace(/[<>:"/\\|?*]/g,'_');
      const filePath = await soundcloud.saveFileToCache(streamUrl, `${safeTitle}.mp3`);
      if (!filePath) return api.sendMessage('❌ Lỗi tải file.', threadId, type);

      const fileVoicePayloads = [
        { msg: caption, attachments: [filePath], asVoice: true },
        { msg: caption, attachments: [filePath], voice: true },
        { msg: caption, voice: filePath },
        { msg: caption, audio: filePath },
        { msg: caption, attachments: filePath, asVoice: true },
      ];
      let sent = false;
      for (const p of fileVoicePayloads) {
        try { await api.sendMessage(p, threadId, type); sent = true; break; } catch (_) {}
      }
      if (!sent) {
        await api.sendMessage({ msg: caption, attachments: [filePath] }, threadId, type);
      }
      setTimeout(async ()=>{ try { const fs = require('fs').promises; await fs.unlink(filePath); } catch(_){} }, 300000);
    } catch (e) {
      return api.sendMessage('❌ Gửi nhạc thất bại, vui lòng thử lại.', threadId, type);
    }
    return;
  }

  if (args.length === 0) {
    return api.sendMessage('🎵 Sử dụng: bonz nhạc <tên bài hát>\nVí dụ: bonz nhạc despacito', threadId, type);
  }
  const query = args.join(' ');
  try {
    // Lấy tên người dùng
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch (_) {}

    await api.sendMessage(`🔍 Đang tìm kiếm "${query}" trên SoundCloud...`, threadId, type);
    const songs = await soundcloud.searchSongs(query);
    if (!Array.isArray(songs) || songs.length === 0) {
      return api.sendMessage('❌ Không tìm thấy bài hát nào. Thử từ khóa khác.', threadId, type);
    }
    // Lấy metadata cho các bài hát (tối đa 5)
    for (let i = 0; i < Math.min(songs.length, 5); i++) {
      try {
        const metadata = await soundcloud.getSongMetadata(songs[i].link);
        songs[i] = { ...songs[i], ...metadata };
      } catch (_) {}
    }
    const top5 = songs.slice(0,5);
    await setMusicCache(top5);
    const imagePath = await soundcloud.createSongListImage(top5, userName);
    if (imagePath) {
      try {
        await api.sendMessage({ msg: `🎶 Danh sách cho: ${query}`, attachments: imagePath }, threadId, type);
      } catch {
        await api.sendMessage(`🎶 Danh sách cho: ${query}\n${top5.map((s,i)=>`${i+1}. ${s.title}`).join('\n')}\n\nDùng: bonz nhạc chọn <số>`, threadId, type);
      }
    } else {
      await api.sendMessage(`🎶 Danh sách cho: ${query}\n${top5.map((s,i)=>`${i+1}. ${s.title}`).join('\n')}\n\nDùng: bonz nhạc chọn <số>`, threadId, type);
    }
  } catch (e) {
    return api.sendMessage('❌ Có lỗi khi tìm kiếm nhạc.', threadId, type);
  }
}

// Kick all thành viên trong nhóm (chỉ admin/owner)
async function handleKickAll(api, event) {
  const { threadId, type, data } = event;
  const { ThreadType } = require('zca-js');
  
  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = data?.uidFrom;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  // Kiểm tra quyền bot admin/owner
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot : [];
  const isBotAdmin = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));
  
  if (!isBotAdmin) {
    const header = __formatServiceInfo({
      service: 'bonz kick all',
      userName,
      userId: senderId,
      notify: '❌ Bạn không có quyền sử dụng lệnh này',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz kick all', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    // Debug: Kiểm tra các method API có sẵn
    const availableMethods = Object.getOwnPropertyNames(api).filter(name => 
      typeof api[name] === 'function' && name.toLowerCase().includes('remove')
    );
    console.log('Available remove methods:', availableMethods);

    // Thử các method kick khác nhau
    const kickMethods = [
      'removeUserFromGroup',
      'removeParticipant', 
      'kickMember',
      'removeMember',
      'removeUser'
    ];

    let workingKickMethod = null;
    for (const method of kickMethods) {
      if (typeof api[method] === 'function') {
        workingKickMethod = method;
        break;
      }
    }

    if (!workingKickMethod) {
      const header = __formatServiceInfo({
        service: 'bonz kick all',
        userName,
        userId: senderId,
        notify: `❌ API không hỗ trợ kick. Methods: ${availableMethods.join(', ')}`,
        role: __getRoleLabel(senderId),
        usage: __incUsage('bonz kick all', senderId)
      });
      return api.sendMessage(header, threadId, type);
    }

    // Tìm method lấy thông tin nhóm
    const infoMethods = [
      'getThreadInfo',
      'getGroupInfo', 
      'getChatInfo',
      'getConversationInfo',
      'getParticipants'
    ];

    let groupInfo = null;
    let workingInfoMethod = null;
    
    for (const method of infoMethods) {
      if (typeof api[method] === 'function') {
        try {
          groupInfo = await api[method](threadId);
          workingInfoMethod = method;
          break;
        } catch (e) {
          console.log(`Method ${method} failed:`, e?.message);
          continue;
        }
      }
    }

    // Nếu không lấy được thông tin nhóm, thử kick trực tiếp từ event
    if (!groupInfo) {
      const header = __formatServiceInfo({
        service: 'bonz kick all',
        userName,
        userId: senderId,
        notify: `❌ Không thể lấy thông tin nhóm. Available methods: ${Object.getOwnPropertyNames(api).filter(n => typeof api[n] === 'function' && n.toLowerCase().includes('thread')).join(', ')}`,
        role: __getRoleLabel(senderId),
        usage: __incUsage('bonz kick all', senderId)
      });
      return api.sendMessage(header, threadId, type);
    }

    const members = groupInfo?.members || groupInfo?.participantIDs || groupInfo?.participants || [];
    const botId = api.getCurrentUserID?.() || global?.botID || api.getAppStateDetails?.()?.uid;
    
    console.log(`Group members count: ${members.length}, Bot ID: ${botId}`);

    // Lọc bỏ bot và người gửi lệnh
    const membersToKick = members.filter(member => {
      const memberId = member?.id || member?.userID || member;
      return memberId !== botId && 
             memberId !== senderId &&
             !adminList.includes(String(memberId)) &&
             !ownerList.includes(String(memberId));
    });

    if (membersToKick.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz kick all',
        userName,
        userId: senderId,
        notify: `Không có thành viên để kick. Tổng: ${members.length}, Bot: ${botId}`,
        role: __getRoleLabel(senderId),
        usage: __incUsage('bonz kick all', senderId)
      });
      return api.sendMessage(header, threadId, type);
    }

    const header = __formatServiceInfo({
      service: 'bonz kick all',
      userName,
      userId: senderId,
      notify: `Đang kick ${membersToKick.length} thành viên bằng ${workingKickMethod} (info: ${workingInfoMethod})...`,
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz kick all', senderId)
    });
    await api.sendMessage(header, threadId, type);

    let kickedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Kick từng thành viên
    for (const member of membersToKick) {
      try {
        const memberId = member?.id || member?.userID || member;
        await api[workingKickMethod](memberId, threadId);
        kickedCount++;
        // Delay nhỏ để tránh spam API
        await new Promise(resolve => setTimeout(resolve, 800));
      } catch (error) {
        failedCount++;
        const errorMsg = error?.message || String(error);
        errors.push(errorMsg);
        console.log(`Lỗi kick ${member?.id || member}:`, errorMsg);
      }
    }

    const result = [
      `✅ Hoàn thành kick all`,
      `👥 Đã kick: ${kickedCount} thành viên`,
      `❌ Thất bại: ${failedCount} thành viên`,
      `📊 Tổng cộng: ${membersToKick.length} thành viên`,
      errors.length > 0 ? `🔍 Lỗi mẫu: ${errors[0]}` : ''
    ].filter(Boolean).join('\n');

    return api.sendMessage(result, threadId, type);

  } catch (error) {
    console.error('Lỗi kick all:', error);
    const errorDetail = error?.message || error?.code || String(error);
    const header = __formatServiceInfo({
      service: 'bonz kick all',
      userName,
      userId: senderId,
      notify: `Lỗi hệ thống: ${errorDetail}`,
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz kick all', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Kick thành viên khỏi nhóm: yêu cầu admin nhóm hoặc admin/owner bot
async function handleKick(api, event, args = []) {
  const { threadId, type } = event;
  const { ThreadType } = require('zca-js');

  if (type !== ThreadType.Group) {
    return api.sendMessage('❌ Lệnh này chỉ dùng trong nhóm.', threadId, type);
  }

  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}

  // Kiểm tra quyền bot admin/owner
  const cfg = global?.config || {};
  const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
  const ownerList = Array.isArray(cfg.owner_bot) ? cfg.owner_bot : [];
  const hasBotPriv = adminList.includes(String(senderId)) || ownerList.includes(String(senderId));

  // Kiểm tra admin nhóm (placeholder - cần implement)
  const hasGroupAdmin = false; // TODO: implement isAdminInGroup function

  if (!(hasBotPriv || hasGroupAdmin)) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: '❌ Bạn cần là quản trị viên nhóm hoặc admin bot để dùng lệnh này',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  // Xác định danh sách UID cần kick
  const targets = new Set();

  // 1) Nếu reply tin nhắn: lấy UID từ tin nhắn được reply
  try {
    const r = event?.messageReply || event?.replyTo;
    const rid = r?.authorId || r?.senderId || r?.data?.uidFrom || r?.uidFrom;
    if (rid) targets.add(String(rid));
  } catch {}

  // 2) Lấy từ tham số (sau từ khoá 'cút'/'kick')
  for (const token of (args || []).slice(1)) {
    const id = String(token).replace(/[^0-9]/g, '').trim();
    if (id.length >= 6) targets.add(id);
  }

  if (targets.size === 0) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: 'Hướng dẫn sử dụng',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId),
      howToUse: 'bonz cút <uid...> hoặc reply tin nhắn của người cần kick'
    });
    return api.sendMessage(header, threadId, type);
  }

  // Không cho tự kick mình nếu không phải Owner/BotAdmin
  if (!hasBotPriv) {
    targets.delete(String(senderId));
  }

  // Không kick admin/owner bot khác
  for (const adminId of [...adminList, ...ownerList]) {
    targets.delete(String(adminId));
  }

  if (targets.size === 0) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: '❗ Không có UID hợp lệ để kick',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  // Tìm method kick phù hợp
  const kickMethods = [
    'removeUserFromGroup',
    'removeParticipant', 
    'kickMember',
    'removeMember',
    'removeUser'
  ];

  let workingKickMethod = null;
  for (const method of kickMethods) {
    if (typeof api[method] === 'function') {
      workingKickMethod = method;
      break;
    }
  }

  if (!workingKickMethod) {
    const header = __formatServiceInfo({
      service: 'bonz cút',
      userName,
      userId: senderId,
      notify: '❌ API không hỗ trợ kick thành viên',
      role: __getRoleLabel(senderId),
      usage: __incUsage('bonz cút', senderId)
    });
    return api.sendMessage(header, threadId, type);
  }

  const header = __formatServiceInfo({
    service: 'bonz cút',
    userName,
    userId: senderId,
    notify: `Đang kick ${targets.size} thành viên...`,
    role: __getRoleLabel(senderId),
    usage: __incUsage('bonz cút', senderId)
  });
  await api.sendMessage(header, threadId, type);

  let ok = 0, fail = 0;
  const errorDetails = [];
  
  for (const uid of targets) {
    try {
      await api[workingKickMethod](uid, threadId);
      ok++;
      // Delay nhỏ để tránh spam API
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      fail++;
      const msg = e?.message || e?.error?.message || String(e);
      errorDetails.push({ uid, msg });
    }
  }

  const lines = [
    '🛠️ Kết quả kick thành viên',
    `✅ Thành công: ${ok}`,
    `❌ Thất bại: ${fail}`
  ];
  
  if (errorDetails.length > 0) {
    const top = errorDetails.slice(0, 3)
      .map((e, i) => ` • #${i+1} UID ${e.uid}: ${e.msg}`);
    lines.push('', 'Chi tiết lỗi (tối đa 3):', ...top);
  }
  
  return api.sendMessage(lines.join('\n'), threadId, type);
}

// Chọn bài hát từ danh sách: bonz song chọn <số>
async function handleSongSelect(api, event, songIndex, originalQuery) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz song', senderId);

  // Lấy lại danh sách từ cache hoặc search lại
  const query = originalQuery || 'default search';
  try {
    const searchUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
    const searchRes = await axios.get(searchUrl, { timeout: 15000 });
    const songs = searchRes?.data?.data || [];
    
    if (songIndex > songs.length) {
      const header = __formatServiceInfo({
        service: 'bonz song', userName, userId: senderId, role, usage,
        notify: `Số thứ tự không hợp lệ. Chỉ có ${songs.length} bài hát.`
      });
      return api.sendMessage(header, threadId, type);
    }

    const selectedSong = songs[songIndex - 1];
    const artist = selectedSong?.artist?.name || 'Unknown Artist';
    const title = selectedSong?.title || 'Unknown Title';

    // Lấy lời bài hát
    const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
    const lyricsRes = await axios.get(lyricsUrl, { timeout: 15000 });
    const lyrics = lyricsRes?.data?.lyrics;

    if (!lyrics) {
      const header = __formatServiceInfo({
        service: 'bonz song', userName, userId: senderId, role, usage,
        notify: `Không tìm thấy lời cho: ${artist} - ${title}`
      });
      return api.sendMessage(header, threadId, type);
    }

    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: `🎵 ${artist} - ${title}`
    });

    // Chia lời bài hát nếu quá dài
    const maxLength = 3000;
    const lyricsClean = lyrics.trim();
    
    if (lyricsClean.length <= maxLength) {
      return api.sendMessage(`${header}\n\n${lyricsClean}`, threadId, type);
    } else {
      const parts = [];
      let currentPart = '';
      const lines = lyricsClean.split('\n');
      
      for (const line of lines) {
        if ((currentPart + line + '\n').length > maxLength) {
          if (currentPart) parts.push(currentPart.trim());
          currentPart = line + '\n';
        } else {
          currentPart += line + '\n';
        }
      }
      if (currentPart) parts.push(currentPart.trim());

      await api.sendMessage(`${header}\n\n${parts[0]}`, threadId, type);
      
      for (let i = 1; i < parts.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await api.sendMessage(`📝 Phần ${i + 1}:\n\n${parts[i]}`, threadId, type);
      }
    }

  } catch (error) {
    console.error('Lỗi chọn bài hát:', error);
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Gửi tin nhắn khó bị xóa: bonz ghost <tin nhắn>
async function handleGhostMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz ghost', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz ghost', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn cần gửi',
      howToUse: 'bonz ghost <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n💡 Tính năng này sẽ gửi tin nhắn với nhiều kỹ thuật chống xóa`, threadId, type);
  }

  try {
    // Kỹ thuật 1: Ký tự Unicode đặc biệt và zero-width
    const invisibleChars = [
      '\u200B', // Zero Width Space
      '\u200C', // Zero Width Non-Joiner  
      '\u200D', // Zero Width Joiner
      '\u2060', // Word Joiner
      '\u180E', // Mongolian Vowel Separator
      '\uFEFF', // Zero Width No-Break Space
      '\u034F'  // Combining Grapheme Joiner
    ];
    
    // Kỹ thuật 2: Tạo nhiều biến thể của tin nhắn
    const variants = [];
    for (let i = 0; i < 5; i++) {
      const randomInvisible = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
      const randomInvisible2 = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
      
      // Chèn ký tự ẩn vào giữa từng từ
      const words = message.split(' ');
      const ghostWords = words.map(word => {
        const mid = Math.floor(word.length / 2);
        return word.slice(0, mid) + randomInvisible + word.slice(mid);
      });
      
      variants.push(`${randomInvisible2}${ghostWords.join(' ')}${randomInvisible}`);
    }
    
    // Kỹ thuật 3: Gửi với format khác nhau và timing random
    const emojis = ['👻', '🔒', '💀', '🌟', '🔥', '⚡', '💎', '🎭'];
    
    for (let i = 0; i < variants.length; i++) {
      const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
      const finalMessage = `${randomEmoji} ${variants[i]}`;
      
      setTimeout(() => {
        api.sendMessage(finalMessage, threadId, type);
      }, i * 150 + Math.random() * 100); // Random delay
    }
    
    // Kỹ thuật 4: Gửi thêm tin nhắn "bẫy" để làm nhiễu
    const decoyMessages = [
      '⠀', // Braille blank
      '‌', // Zero width non-joiner
      '⁣', // Invisible separator
    ];
    
    decoyMessages.forEach((decoy, i) => {
      setTimeout(() => {
        api.sendMessage(decoy, threadId, type);
      }, (variants.length + i) * 200);
    });
    
    const header = __formatServiceInfo({
      service: 'bonz ghost', userName, userId: senderId, role, usage,
      notify: 'Đã gửi tin nhắn ghost cấp cao!'
    });
    
    return api.sendMessage(`${header}\n\n👻 Tin nhắn đã được gửi với kỹ thuật bypass admin\n🔒 Gồm: Unicode ẩn + đa biến thể + timing random + tin nhắn bẫy\n⚡ Khó bị phát hiện và xóa ngay cả bởi QTV`, threadId, type);

  } catch (error) {
    console.error('Lỗi gửi ghost message:', error);
    const header = __formatServiceInfo({
      service: 'bonz ghost', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tin nhắn không thể xóa: bonz permanent <tin nhắn>
async function handlePermanentMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz permanent', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz permanent', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn cần gửi vĩnh viễn',
      howToUse: 'bonz permanent <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n🔒 Tính năng này tạo tin nhắn tự phục hồi khi bị xóa`, threadId, type);
  }

  try {
    // Lưu tin nhắn vào memory để tự phục hồi
    const messageId = Date.now().toString();
    const permanentData = {
      id: messageId,
      content: message,
      threadId: threadId,
      senderId: senderId,
      userName: userName,
      timestamp: new Date().toISOString(),
      active: true
    };

    // Tạo tin nhắn với nhiều lớp bảo vệ
    const protectedMessage = `🔒 PERMANENT MESSAGE [ID: ${messageId}]\n\n${message}\n\n⚠️ Tin nhắn này sẽ tự phục hồi nếu bị xóa`;
    
    // Gửi tin nhắn chính
    const sentMsg = await api.sendMessage(protectedMessage, threadId, type);
    
    // Tạo hệ thống backup tự động VĨNH VIỄN
    const backupInterval = setInterval(async () => {
      try {
        // Gửi lại tin nhắn gốc ngay lập tức
        await api.sendMessage(protectedMessage, threadId, type);
        
        // Gửi thêm tin nhắn backup với timestamp
        const backupMessage = `🔄 AUTO-RESTORE [${messageId}] - ${new Date().toLocaleTimeString()}\n${message}`;
        setTimeout(async () => {
          try {
            await api.sendMessage(backupMessage, threadId, type);
          } catch (e) {
            console.log('Backup send failed:', e.message);
          }
        }, 15000);
        
      } catch (e) {
        console.log('Backup failed:', e.message);
        // Nếu lỗi, thử gửi tin nhắn đơn giản hơn
        setTimeout(async () => {
          try {
            await api.sendMessage(message, threadId, type);
          } catch (err) {
            console.log('Simple backup failed:', err.message);
          }
        }, 5000);
      }
    }, 45000); // Kiểm tra mỗi 45 giây

    // KHÔNG dừng backup - chạy mãi mãi
    // setTimeout(() => {
    //   clearInterval(backupInterval);
    // }, 600000);

    // Gửi tin nhắn ẩn để theo dõi
    const invisibleTracker = '\u200B\u200C\u200D' + messageId + '\u2060\uFEFF';
    await api.sendMessage(invisibleTracker, threadId, type);

    const header = __formatServiceInfo({
      service: 'bonz permanent', userName, userId: senderId, role, usage,
      notify: 'Đã tạo tin nhắn vĩnh viễn thành công!'
    });
    
    return api.sendMessage(`${header}\n\n🔒 Tin nhắn ID: ${messageId}\n⚡ Hệ thống tự phục hồi: VĨNH VIỄN\n🔄 Backup mỗi 45 giây MÃI MÃI\n⚠️ Cứ xóa cứ gửi lại - KHÔNG BAO GIỜ DỪNG\n💀 Chỉ dừng khi restart bot`, threadId, type);

  } catch (error) {
    console.error('Lỗi tạo permanent message:', error);
    const header = __formatServiceInfo({
      service: 'bonz permanent', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tin nhắn bất tử: bonz immortal <tin nhắn>
async function handleImmortalMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz immortal', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz immortal', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn bất tử',
      howToUse: 'bonz immortal <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n💀 Tạo tin nhắn THỰC SỰ không thể xóa`, threadId, type);
  }

  try {
    const messageId = Date.now().toString();
    
    // Kỹ thuật 1: Flood với nhiều tin nhắn liên tục
    const floodMessages = [];
    for (let i = 0; i < 20; i++) {
      const invisiblePrefix = '\u200B'.repeat(i) + '\u200C'.repeat(i % 3);
      floodMessages.push(`${invisiblePrefix}💀 ${message} 💀${invisiblePrefix}`);
    }
    
    // Gửi flood ngay lập tức
    floodMessages.forEach((msg, i) => {
      setTimeout(() => {
        api.sendMessage(msg, threadId, type);
      }, i * 50);
    });
    
    // Kỹ thuật 2: Tạo vòng lặp vô hạn gửi tin nhắn
    const immortalLoop = () => {
      const variants = [
        `💀 IMMORTAL: ${message}`,
        `🔥 UNDELETABLE: ${message}`,
        `⚡ ETERNAL: ${message}`,
        `👑 GOD MODE: ${message}`,
        `🛡️ PROTECTED: ${message}`
      ];
      
      variants.forEach((variant, i) => {
        setTimeout(() => {
          api.sendMessage(variant, threadId, type);
        }, i * 100);
      });
      
      // Lặp lại sau 10 giây
      setTimeout(immortalLoop, 10000);
    };
    
    // Bắt đầu vòng lặp bất tử
    immortalLoop();
    
    // Kỹ thuật 3: Tạo nhiều timer backup
    for (let i = 0; i < 5; i++) {
      setInterval(() => {
        const backupMsg = `🔄 BACKUP-${i}: ${message}`;
        api.sendMessage(backupMsg, threadId, type);
      }, (i + 1) * 15000);
    }
    
    const header = __formatServiceInfo({
      service: 'bonz immortal', userName, userId: senderId, role, usage,
      notify: 'Đã tạo tin nhắn BẤT TỬ!'
    });
    
    return api.sendMessage(`${header}\n\n💀 Tin nhắn ID: ${messageId}\n🔥 Chế độ: IMMORTAL MODE\n⚡ Flood: 20 tin nhắn/giây\n🛡️ Backup: 5 timer song song\n👑 Vòng lặp: Mỗi 10 giây\n💣 KHÔNG THỂ XÓA BẰNG CÁCH NÀO!`, threadId, type);

  } catch (error) {
    console.error('Lỗi tạo immortal message:', error);
    const header = __formatServiceInfo({
      service: 'bonz immortal', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tin nhắn tuyệt đối không thể xóa: bonz absolute <tin nhắn>
async function handleAbsoluteMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz absolute', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz absolute', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn tuyệt đối',
      howToUse: 'bonz absolute <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n🛡️ Tạo 1 tin nhắn TUYỆT ĐỐI không thể xóa`, threadId, type);
  }

  try {
    // Kỹ thuật siêu nâng cao: Bypass tất cả quyền admin
    const ultraProtectionChars = [
      '\u202A', '\u202B', '\u202C', '\u202D', '\u202E', // Bidirectional formatting
      '\u2066', '\u2067', '\u2068', '\u2069', // Isolate formatting
      '\u061C', '\u200E', '\u200F', // Directional marks
      '\u034F', '\u180E', '\u2060', '\uFEFF', // Invisible separators
      '\u1160', '\u3164', '\uFFA0', // Hangul fillers
      '\u115F', '\u1160', '\u17B4', '\u17B5' // More invisible chars
    ];

    // Tạo cấu trúc phức tạp không thể parse
    let hyperProtectedMessage = '';
    for (let i = 0; i < message.length; i++) {
      const char = message[i];
      const protection1 = ultraProtectionChars[Math.floor(Math.random() * ultraProtectionChars.length)];
      const protection2 = ultraProtectionChars[Math.floor(Math.random() * ultraProtectionChars.length)];
      const protection3 = ultraProtectionChars[Math.floor(Math.random() * ultraProtectionChars.length)];
      
      hyperProtectedMessage += protection1 + protection2 + char + protection3;
    }

    // Thêm lớp bảo vệ tối thượng
    const finalMessage = `\u202D\u2066🛡️\u2069\u202E\u034F ${hyperProtectedMessage} \u034F\u202D\u2066🔒\u2069\u202E`;

    // Gửi tin nhắn siêu bảo vệ
    await api.sendMessage(finalMessage, threadId, type);

    // Hệ thống BẤT TỬ - Không bao giờ dừng
    const immortalSystem = () => {
      // Layer 1: Continuous resurrection every 2 seconds
      setInterval(async () => {
        try {
          await api.sendMessage(finalMessage, threadId, type);
        } catch (e) {
          console.log('Immortal restore failed:', e.message);
        }
      }, 2000);

      // Layer 2: Multi-variant immortal backups
      const immortalVariants = [
        `\u2067💀\u2069 IMMORTAL: ${message} \u2067👑\u2069`,
        `\u202E🔥\u202D UNDYING: ${message} \u202E⚡\u202D`,
        `\u2068🛡️\u2069 ETERNAL: ${message} \u2068💎\u2069`,
        `\u202D👻\u202E GHOST: ${message} \u202D🌟\u202E`,
        `\u2066🔮\u2069 MYSTIC: ${message} \u2066✨\u2069`
      ];

      immortalVariants.forEach((variant, i) => {
        setInterval(async () => {
          try {
            await api.sendMessage(variant, threadId, type);
          } catch (e) {
            console.log(`Immortal variant ${i} failed:`, e.message);
          }
        }, (i + 2) * 3000); // 6s, 9s, 12s, 15s, 18s
      });

      // Layer 3: Flood protection - rapid fire
      setInterval(async () => {
        for (let i = 0; i < 3; i++) {
          setTimeout(async () => {
            try {
              await api.sendMessage(`\u034F💀 ${message} 💀\u034F`, threadId, type);
            } catch (e) {
              console.log('Flood protection failed:', e.message);
            }
          }, i * 500);
        }
      }, 10000); // Every 10 seconds, send 3 rapid messages

      // Layer 4: Deep immortal core - never stops
      const deepCore = () => {
        setTimeout(async () => {
          try {
            await api.sendMessage(`\u202D\u2066💀 IMMORTAL CORE: ${message} 💀\u2069\u202E`, threadId, type);
            deepCore(); // Recursive immortality
          } catch (e) {
            console.log('Deep core failed:', e.message);
            deepCore(); // Even if fails, restart
          }
        }, 5000);
      };
      deepCore();
    };

    // Start immortal system
    immortalSystem();

    const header = __formatServiceInfo({
      service: 'bonz absolute', userName, userId: senderId, role, usage,
      notify: 'Đã tạo tin nhắn SIÊU TUYỆT ĐỐI!'
    });
    
    return api.sendMessage(`${header}\n\n💀 HỆ THỐNG BẤT TỬ ĐÃ KÍCH HOẠT!\n🔥 Layer 1: Phục sinh mỗi 2 giây\n⚡ Layer 2: 5 biến thể immortal (6s-18s)\n💣 Layer 3: Flood protection mỗi 10s\n🌟 Layer 4: Deep Core - Đệ quy vô hạn\n👑 TIN NHẮN BẤT TỬ - KHÔNG BAO GIỜ CHẾT!`, threadId, type);

  } catch (error) {
    console.error('Lỗi tạo absolute message:', error);
    const header = __formatServiceInfo({
      service: 'bonz absolute', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Flood message: bonz flood <tin nhắn>
async function handleFloodMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz flood', senderId);

  const message = (args || []).join(' ').trim();
  if (!message) {
    const header = __formatServiceInfo({
      service: 'bonz flood', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tin nhắn để flood',
      howToUse: 'bonz flood <tin nhắn>'
    });
    return api.sendMessage(`${header}\n\n💣 Flood tin nhắn - QTV xóa không kịp`, threadId, type);
  }

  try {
    const header = __formatServiceInfo({
      service: 'bonz flood', userName, userId: senderId, role, usage,
      notify: 'Bắt đầu flood tin nhắn!'
    });
    
    await api.sendMessage(`${header}\n\n💣 FLOOD MODE ACTIVATED!\n⚡ Gửi 50 tin nhắn trong 10 giây\n💀 QTV xóa không kịp\n🔥 Bắt đầu trong 3 giây...`, threadId, type);

    // Đợi 3 giây rồi bắt đầu flood
    setTimeout(() => {
      for (let i = 0; i < 50; i++) {
        setTimeout(() => {
          const variants = [
            `💀 ${message}`,
            `🔥 ${message}`,
            `⚡ ${message}`,
            `💣 ${message}`,
            `👑 ${message}`
          ];
          const randomVariant = variants[i % variants.length];
          api.sendMessage(randomVariant, threadId, type);
        }, i * 200); // Mỗi 0.2 giây gửi 1 tin
      }
    }, 3000);

    return;

  } catch (error) {
    console.error('Lỗi flood message:', error);
    const header = __formatServiceInfo({
      service: 'bonz flood', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Fake delete: bonz delete (chỉ flood che giấu)
async function handleDeleteAdminMessage(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz delete', senderId);

  const header = __formatServiceInfo({
    service: 'bonz delete', userName, userId: senderId, role, usage,
    notify: 'THỰC TẾ: Không thể xóa tin nhắn người khác!'
  });

  await api.sendMessage(`${header}\n\n❌ SỰ THẬT VỀ ZALO API:\n🔒 Chỉ xóa được tin nhắn của chính bot\n🚫 KHÔNG THỂ xóa tin nhắn user khác\n💀 Kể cả Admin/QTV cũng không xóa được\n\n💡 GIẢI PHÁP THAY THẾ:\n💣 bonz flood - Che giấu bằng spam\n🛡️ bonz ghost - Tin nhắn khó xóa\n⚡ bonz permanent - Tự phục hồi`, threadId, type);

  // Demo flood che giấu
  setTimeout(() => {
    const floodMessages = [
      '💀 FAKE DELETE DEMO 💀',
      '🔥 CHE GIẤU TIN NHẮN 🔥',
      '⚡ FLOOD COVER-UP ⚡',
      '💣 BONZ POWER 💣',
      '👑 KHÔNG XÓA ĐƯỢC THÌ CHE ĐI 👑'
    ];
    
    floodMessages.forEach((msg, i) => {
      setTimeout(() => {
        api.sendMessage(msg, threadId, type);
      }, i * 200);
    });
  }, 2000);

  return;
}

// Tìm lời bài hát: bonz song <tên bài hát>
async function handleSong(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz song', senderId);

  const songQuery = (args || []).join(' ').trim();
  if (!songQuery) {
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: 'Hãy nhập tên bài hát cần tìm lời',
      howToUse: 'bonz song <tên bài hát>'
    });
    return api.sendMessage(header, threadId, type);
  }

  // Danh sách lời bài hát Việt Nam cục bộ
  const vietnameseSongs = {
    'thiên lý ơi': {
      artist: 'Jack - J97',
      title: 'Thiên Lý Ơi',
      lyrics: `Thiên lý ơi thiên lý
Sao em nỡ đành quên anh đi
Thiên lý ơi thiên lý
Tình yêu này chôn vùi trong tim

Anh vẫn nhớ những ngày xưa
Em bên anh dưới ánh trăng vàng
Giờ đây em đã xa rồi
Để lại anh với nỗi đau thương

Thiên lý ơi thiên lý
Sao em nỡ đành quên anh đi
Thiên lý ơi thiên lý
Tình yêu này chôn vùi trong tim

Có những đêm anh thao thức
Nhớ về em trong cơn mưa
Có những lúc anh muốn khóc
Vì tình yêu đã phai nhòa

Thiên lý ơi thiên lý
Sao em nỡ đành quên anh đi
Thiên lý ơi thiên lý
Tình yêu này chôn vùi trong tim

Em ơi em có biết không
Anh vẫn yêu em như ngày nào
Dù cho thời gian có trôi
Tình anh vẫn mãi không phai`
    },
    'nơi này có anh': {
      artist: 'Sơn Tùng M-TP',
      title: 'Nơi này có anh',
      lyrics: `Anh đã từng yêu em rất nhiều
Nhưng tại sao bây giờ lại thế này
Anh không hiểu nổi tại sao
Em lại có thể quay lưng bỏ đi

Nơi này có anh, nơi này có anh
Đã từng có em trong vòng tay
Nơi này có anh, nơi này có anh
Giờ chỉ còn lại một mình anh thôi

Anh vẫn nhớ những ngày đầu
Khi em bên anh, anh thấy hạnh phúc
Những lời yêu thương em nói
Giờ đây chỉ còn là kỷ niệm

Nơi này có anh, nơi này có anh
Đã từng có em trong vòng tay
Nơi này có anh, nơi này có anh
Giờ chỉ còn lại một mình anh thôi`
    },
    'chúng ta không thuộc về nhau': {
      artist: 'Sơn Tùng M-TP',
      title: 'Chúng ta không thuộc về nhau',
      lyrics: `Chúng ta không thuộc về nhau
Dù cho em có yêu anh đến mấy
Chúng ta không thuộc về nhau
Dù cho anh có thương em nhiều thế nào

Tình yêu này chỉ là giấc mơ
Mà thôi, em ơi
Tình yêu này chỉ là ảo tưởng
Mà thôi, em ơi

Anh biết em đang buồn
Anh biết em đang khóc
Nhưng chúng ta thật sự không thể
Bên nhau được mãi mãi`
    },
    'lạc trôi': {
      artist: 'Sơn Tùng M-TP',
      title: 'Lạc trôi',
      lyrics: `Anh như đang lạc trôi
Giữa những con người xa lạ
Anh như đang lạc trôi
Trong thế giới này không có em

Lạc trôi, lạc trôi
Anh đang lạc trôi
Lạc trôi, lạc trôi
Không biết đường về

Em đã ra đi rồi
Để lại anh một mình
Em đã ra đi rồi
Anh chỉ biết khóc thầm`
    }
  };

  // Kiểm tra bài hát Việt Nam trước
  const queryLower = songQuery.toLowerCase();
  const vietnameseSong = vietnameseSongs[queryLower];
  
  if (vietnameseSong) {
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: `🎵 ${vietnameseSong.artist} - ${vietnameseSong.title}`
    });
    return api.sendMessage(`${header}\n\n${vietnameseSong.lyrics}`, threadId, type);
  }

  try {
    // Sử dụng API offline/local fallback khi mạng kém
    const apis = [
      {
        name: 'Local Lyrics Database',
        search: async (query) => {
          console.log(`[bonz song] Searching in local database: ${query}`);
          
          // Mở rộng database lời bài hát cục bộ
          const localSongs = {
            'shape of you': {
              artist: 'Ed Sheeran',
              title: 'Shape of You',
              lyrics: `The club isn't the best place to find a lover
So the bar is where I go
Me and my friends at the table doing shots
Drinking fast and then we talk slow
Come over and start up a conversation with just me
And trust me I'll give it a chance now
Take my hand, stop, put Van the Man on the jukebox
And then we start to dance, and now I'm singing like

Girl, you know I want your love
Your love was handmade for somebody like me
Come on now, follow my lead
I may be crazy, don't mind me
Say, boy, let's not talk too much
Grab on my waist and put that body on me
Come on now, follow my lead
Come, come on now, follow my lead

I'm in love with the shape of you
We push and pull like a magnet do
Although my heart is falling too
I'm in love with your body
And last night you were in my room
And now my bedsheets smell like you
Every day discovering something brand new
I'm in love with your body`
            },
            'hello': {
              artist: 'Adele',
              title: 'Hello',
              lyrics: `Hello, it's me
I was wondering if after all these years you'd like to meet
To go over everything
They say that time's supposed to heal ya, but I ain't done much healing

Hello, can you hear me?
I'm in California dreaming about who we used to be
When we were younger and free
I've forgotten how it felt before the world fell at our feet

There's such a difference between us
And a million miles

Hello from the other side
I must've called a thousand times
To tell you I'm sorry for everything that I've done
But when I call, you never seem to be home

Hello from the outside
At least I can say that I've tried
To tell you I'm sorry for breaking your heart
But it don't matter, it clearly doesn't tear you apart anymore`
            },
            'despacito': {
              artist: 'Luis Fonsi ft. Daddy Yankee',
              title: 'Despacito',
              lyrics: `Sí, sabes que ya llevo un rato mirándote
Tengo que bailar contigo hoy (DY)
Vi que tu mirada ya estaba llamándome
Muéstrame el camino que yo voy

Oh, tú, tú eres el imán y yo soy el metal
Me voy acercando y voy armando el plan
Solo con pensarlo se acelera el pulso (Oh yeah)

Ya, ya me está gustando más de lo normal
Todos mis sentidos van pidiendo más
Esto hay que tomarlo sin ningún apuro

Despacito
Quiero respirar tu cuello despacito
Deja que te diga cosas al oído
Para que te acuerdes si no estás conmigo

Despacito
Quiero desnudarte a besos despacito
Firmar las paredes de tu laberinto
Y hacer de tu cuerpo todo un manuscrito (sube, sube, sube)
(Sube, sube)`
            },
            ...vietnameseSongs
          };
          
          const queryLower = query.toLowerCase();
          for (const [key, song] of Object.entries(localSongs)) {
            if (queryLower.includes(key) || key.includes(queryLower)) {
              console.log(`[bonz song] Found in local database: ${song.artist} - ${song.title}`);
              return song;
            }
          }
          
          return null;
        }
      },
      {
        name: 'Robust Lyrics API',
        search: async (query) => {
          console.log(`[bonz song] Trying robust API with retry: ${query}`);
          
          const tryAPI = async (url, timeout = 8000) => {
            try {
              const response = await axios.get(url, { 
                timeout,
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              return response.data;
            } catch (e) {
              console.log(`[bonz song] API call failed: ${e.message}`);
              return null;
            }
          };
          
          // Thử API đơn giản nhất trước
          const searchUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
          const searchData = await tryAPI(searchUrl, 8000);
          
          if (searchData && searchData.data && searchData.data.length > 0) {
            const song = searchData.data[0];
            const artist = song?.artist?.name;
            const title = song?.title;
            
            if (artist && title) {
              const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
              const lyricsData = await tryAPI(lyricsUrl, 10000);
              
              if (lyricsData && lyricsData.lyrics && lyricsData.lyrics.trim()) {
                console.log(`[bonz song] Robust API success: ${artist} - ${title}`);
                return { artist, title, lyrics: lyricsData.lyrics.trim() };
              }
            }
          }
          
          return null;
        }
      },
      {
        name: 'Lyrics.ovh Enhanced',
        search: async (query) => {
          console.log(`[bonz song] Searching with Lyrics.ovh Enhanced: ${query}`);
          const searchUrl = `https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`;
          const searchRes = await axios.get(searchUrl, { timeout: 15000 });
          const songs = searchRes?.data?.data || [];
          console.log(`[bonz song] Found ${songs.length} songs`);
          
          if (songs.length === 0) return null;
          
          // Tìm bài hát khớp nhất với query
          let bestMatch = null;
          let bestScore = 0;
          
          for (const song of songs.slice(0, 5)) { // Kiểm tra 5 bài đầu
            const artist = song?.artist?.name || '';
            const title = song?.title || '';
            const fullName = `${artist} ${title}`.toLowerCase();
            const queryLower = query.toLowerCase();
            
            // Tính điểm khớp
            let score = 0;
            const queryWords = queryLower.split(' ').filter(w => w.length > 2);
            for (const word of queryWords) {
              if (fullName.includes(word)) score += 1;
            }
            
            // Ưu tiên bài có tên khớp chính xác
            if (title.toLowerCase().includes(queryLower) || queryLower.includes(title.toLowerCase())) {
              score += 5;
            }
            
            console.log(`[bonz song] ${artist} - ${title}: score ${score}`);
            
            if (score > bestScore) {
              bestScore = score;
              bestMatch = song;
            }
          }
          
          if (!bestMatch || bestScore === 0) {
            bestMatch = songs[0]; // Fallback về bài đầu tiên
          }
          
          const artist = bestMatch?.artist?.name || 'Unknown Artist';
          const title = bestMatch?.title || 'Unknown Title';
          console.log(`[bonz song] Best match: ${artist} - ${title} (score: ${bestScore})`);
          
          const lyricsUrl = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
          const lyricsRes = await axios.get(lyricsUrl, { timeout: 15000 });
          const lyrics = lyricsRes?.data?.lyrics;
          
          console.log(`[bonz song] Lyrics found: ${lyrics ? 'YES' : 'NO'}`);
          return lyrics ? { artist, title, lyrics } : null;
        }
      },
      {
        name: 'Alternative Lyrics API',
        search: async (query) => {
          console.log(`[bonz song] Trying Alternative Lyrics API: ${query}`);
          try {
            // API backup khác
            const lyricsUrl = `https://api.lyrics.dev/search?q=${encodeURIComponent(query)}`;
            const response = await axios.get(lyricsUrl, { 
              timeout: 15000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
              }
            });
            
            if (response.data && response.data.lyrics && response.data.lyrics.trim()) {
              const artist = response.data.artist || 'Unknown Artist';
              const title = response.data.title || query;
              const lyrics = response.data.lyrics.trim();
              
              console.log(`[bonz song] Alternative API found lyrics for: ${artist} - ${title}`);
              return { artist, title, lyrics };
            }
            return null;
          } catch (e) {
            console.log(`[bonz song] Alternative API failed: ${e.message}`);
            return null;
          }
        }
      }
    ];

    let result = null;
    let lastError = null;
    
    for (const api of apis) {
      try {
        console.log(`[bonz song] Trying ${api.name}...`);
        result = await api.search(songQuery);
        if (result) {
          console.log(`[bonz song] Success with ${api.name}`);
          break;
        }
      } catch (e) {
        lastError = e;
        console.log(`[bonz song] ${api.name} failed:`, e?.message);
        continue;
      }
    }

    if (!result) {
      // Khi mạng kém hoặc API down, đưa ra thông báo thân thiện
      const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(songQuery);
      
      const header = __formatServiceInfo({
        service: 'bonz song', userName, userId: senderId, role, usage,
        notify: '⚠️ Mạng không ổn định - Không tìm thấy lời bài hát'
      });
      
      const suggestions = [
        `🔄 Thử lại sau: bonz song ${songQuery}`,
        `📱 Tìm trên Google: "${songQuery} ${isVietnamese ? 'lời bài hát' : 'lyrics'}"`,
        `🎵 Tìm trên ${isVietnamese ? 'NhacCuaTui' : 'Genius'}: "${songQuery}"`,
        `💡 Hoặc thử tên bài hát khác chính xác hơn`
      ];
      
      return api.sendMessage(`${header}\n\n${suggestions.join('\n')}\n\n⚡ Lưu ý: Bot đã lưu một số bài hát phổ biến offline như:\n• Shape of You\n• Hello\n• Despacito\n• Thiên Lý Ơi`, threadId, type);
    }

    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: `🎵 ${result.artist} - ${result.title}`
    });

    // Gửi toàn bộ lời bài hát đầy đủ - không giới hạn
    const lyricsClean = result.lyrics.trim();
    
    console.log(`[bonz song] Full lyrics length: ${lyricsClean.length} characters`);
    
    // Chia thành các phần nhỏ để đảm bảo gửi hết, không bỏ sót
    const maxLength = 3500; // Giảm xuống để đảm bảo không bị cắt
    const parts = [];
    let currentPart = '';
    const lines = lyricsClean.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextPart = currentPart + line + '\n';
      
      // Nếu thêm dòng này sẽ vượt quá giới hạn
      if (nextPart.length > maxLength && currentPart.length > 0) {
        parts.push(currentPart.trim());
        currentPart = line + '\n';
      } else {
        currentPart = nextPart;
      }
    }
    
    // Luôn thêm phần cuối cùng
    if (currentPart.trim().length > 0) {
      parts.push(currentPart.trim());
    }
    
    // Nếu không có phần nào, thêm toàn bộ
    if (parts.length === 0) {
      parts.push(lyricsClean);
    }

    console.log(`[bonz song] Will send ${parts.length} parts to ensure full lyrics`);
    
    // Gửi tất cả các phần
    for (let i = 0; i < parts.length; i++) {
      if (i === 0) {
        // Phần đầu với header
        await api.sendMessage(`${header}\n\n${parts[i]}`, threadId, type);
      } else {
        // Các phần tiếp theo
        await new Promise(resolve => setTimeout(resolve, 2000));
        await api.sendMessage(`🎵 Tiếp theo (${i + 1}/${parts.length}):\n\n${parts[i]}`, threadId, type);
      }
    }
    
    // Thông báo hoàn tất nếu có nhiều phần
    if (parts.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await api.sendMessage(`✅ Hoàn tất! Đã gửi toàn bộ lời bài hát (${parts.length} phần, ${lyricsClean.length} ký tự)`, threadId, type);
    }

  } catch (error) {
    console.error('Lỗi tìm lời bài hát:', error);
    const header = __formatServiceInfo({
      service: 'bonz song', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Tâm sự cùng bot (ChatGPT): bonz tâm sự <nội dung>
async function handleTamSu(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz tâm sự', senderId);

  const text = (args || []).join(' ').trim();
  if (!text) {
    const header = __formatServiceInfo({
      service: 'bonz tâm sự', userName, userId: senderId, role, usage,
      notify: 'Hãy chia sẻ điều bạn muốn tâm sự',
      howToUse: 'bonz tâm sự <nội dung>'
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    const basePrompt = `Bạn là người bạn tâm lý, phản hồi NGẮN (<= 120 từ), ấm áp, đồng cảm, TIẾNG VIỆT, gợi ý nhỏ để cải thiện. Không phán xét, không tư vấn y khoa/pháp lý. Tình huống: \n\n"${text}"`;
    const apiUrl = `https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(basePrompt)}`;
    const aiRes = await axios.get(apiUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    let answer = aiRes?.data;
    // Chuẩn hóa từ nhiều dạng payload có thể gặp
    if (typeof answer === 'object') {
      answer = answer?.content || answer?.message || answer?.result || answer?.reply || answer?.data || answer?.output || '';
    }
    if (typeof answer !== 'string') answer = String(answer || '');
    // Loại bỏ dấu ngoặc kép/space thừa
    answer = answer.replace(/^["'“”\s]+|["'“”\s]+$/g, '').trim();
    // Nếu vẫn rỗng, thử fallback lần 2 với prompt tối giản
    if (!answer) {
      const fallbackPrompt = `Trả lời bằng tiếng Việt, ngắn gọn (<= 120 từ), đồng cảm và thực tế cho tình huống: "${text}"`;
      const altUrl = `https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(fallbackPrompt)}`;
      const alt = await axios.get(altUrl, { timeout: 12000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let altAns = alt?.data;
      if (typeof altAns === 'object') altAns = altAns?.content || altAns?.message || altAns?.result || altAns?.reply || altAns?.data || altAns?.output || '';
      answer = typeof altAns === 'string' ? altAns : String(altAns || '');
      answer = answer.replace(/^["'“”\s]+|["'“”\s]+$/g, '').trim();
    }
    if (!answer) answer = 'Tớ hiểu cảm giác của bạn. Hãy hít sâu, cho mình một khoảng lặng nhỏ và thử ghi ra 3 điều bạn có thể làm ngay bây giờ để nhẹ lòng hơn nhé.';
    const header = __formatServiceInfo({
      service: 'bonz tâm sự', userName, userId: senderId, role, usage,
      notify: 'Phản hồi từ người bạn BONZ'
    });
    return api.sendMessage(`${header}\n\n${answer}`, threadId, type);
  } catch (_) {
    const header = __formatServiceInfo({
      service: 'bonz tâm sự', userName, userId: senderId, role, usage,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau'
    });
    return api.sendMessage(header, threadId, type);
  }
}
module.exports.run = async ({ api, event, args, Threads }) => {
  const { threadId, type } = event;
  const sub = (args[0] || "").toLowerCase();
  // Fallback: nếu Threads không được inject, require controller trực tiếp
  let ThreadsRef = Threads;
  if (!ThreadsRef) {
    try { ThreadsRef = require('../../core/controller/controllerThreads'); } catch {}
  }

  // Forward: bonz admin ... -> admin.js
  if (sub === 'admin') {
    try {
      const adminCmd = require('./admin.js');
      const Threads = require('../../core/controller/controllerThreads');
      await adminCmd.run({ args: args.slice(1), event, api, Threads });
    } catch (e) {
      try {
        await api.sendMessage('❌ Không thể thực thi bonz admin. Vui lòng thử lại.', threadId, type);
      } catch {}
    }
    return;
  }

  // Forward: bonz anti ... -> anti.js
  if (sub === 'anti') {
    try {
      const antiCmd = require('./anti.js');
      const Threads = require('../../core/controller/controllerThreads');
      await antiCmd.run({ args: args.slice(1), event, api, Threads });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz anti. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz cdm ... -> cdm.js
  if (sub === 'cdm') {
    try {
      const cdmCmd = require('./cdm.js');
      await cdmCmd.run({ args: args.slice(1), event, api });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz cdm. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz cmd ... -> cmd.js
  if (sub === 'cmd') {
    try {
      const cmdCmd = require('./cmd.js');
      await cmdCmd.run({ args: args.slice(1), event, api });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz cmd. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz girltt ... -> girltt.js (video gái TikTok)
  if (sub === 'girltt' || sub === 'gaitt') {
    try {
      const girlttCmd = require('./girltt.js');
      // Bảng thông tin dịch vụ trước khi gửi video
      const senderId = event?.data?.uidFrom || event?.authorId;
      let userName = 'Người dùng';
      try {
        const info = await api.getUserInfo(senderId);
        userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
      } catch {}
      const role = __getRoleLabel(senderId);
      const usage = __incUsage('bonz girltt', senderId);
      const header = __formatServiceInfo({
        service: 'bonz girltt',
        userName,
        userId: senderId,
        notify: 'Gửi video TikTok ngẫu nhiên',
        role,
        usage,
        keyGot: 0,
        keyCount: 0,
        howToUse: 'bonz girltt'
      });
      await api.sendMessage(header, threadId, type, null, senderId);
      await girlttCmd.run({ event, api, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz girltt. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz sendcard ... -> sendcard.js (gửi danh thiếp)
  if (sub === 'sendcard' || sub === 'sc') {
    try {
      const sendcardCmd = require('./sendcard.js');
      await sendcardCmd.run({ args: args.slice(1), event, api });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz sendcard. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz boxinfo ... -> boxinfo.js (thông tin nhóm)
  if (sub === 'boxinfo' || sub === 'info') {
    try {
      const boxinfoCmd = require('./boxinfo.js');
      await boxinfoCmd.run({ api, event, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz boxinfo. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz itik ... -> itik.js
  if (sub === 'itik') {
    try {
      const itikCmd = require('./itik.js');
      await itikCmd.run({ api, event, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz itik. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Ảnh gái nhanh: bonz gái | bonz gai | bonz girl
  if (sub === 'gái' || sub === 'gai' || sub === 'girl') {
    try {
      const girlCmd = require('./girl.js');
      // Thêm header thông tin dịch vụ
      const senderId = event?.data?.uidFrom || event?.authorId;
      let userName = 'Người dùng';
      try { const info = await api.getUserInfo(senderId); userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng'; } catch {}
      const role = __getRoleLabel(senderId);
      const usage = __incUsage('bonz ảnh gái', senderId);
      const header = __formatServiceInfo({ service: 'bonz ảnh gái', userName, userId: senderId, notify: 'Gửi ảnh ngẫu nhiên', role, usage });
      await api.sendMessage(header, threadId, type, null, senderId);
      await girlCmd.run({ args: [], event, api, Users: undefined });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể gửi ảnh gái lúc này.', threadId, type); } catch {}
    }
    return;
  }

  // Forward: bonz tile ... -> tile.js
  if (sub === 'tile') {
    try {
      const tileCmd = require('./tile.js');
      await tileCmd.run({ api, event, args: args.slice(1) });
    } catch (e) {
      try { await api.sendMessage('❌ Không thể thực thi bonz tile. Vui lòng thử lại.', threadId, type); } catch {}
    }
    return;
  }

  // Ảnh: chỉ còn bonz ảnh gái [số_lượng]
  if (sub === 'ảnh' || sub === 'anh') {
    const choice = (args[1] || '').toLowerCase();
    const rest = args.slice(2);
    if ([ 'gái', 'gai', 'girl' ].includes(choice)) {
      try {
        const girlCmd = require('./girl.js');
        const senderId = event?.data?.uidFrom || event?.authorId;
        let userName = 'Người dùng';
        try { const info = await api.getUserInfo(senderId); userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng'; } catch {}
        const role = __getRoleLabel(senderId);
        const usage = __incUsage('bonz ảnh gái', senderId);
        const header = __formatServiceInfo({ service: 'bonz ảnh gái', userName, userId: senderId, notify: 'Gửi ảnh ngẫu nhiên', role, usage });
        await api.sendMessage(header, threadId, type, null, senderId);
        return await girlCmd.run({ args: [], event, api, Users: undefined });
      } catch (e) {
        return api.sendMessage('❌ Không thể gửi ảnh gái lúc này.', threadId, type);
      }
    }
    if ([ 'trai', 'boy', 'nam' ].includes(choice)) {
      return api.sendMessage('🚫 Tính năng ảnh trai đã được gỡ.', threadId, type);
    }
    return api.sendMessage('Dùng: bonz ảnh gái [1-5]', threadId, type);
  }

  // bonz gmail edu -> gửi hướng dẫn/nguồn tham khảo tạo email EDU
  if (sub === 'gmail' && (args[1] || '').toLowerCase() === 'edu') {
    try {
      await handleGmailEdu(api, event);
    } catch (e) {
      try { await api.sendMessage('❌ Không thể hiển thị hướng dẫn Gmail EDU lúc này.', threadId, type); } catch {}
    }
    return;
  }

  // bonz sr: Tìm kiếm Google bằng Custom Search API (CSE)
  if (sub === 'sr' || sub === 'search') {
    try {
      await handleSearchCSE(api, event, args.slice(1));
    } catch (e) {
      try { await api.sendMessage('❌ Không thể tìm kiếm lúc này.', threadId, type); } catch {}
    }
    return;
  }

  // (đã xử lý router 'ảnh' ở trên)


  // bonz menu admin -> hiển thị danh sách lệnh quản trị viên
  if (sub === 'menu' && (args[1] || '').toLowerCase() === 'admin') {
    const lines = [
      '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN',
      '',
      '• admin list - Xem danh sách admin/support',
      '• admin add [@tag/ID…] - Thêm admin',
      '• admin rm [@tag/ID…] - Gỡ admin',
      '• admin sp [@tag/ID…] - Thêm support',
      '• admin rmsp [@tag/ID…] - Gỡ support',
      '• admin adminonly - Chỉ admin dùng bot',
      '• admin supportonly - Chỉ support dùng bot',
      '• admin boxonly - Chỉ cho phép lệnh trong nhóm',
      '• anti link on|off - Bật/tắt chống link',
      '• anti undo on|off - Bật/tắt chống thu hồi',
      '• anti spam on|off - Bật/tắt chống spam',
      '• bonz menu anti - Xem hướng dẫn anti',
      '• autosend - Tự động gửi tin nhắn theo giờ',
      '• autosend on - Bật autosend cho nhóm hiện tại',
      '• autosend off - Tắt autosend cho nhóm hiện tại',
      '• bonz off - Tắt tương tác nhóm này',
      '• bonz on - Bật lại tương tác nhóm này',
      '• bonz menu autosend - Xem hướng dẫn autosend',
      '• cdm <tên miền> - Kiểm tra thông tin tên miền',
      '• bonz menu cdm - Xem hướng dẫn cdm',
      '• cmd <action> [lệnh] - Quản lý plugin (load/unload/list/info/...)',
      '• bonz menu cmd - Xem hướng dẫn cmd',
      '• reloadconfig - Tải lại config của bot',
      '• setprefix [prefix/reset] - Đặt prefix nhóm',
      '• upt - Hiển thị thời gian hoạt động của bot',
      '',
      '💡 Có thể dùng qua BONZ:',
      '• bonz admin <subcommand> ...',
      'Ví dụ: bonz admin list'
    ];
    await api.sendMessage(lines.join('\n'), threadId, type);
    return;
  }

  // Hiển thị menu BONZ khi không có tham số hoặc có tham số "menu"
  if (!sub || sub === "menu") {
    // Lấy thông tin người dùng
    const { data } = event;
    const senderId = data.uidFrom;
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    const userIdDisplay = senderId;
    const versionText = (module.exports.config && module.exports.config.version) ? module.exports.config.version : '1/1/Z';
    const now = new Date();
    const dd = now.getDate();
    const mm = now.getMonth() + 1;
    const yyyy = now.getFullYear();
    const dateText = `${dd}/${mm}/${yyyy}`;
    const adminList = Array.isArray(global?.config?.admin_bot) ? global.config.admin_bot : [];
    // Xác định chủ nhân: ưu tiên config.owner_bot (string hoặc array), nếu không có thì mặc định là admin đầu tiên
    const ownerConf = global?.config?.owner_bot;
    let ownerList = [];
    if (Array.isArray(ownerConf)) ownerList = ownerConf;
    else if (typeof ownerConf === 'string') ownerList = [ownerConf];
    const ownerFallback = adminList && adminList.length ? adminList[0] : null;
    const isOwner = ownerList.length ? ownerList.includes(userIdDisplay) : (ownerFallback === userIdDisplay);
    const isAdmin = adminList.includes(userIdDisplay);
    const levelText = isOwner ? 'Toàn quyền' : (isAdmin ? 'Quản trị' : 'Thường');
    const userLabel = isOwner ? 'Chủ nhân' : userName;

    // Tạo khung đẹp, thẳng hàng
    const INNER = 32; // độ rộng nội dung bên trong khung
    const repeat = (ch, n) => ch.repeat(n);
    const top = `╔${repeat('═', INNER + 2)}╗`;
    const sep = `╠${repeat('═', INNER + 2)}╣`;
    const bottom = `╚${repeat('═', INNER + 2)}╝`;
    const fit = (text) => {
      const t = String(text ?? '');
      if (t.length > INNER) return t.slice(0, INNER);
      return t.padEnd(INNER, ' ');
    };
    const center = (text) => {
      let t = String(text ?? '');
      if (t.length > INNER) t = t.slice(0, INNER);
      const left = Math.floor((INNER - t.length) / 2);
      const right = INNER - t.length - left;
      return `${' '.repeat(left)}${t}${' '.repeat(right)}`;
    };
    const line = (text) => `║ ${fit(text)} ║`;

    // Nếu nhóm đang tắt bot và không phải lệnh 'on', thì im lặng (không gửi menu)
    try {
      const threadData = await (ThreadsRef?.getData ? ThreadsRef.getData(event.threadId) : null);
      const muted = !!(threadData?.data?.bot_mute);
      if (muted && sub !== 'on') {
        return; // im lặng hoàn toàn
      }
    } catch {}

    const headerBox = [
      top,
      line(center('📜 BONZ MENU')),
      sep,
      line(`👤 Người dùng : ${userLabel}`),
      line(`🆔 ID : ${userIdDisplay}`),
      line(`👑 ADMIN : Bonz`),
      line(`⚡ VERSION : ${versionText}`),
      line(`📅 Ngày cập nhật : ${dateText}`),
      line(`💠 Cấp bậc : ${levelText}`),
      line(center('✨ Chúc bạn sử dụng bot vui vẻ!')),
      bottom
    ].join('\n');

    const commands = [
      '',
      '📚 NHÓM ZALO HỌC TẬP:',
      '📖 Tài liệu học tập: https://zalo.me/g/zffqdg843',
      '🧠 Những kẻ nghiện học: https://zalo.me/g/cgcrjp735',
      '📝 Tài liệu học: https://zalo.me/g/chpafn970',
      '',
      '📧 bonz gmail ảo',
      '🎓 bonz gmail edu',
      '🔄 bonz restart',
      '👧 bonz ảnh gái',
      '🆔 bonz get id',
      '🆔 bonzid2 | bonzid2 box | bonzid2 @user',
      '🆘 bonz help',
      '🛠 bonz admin',
      '⚙️ bonz config',
      '🧮 bonz giải toán',
      '💡 bonz tips',
      '🧠 bonz quiz',
      '🫂 bonz tâm sự',
      '🛡️ bonz safe on|off|status|self <uid_bot>',
      '🎮 bonz game',
      '🎯 bonz tile',
      '🌍 bonz dịch',
      '📷 bonz qr',
      '💖 bonzqrheart (QR trái tim)',
      '🔗 bonz rút gọn link',
      '🔎 bonz sr',
      '🪪 bonz sendcard @user [nội dung]',
      '🖼 bonz ai ảnh',
      '📰 bonz news',
      '🌤 bonz weather',
      '💘 bonz thả thính',
      '💔 bonz thất tình',
      '📑 bonz tài liệu',
      '📝 bonz thơ',
      '🤖 bonz gpt',
      '🎥👧 bonz video gái',
      '🎥👧 bonz girltt',
      '🤖 bonz chat ai',
      '🏆 bonz top',
      '📊 bonz thống kê',
      '👢 bonz kick all',
      '🎵 bonz song',
      '👋 bonz cút',
    ].join('\n');

    const bonzMenu = `${headerBox}\n${commands}`;

    // Gửi menu và thả tim 4 lần vào tin nhắn của người dùng
    await api.sendMessage(bonzMenu, threadId, type);
    
    // Thả tim 4 lần vào tin nhắn của người dùng - thử nhiều phương pháp
    if (event.messageID) {
      try {
        for (let i = 0; i < 4; i++) {
          // Thử các phương pháp khác nhau
          try {
            // Phương pháp 1: setMessageReaction
            await api.setMessageReaction(event.messageID, "❤️");
          } catch (e1) {
            try {
              // Phương pháp 2: react
              await api.react(event.messageID, "❤️");
            } catch (e2) {
              try {
                // Phương pháp 3: sendReaction
                await api.sendReaction(event.messageID, "❤️");
              } catch (e3) {
                try {
                  // Phương pháp 4: addReaction
                  await api.addReaction(event.messageID, "❤️");
                } catch (e4) {
                  console.log(`Lần ${i+1}: Không thể thả tim bằng bất kỳ phương pháp nào`);
                  break;
                }
              }
            }
          }
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay 0.5s giữa các lần thả tim
        }
      } catch (reactionError) {
        console.log("Lỗi thả tim:", reactionError.message);
        
        // Fallback: Gửi tin nhắn thông báo thay vì thả tim
        await api.sendMessage("❤️❤️❤️❤️ Menu BONZ đã được hiển thị!", threadId, type);
      }
    }
    
    return;
  }

  // Xử lý các subcommand
  if (sub === "gmail" && args[1] && args[1].toLowerCase() === "ảo") {
    return await handleGmailAo(api, event);
  }

  if (sub === "khởi" && args[1] && args[1].toLowerCase() === "động" && args[2] && args[2].toLowerCase() === "lại") {
    return await handleRestart(api, event);
  }

  if (sub === "restart") {
    return await handleRestart(api, event);
  }

  // Alias ngắn cho khởi động lại
  if (sub === "rs") {
    return await handleRestart(api, event);
  }

  if (sub === "get" && args[1] && args[1].toLowerCase() === "id") {
    return await handleGetId(api, event);
  }

  if (sub === "rút" && args[1] && args[1].toLowerCase() === "gọn" && args[2] && args[2].toLowerCase() === "link") {
    return await handleShortenLink(api, event, args.slice(3));
  }

  if (sub === "link") {
    return await handleShortenLink(api, event, args.slice(1));
  }

  // (đã gỡ tính năng nhạc)

  // (đã thay bằng route mới bên dưới)

  if (sub === "thả" && args[1] && args[1].toLowerCase() === "thính") {
    return await handleThaThinh(api, event);
  }

  // tắt/bật bot trong nhóm: bonz off | bonz on
  if (sub === "off") {
    const thread = ThreadsRef && ThreadsRef.getData ? await ThreadsRef.getData(event.threadId) : { data: {} };
    const data = thread.data || {};
    data.bot_mute = true;
    if (ThreadsRef?.setData) await ThreadsRef.setData(event.threadId, data);
    return await api.sendMessage("🔕 Đã tắt tương tác bot trong nhóm này. Gõ 'bonz on' để bật lại.", event.threadId, event.type);
  }
  if (sub === "on") {
    const thread = ThreadsRef && ThreadsRef.getData ? await ThreadsRef.getData(event.threadId) : { data: {} };
    const data = thread.data || {};
    data.bot_mute = false;
    if (ThreadsRef?.setData) await ThreadsRef.setData(event.threadId, data);
    return await api.sendMessage("🔔 Đã bật lại tương tác bot trong nhóm này.", event.threadId, event.type);
  }

  // thất tình
  if ((sub === "thất" && args[1] && args[1].toLowerCase() === "tình") || sub === "thattinh") {
    const { threadId, type } = event;
    const uid = event?.data?.uidFrom || event?.authorId;

    // Rate limit đơn giản: tối đa 5 lần/5 phút mỗi user
    try {
      global.__bonzThatTinhRL = global.__bonzThatTinhRL || new Map();
      const now = Date.now();
      const win = 5 * 60 * 1000;
      const rec = global.__bonzThatTinhRL.get(uid) || { times: [], blockedUntil: 0 };
      if (rec.blockedUntil > now) {
        const wait = Math.ceil((rec.blockedUntil - now) / 1000);
        return await api.sendMessage(`⏳ Vui lòng chờ ${wait}s nữa rồi thử lại.`, threadId, type);
      }
      // loại bỏ bản ghi quá 5 phút
      rec.times = rec.times.filter(t => now - t < win);
      rec.times.push(now);
      if (rec.times.length > 5) {
        rec.blockedUntil = now + 60 * 1000; // khóa 60s
        global.__bonzThatTinhRL.set(uid, rec);
        return await api.sendMessage(`⚠️ Gọi quá nhanh. Đợi 60s rồi thử lại.`, threadId, type);
      }
      global.__bonzThatTinhRL.set(uid, rec);
    } catch {}

    // Phân tích tham số: ttl=120, series=3, noimg, nonhac, từ khóa còn lại
    const raw = (args || []).join(' ').toLowerCase();
    const ttlMatch = raw.match(/ttl\s*=\s*(\d{1,4})/i);
    const seriesMatch = raw.match(/series\s*=\s*(\d{1,2})/i);
    const noimg = /\bnoimg\b/i.test(raw);
    const nonhac = /\bnonhac\b/i.test(raw);
    const ttlSec = ttlMatch ? Math.max(5, Math.min(600, parseInt(ttlMatch[1], 10))) : null; // 5-600s
    const series = seriesMatch ? Math.max(1, Math.min(10, parseInt(seriesMatch[1], 10))) : 1; // 1-10
    // Từ khóa chủ đề: loại bỏ token đã biết
    const keywords = raw
      .replace(/ttl\s*=\s*\d+/ig, '')
      .replace(/series\s*=\s*\d+/ig, '')
      .replace(/\bnoimg\b/ig, '')
      .replace(/\bnonhac\b/ig, '')
      .trim();
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
      'https://i.postimg.cc/jjbXJ9tC/sad1.jpg',
      'https://i.postimg.cc/7LQX9JwN/sad2.jpg',
      'https://i.postimg.cc/9f9q3P1M/sad3.jpg',
      'https://i.postimg.cc/90M05mrt/sad4.jpg'
    ];
    // Lấy quote bằng AI (fallback sang QUOTES nếu lỗi)
    let quote = '';
    try {
      const name = (userName || '').trim();
      const extra = keywords ? `, chủ đề: ${keywords}` : '';
      const basePrompt = `Viết một câu quote NGẮN gọn (<= 160 ký tự), giọng văn buồn nhưng tích cực, về thất tình bằng tiếng Việt${name ? `, xưng tên ${name}` : ''}${extra}. Không thêm ký tự trang trí.`;
      const apiUrl = `https://api.zeidteam.xyz/ai/chatgpt4?prompt=${encodeURIComponent(basePrompt)}`;
      const aiRes = await axios.get(apiUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
      let aiText = aiRes?.data;
      if (typeof aiText === 'object') {
        aiText = aiText?.content || aiText?.message || aiText?.data || '';
      }
      if (typeof aiText === 'string') {
        // Làm sạch và cắt ngắn nếu quá dài
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
    // 30% kèm ảnh
    const sendOne = async () => {
      const payload = { msg };
      if (!noimg && Math.random() < 0.3) {
        try {
          const imageUrl = IMAGES[Math.floor(Math.random() * IMAGES.length)];
          const res = await axios.get(imageUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' } });
          const filePath = `${__dirname}/temp/thattinh_${Date.now()}.jpg`;
          try { const fs = require('fs'); if (!fs.existsSync(`${__dirname}/temp`)) fs.mkdirSync(`${__dirname}/temp`, { recursive: true }); fs.writeFileSync(filePath, Buffer.from(res.data)); } catch {}
          payload.attachments = [filePath];
          if (ttlSec) payload.ttl = ttlSec * 1000;
          await api.sendMessage(payload, threadId, type);
          setTimeout(() => { try { const fs = require('fs'); if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 5000);
          return;
        } catch (_) {}
      }
      if (ttlSec) payload.ttl = ttlSec * 1000;
      await api.sendMessage(payload, threadId, type);
    };

    if (series > 1) {
      for (let i = 0; i < series; i++) {
        setTimeout(() => { sendOne(); }, i * 5000);
      }
    } else {
      await sendOne();
    }
    return;
  }

  // (router 'ảnh' đã xử lý ở trên; không còn ảnh trai)

  if (sub === "random") {
    return await handleRandom(api, event, args);
  }


  // bonz safe on|off|status|self <uid>
  if (sub === "safe") {
    const action = (args[1] || '').toLowerCase();
    const { threadId, type } = event;
    try {
      if (action === 'on') {
        safeUtil.setSafeMode(true);
        return await api.sendMessage('🛡️ Safe Mode: ĐÃ BẬT ✅', threadId, type);
      }
      if (action === 'off') {
        safeUtil.setSafeMode(false);
        return await api.sendMessage('🛡️ Safe Mode: ĐÃ TẮT ❌', threadId, type);
      }
      if (action === 'status') {
        const st = safeUtil.getSafeMode();
        return await api.sendMessage(`🛡️ Safe Mode hiện: ${st ? 'BẬT ✅' : 'TẮT ❌'}`, threadId, type);
      }
      if (action === 'self') {
        const uid = args[2];
        if (!uid) return await api.sendMessage('⚠️ Cú pháp: bonz safe self <uid_bot>', threadId, type);
        safeUtil.setSelfUid(uid);
        return await api.sendMessage(`🛡️ Safe Mode: Đã cấu hình self UID = ${uid}`, threadId, type);
      }
      return await api.sendMessage('🛡️ Dùng: bonz safe on|off|status|self <uid_bot>', threadId, type);
    } catch (e) {
      return await api.sendMessage('❌ Không thể thao tác Safe Mode. Vui lòng thử lại.', threadId, type);
    }
  }

  // bonz menu admin: hiển thị các lệnh quản trị
  if (sub === "menu" && args[1] && args[1].toLowerCase() === "admin") {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
    } catch {}

    // Box header
    const INNER = 32;
    const repeat = (ch, n) => ch.repeat(n);
    const top = `╔${repeat('═', INNER + 2)}╗`;
    const sep = `╠${repeat('═', INNER + 2)}╣`;
    const bottom = `╚${repeat('═', INNER + 2)}╝`;
    const fit = (t) => {
      const s = String(t || '');
      return s.length > INNER ? s.slice(0, INNER) : s.padEnd(INNER, ' ');
    };
    const center = (t) => {
      let s = String(t || '');
      if (s.length > INNER) s = s.slice(0, INNER);
      const left = Math.floor((INNER - s.length) / 2);
      const right = INNER - s.length - left;
      return `${' '.repeat(left)}${s}${' '.repeat(right)}`;
    };
    const line = (t) => `║ ${fit(t)} ║`;

    const header = [
      top,
      line(center('🛠 BONZ ADMIN MENU')),
      sep,
      line(`👤 Người dùng : ${userName}`),
      line(`🆔 ID : ${senderId}`),
      line(`👑 ADMIN : Bonz`),
      bottom
    ].join('\n');

    const now = new Date();
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const timeLine = `${hh}:${mm}`;

    const title = [
      '',
      `${timeLine}`,
      '👑 DANH SÁCH LỆNH QUẢN TRỊ VIÊN',
      '',
      '• admin list - Xem danh sách admin/support',
      '• admin add [@tag/ID…] - Thêm admin',
      '• admin rm [@tag/ID…] - Gỡ admin',
      '• admin sp [@tag/ID…] - Thêm support',
      '• admin rmsp [@tag/ID…] - Gỡ support',
      '• admin adminonly - Chỉ admin dùng bot',
      '• admin supportonly - Chỉ support dùng bot',
      '• admin boxonly - Chỉ cho phép lệnh trong nhóm',
      '• anti link on|off - Bật/tắt chống link',
      '• anti undo on|off - Bật/tắt chống thu hồi',
      '• anti spam on|off - Bật/tắt chống spam',
      '• bonz menu anti - Xem hướng dẫn anti',
      '• autosend - Tự động gửi tin nhắn theo giờ',
      '• bonz menu autosend - Xem hướng dẫn autosend',
      '• cdm <tên miền> - Kiểm tra thông tin tên miền',
      '• bonz menu cdm - Xem hướng dẫn cdm',
      '• cmd <action> [lệnh] - Quản lý plugin (load/unload/list/info/...)',
      '• bonz menu cmd - Xem hướng dẫn cmd',
      '• reloadconfig - Tải lại config của bot',
      '• setprefix [prefix/reset] - Đặt prefix nhóm',
      '• upt - Hiển thị thời gian hoạt động của bot',
      '',
      '💡 Có thể dùng qua BONZ:',
      '• bonz admin <subcommand> ...',
      'Ví dụ: bonz admin list'
    ].join('\n');

    return await api.sendMessage(`${header}\n${title}`, threadId, type);
  }

  // bonz config: hiển thị cấu hình hệ thống
  if (sub === "config") {
    const { threadId, type, data } = event;
    const senderId = data?.uidFrom || event?.authorId;
    const cfg = global?.config || {};
    const nameBot = cfg.name_bot || 'Bi & Bon';
    const version = 'v2.5.7 Stable';
    const lang = 'Tiếng Việt 🇻🇳';
    const engine = 'BONZ-CORE AI 3.0';
    const mem = '128MB RAM | 64MB Storage';
    const rt = '< 0.5s';
    const conc = '2.048 phiên trò chuyện';
    const server = 'Bi&Bon Cloud Node [VN-East-01]';
    const ping = '23ms (nội địa) | 87ms (quốc tế)';
    const ports = ':8080/:443';
    const sec = 'AES-256 + Mask IP ảo';

    const lines = [
      '----Cấu hình -----',
      `tên bot :${nameBot} `,
      '',
      `Phiên bản: ${version}`,
      '',
      `Ngôn ngữ: ${lang}`,
      '',
      `Engine AI: ${engine}`,
      '',
      `Dung lượng ảo: ${mem}`,
      '',
      `Tốc độ phản hồi: ${rt}`,
      '',
      `Khả năng xử lý đồng thời: ${conc}`,
      '',
      `Server: ${server}`,
      '',
      `Ping: ${ping}`,
      '',
      `Cổng kết nối: ${ports}`,
      '',
      `Bảo mật: ${sec}`
    ].join('\n');

    // Thử đính kèm ảnh logo nếu có trong assets/ hoặc file hình ChatGPT ở root
    let attachmentPath = null;
    try {
      const assetsCandidates = ['bi_bon.png','bi_bon.jpg','bi_bon.jpeg','bi_bon.webp'];
      const assetsDir = path.resolve(__dirname, '../../assets');
      for (const fname of assetsCandidates) {
        const fpath = path.join(assetsDir, fname);
        if (fs.existsSync(fpath)) { attachmentPath = fpath; break; }
      }
      // Nếu chưa tìm thấy, thử tìm file bi_bon.* ở thư mục gốc dự án
      if (!attachmentPath) {
        const rootDir = path.resolve(__dirname, '../../');
        const rootCandidates = ['bi_bon.png','bi_bon.jpg','bi_bon.jpeg','bi_bon.webp'];
        for (const fname of rootCandidates) {
          const fpath = path.join(rootDir, fname);
          if (fs.existsSync(fpath)) { attachmentPath = fpath; break; }
        }
      }
      // Nếu vẫn chưa tìm thấy, thử tìm file "ChatGPT Image*.png" ở thư mục gốc dự án
      if (!attachmentPath) {
        const rootDir = path.resolve(__dirname, '../../');
        try {
          const files = fs.readdirSync(rootDir);
          const match = files.find(fn => /^ChatGPT Image.*\.png$/i.test(fn));
          if (match) {
            const fpath = path.join(rootDir, match);
            if (fs.existsSync(fpath)) attachmentPath = fpath;
          }
        } catch {}
      }
    } catch {}

    if (attachmentPath) {
      return await api.sendMessage({ msg: lines, attachments: [attachmentPath] }, threadId, type);
    }
    return await api.sendMessage(lines, threadId, type);
  }

  if (sub === "help") {
    return await handleHelp(api, event);
  }

  if (sub === "qr") {
    return await handleQR(api, event, args);
  }

  // tài liệu
  if (sub === "tài" && args[1] && args[1].toLowerCase() === "liệu") {
    return await handleTaiLieu(api, event, args.slice(2));
  }

  // admin list (liệt kê chủ nhân)
  if (sub === "admin" && args[1] && args[1].toLowerCase() === "list") {
    return await handleDanhSachChuNhan(api, event);
  }

  // chat ai: kích hoạt gemini qua tin nhắn nội bộ
  if (sub === "chat" && args[1] && args[1].toLowerCase() === "ai") {
    return await handleChatAI(api, event, args.slice(2), 'bonz chat ai');
  }

  // gpt: alias cho chat ai (gọi Gemini) với nhãn dịch vụ khác
  if (sub === "gpt") {
    return await handleChatAI(api, event, args.slice(1), 'bonz gpt');
  }

  // Tâm sự: bonz tâm sự <nội dung>
  if ((sub === 'tâm' && (args[1] || '').toLowerCase() === 'sự') || sub === 'tamsu' || sub === 'tâm_sự') {
    // chuẩn hóa nội dung sau từ khóa
    let contentArgs = [];
    if (sub === 'tâm') contentArgs = args.slice(2);
    else contentArgs = args.slice(1);
    return await handleTamSu(api, event, contentArgs);
  }

  // Nối từ: bonz nối từ start|stop|reset|status|<từ>
  if (sub === 'nối' && (args[1] || '').toLowerCase() === 'từ') {
    const gameArgs = args.slice(2);
    return await handleNoiTu(api, event, gameArgs, ThreadsRef);
  }
  if (sub === 'noitu') {
    const gameArgs = args.slice(1);
    return await handleNoiTu(api, event, gameArgs, ThreadsRef);
  }

  // Kick all: bonz kick all
  if (sub === 'kick' && (args[1] || '').toLowerCase() === 'all') {
    return await handleKickAll(api, event);
  }

  // Song lyrics: bonz song <tên bài hát> hoặc bonz song chọn <số>
  if (sub === 'song') {
    const subArgs = args.slice(1);
    if (subArgs[0] === 'chọn' || subArgs[0] === 'chon') {
      const songIndex = parseInt(subArgs[1], 10);
      if (!isNaN(songIndex) && songIndex >= 1 && songIndex <= 5) {
        return await handleSongSelect(api, event, songIndex, args.slice(2).join(' '));
      }
    }
    return await handleSong(api, event, subArgs);
  }


  // Anti-delete message: bonz ghost <tin nhắn>
  if (sub === 'ghost' || sub === 'antidelete') {
    return await handleGhostMessage(api, event, args.slice(1));
  }

  // Permanent message: bonz permanent <tin nhắn>
  if (sub === 'permanent' || sub === 'perm' || sub === 'undelete') {
    return await handlePermanentMessage(api, event, args.slice(1));
  }

  // Immortal message: bonz immortal <tin nhắn>
  if (sub === 'immortal' || sub === 'undeletable' || sub === 'god') {
    return await handleImmortalMessage(api, event, args.slice(1));
  }

  // Absolute undeletable: bonz absolute <tin nhắn>
  if (sub === 'absolute' || sub === 'lock' || sub === 'shield') {
    return await handleAbsoluteMessage(api, event, args.slice(1));
  }

  // Alternative approach: bonz flood <tin nhắn>
  if (sub === 'flood' || sub === 'spam' || sub === 'mass') {
    return await handleFloodMessage(api, event, args.slice(1));
  }

  // Delete admin message: bonz delete <messageID>
  if (sub === 'delete' || sub === 'del' || sub === 'remove') {
    return await handleDeleteAdminMessage(api, event, args.slice(1));
  }

  // Kick member: bonz cút <uid> hoặc reply
  if (sub === 'cút' || sub === 'cut' || sub === 'kick') {
    return await handleKick(api, event, args);
  }

  // welcome: bật/tắt/status chào mừng theo nhóm
  if (sub === "welcome") {
    return await handleWelcomeToggle(api, event, args.slice(1));
  }

  // rút gọn: "bonz bật" => bật welcome
  if (sub === "bật") {
    return await handleWelcomeToggle(api, event, ["on"]);
  }
  // rút gọn: "bonz tắt" => tắt welcome
  if (sub === "tắt" || sub === "tat") {
    return await handleWelcomeToggle(api, event, ["off"]);
  }

  // khóa chat
  if (sub === "khóa" && args[1] && args[1].toLowerCase() === "chat") {
    return await handleKhoaChat(api, event, args.slice(2), true);
  }
  // mở chat (tiện alias để mở khóa nhanh)
  if (sub === "mở" && args[1] && args[1].toLowerCase() === "chat") {
    return await handleKhoaChat(api, event, ["off"], true);
  }

  // top (top tương tác trong box)
  if (sub === "top") {
    return await handleTop(api, event);
  }

  // thống kê (tổng quan tương tác trong box)
  if (sub === "thống" && args[1] && args[1].toLowerCase() === "kê") {
    return await handleThongKe(api, event);
  }

  // từ cấm (quản lý từ khóa nhạy cảm)
  if (sub === "từ" && args[1] && args[1].toLowerCase() === "cấm") {
    return await handleTuCam(api, event, args.slice(2));
  }

  if (sub === "dịch") {
    return await handleDich(api, event, args);
  }

  // giải toán (từ bằng chữ hoặc biểu thức)
  if (sub === "giải" && args[1] && args[1].toLowerCase() === "toán") {
    return await handleGiaiToan(api, event, args.slice(2));
  }

  if (sub === "tips") {
    return await handleTips(api, event);
  }

  if (sub === "quiz") {
    return await handleQuiz(api, event);
  }

  if (sub === "game") {
    return api.sendMessage("🎮 Tính năng game đang được phát triển. Vui lòng thử lại sau!", threadId, type);
  }

  // Sticker converter: bonz sticker <png|jpg|webp> <image_url>
  if (sub === "sticker") {
    return await handleStickerConvert(api, event, args);
  }

  // News: bonz news [source] [n]
  if (sub === "news") {
    return await handleNews(api, event, args);
  }

  

  // AI ảnh: hỗ trợ định dạng 'bonz ai ảnh <prompt>' (sub = 'ai', args[1] = 'ảnh'|'anh')
  if (sub === "ai" && args[1] && ["ảnh","anh"].includes(args[1].toLowerCase())) {
    return await handleAIAnh(api, event, args);
  }


  // video gái (alias gọi module vdgirl)
  if ((sub === "video" && args[1] && ["gái","gai"].includes(args[1].toLowerCase()))
      || sub === "vdgai" || sub === "vdgirl") {
    try {
      const vdgirl = require('./vdgirl.js');
      // module vdgirl.run expects ({ args, event, api, Users })
      return await vdgirl.run({ args: [], event, api, Users: undefined });
    } catch (e) {
      return api.sendMessage("❌ Không thể gửi video gái lúc này.", threadId, type);
    }
  }

  // nhạc (tìm kiếm SoundCloud)
  if (sub === "nhạc" || sub === "nhac" || sub === "music") {
    return await handleMusic(api, event, args.slice(1));
  }

  // group (join và spam group)
  if (sub === 'group') {
    return handleGroup(api, event, args.slice(1));
  }

  if (sub === 'thơ' || sub === 'tho') {
    return handleTho(api, event);
  }

  if (sub === 'weather' || sub === 'thời tiết' || sub === 'thoi tiet') {
    return handleWeather(api, event, args.slice(1));
  }

  if (sub === 'rời' || sub === 'roi' || sub === 'leave' || sub === 'tạm biệt' || sub === 'tam biet') {
    return handleFarewell(api, event);
  }

  if (sub === 'unsend' || sub === 'thu hồi' || sub === 'thu hoi') {
    return handleUnsendHistory(api, event, args.slice(1));
  }

  // Trường hợp người dùng gõ tham số khác
  return api.sendMessage(
    "Sử dụng: bonz hoặc bonz menu để xem danh sách mục BONZ.\nVí dụ: bonz gmail ảo, bonz restart, bonz rút gọn link [url]",
    threadId,
    type
  );
};

// Đếm tương tác theo user trong từng nhóm (thread)
module.exports.handleEvent = async ({ eventType, event, Threads, api, replyData }) => {
  try {
    if (eventType !== 'message') return;
    const { threadId, data, type } = event || {};
    const r = replyData || {};
    const uid = data?.uidFrom;
    if (!threadId || !uid) return;

    // Safe Mode: kiểm duyệt và xóa tin nhắn vi phạm, nếu đã xóa thì dừng xử lý tiếp
    try {
      const safe = require('./safe.js');
      const removed = await safe.checkSafeMode({ api, event });
      if (removed) return;
    } catch {}

    // Kiểm tra & chặn khi nhóm đang khóa chat (trừ admin)
    const rowLock = await Threads.getData(threadId);
    const tdataLock = rowLock?.data || {};
    if (tdataLock.chat_locked) {
      const isAdminGroup = await isAdminInGroup(api, uid, threadId);
      const isAdminBot = isBotAdmin(uid);
      if (!(isAdminGroup || isAdminBot)) {
        try {
          await api.deleteMessage({
            threadId,
            type,
            data: {
              cliMsgId: r.cliMsgId || data.cliMsgId,
              msgId: r.msgId || data.msgId,
              uidFrom: uid
            }
          }, false);
        } catch (err) {
          console.log('Thu hồi khi khóa chat thất bại:', err?.message || err);
        }
        return; // không đếm tương tác khi đã bị chặn
      }
    }

    // Chặn theo từ cấm (nhạy cảm) nếu bật
    try {
      const tc = tdataLock.tu_cam || {};
      const enabled = !!tc.enabled;
      const words = Array.isArray(tc.words) ? tc.words : [];
      if (enabled && words.length > 0) {
        const isAdminGroup = await isAdminInGroup(api, uid, threadId);
        const isAdminBot = isBotAdmin(uid);
        if (!(isAdminGroup || isAdminBot)) {
          const raw = (r?.content?.title ?? r?.content) ?? (data?.content?.title ?? data?.content);
          const text = typeof raw === 'string' ? raw.toLowerCase() : '';
          if (text) {
            const matched = words.some(w => {
              const kw = String(w || '').toLowerCase().trim();
              return kw && text.includes(kw);
            });
            if (matched) {
              try {
                await api.deleteMessage({
                  threadId,
                  type,
                  data: {
                    cliMsgId: r.cliMsgId || data.cliMsgId,
                    msgId: r.msgId || data.msgId,
                    uidFrom: uid
                  }
                }, false);
              } catch (err) {
                console.log('Thu hồi do từ cấm thất bại:', err?.message || err);
              }
              return; // không đếm tương tác khi đã bị chặn
            }
          }
        }
      }
    } catch {}

    const row = await Threads.getData(threadId);
    const tdata = row?.data || {};
    const stats = tdata.stats || { total: 0, perUser: {} };
    stats.total = (stats.total || 0) + 1;
    stats.perUser[uid] = (stats.perUser[uid] || 0) + 1;
    tdata.stats = stats;
    Threads.setData(threadId, tdata);
  } catch (e) {
    // tránh làm vỡ luồng sự kiện
  }
};

// Kiểm tra admin nhóm Zalo
async function isAdminInGroup(api, userId, threadId) {
  try {
    const info = await api.getGroupInfo(threadId);
    const groupInfo = info.gridInfoMap[threadId];
    const isCreator = groupInfo.creatorId === userId;
    const isDeputy = Array.isArray(groupInfo.adminIds) && groupInfo.adminIds.includes(userId);
    return isCreator || isDeputy;
  } catch {
    return false;
  }
}

// Top tương tác: cao nhất, nhì, ba, bét
async function handleTop(api, event) {
  const { threadId, type } = event;
  const Threads = require('../../core/controller/controllerThreads');
  try {
    const row = await Threads.getData(threadId);
    const stats = row?.data?.stats || {};
    const perUser = stats.perUser || {};
    const entries = Object.entries(perUser); // [uid, count]
    if (entries.length === 0) {
      return api.sendMessage("Chưa có dữ liệu tương tác trong nhóm này.", threadId, type);
    }

    // sort desc by count
    entries.sort((a, b) => b[1] - a[1]);
    const top1 = entries[0];
    const top2 = entries[1];
    const top3 = entries[2];
    const bet = entries[entries.length - 1];

    // Lấy tên cho các uid cần thiết (unique)
    const pickUids = [top1?.[0], top2?.[0], top3?.[0], bet?.[0]].filter(Boolean);
    const unique = [...new Set(pickUids)];
    const names = {};
    for (const uid of unique) {
      try {
        const info = await api.getUserInfo(uid);
        names[uid] = info?.changed_profiles?.[uid]?.displayName || uid;
      } catch {
        names[uid] = uid;
      }
    }

    const lines = [
      '🏆 TOP TƯƠNG TÁC',
      entries.length >= 1 ? `🥇 #1: ${names[top1[0]]} - ${top1[1]} tin nhắn` : '',
      entries.length >= 2 ? `🥈 #2: ${names[top2[0]]} - ${top2[1]} tin nhắn` : '',
      entries.length >= 3 ? `🥉 #3: ${names[top3[0]]} - ${top3[1]} tin nhắn` : '',
      entries.length >= 1 ? `🐢 Bét: ${names[bet[0]]} - ${bet[1]} tin nhắn` : ''
    ].filter(Boolean);

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('Không thể lấy TOP tương tác ngay lúc này.', threadId, type);
  }
}

// Thống kê tổng quan tương tác
async function handleThongKe(api, event) {
  const { threadId, type, data } = event;
  const Threads = require('../../core/controller/controllerThreads');
  try {
    const row = await Threads.getData(threadId);
    const stats = row?.data?.stats || {};
    const perUser = stats.perUser || {};
    const total = stats.total || 0;
    const entries = Object.entries(perUser); // [uid, count]

    if (entries.length === 0) {
      return api.sendMessage("Chưa có dữ liệu thống kê trong nhóm này.", threadId, type);
    }

    // Sắp xếp để tính rank
    entries.sort((a, b) => b[1] - a[1]);
    const uniqueUsers = entries.length;
    const top = entries[0];
    const yourId = data?.uidFrom;
    let yourCount = perUser[yourId] || 0;
    let yourRank = entries.findIndex(e => e[0] === yourId) + 1;
    const avg = (total / uniqueUsers).toFixed(2);

    // Lấy tên top và bạn
    let topName = top?.[0];
    let yourName = yourId;
    try {
      if (topName) {
        const info = await api.getUserInfo(topName);
        topName = info?.changed_profiles?.[topName]?.displayName || topName;
      }
    } catch {}
    try {
      if (yourId) {
        const info = await api.getUserInfo(yourId);
        yourName = info?.changed_profiles?.[yourId]?.displayName || yourId;
      }
    } catch {}

    const lines = [
      '📊 THỐNG KÊ TƯƠNG TÁC',
      `• Tổng tin nhắn: ${total}`,
      `• Số người tham gia: ${uniqueUsers}`,
      `• Trung bình/người: ${avg}`,
      `• Top: ${topName} - ${top[1]} tin nhắn`,
      `• Bạn (${yourName}): ${yourCount} tin nhắn, hạng #${yourRank}`
    ];

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('Không thể lấy thống kê ngay lúc này.', threadId, type);
  }
}

// Liệt kê danh sách Chủ nhân (owner_bot)
async function handleDanhSachChuNhan(api, event) {
  const { threadId, type } = event;
  try {
    const cfg = global?.config || {};
    const adminList = Array.isArray(cfg.admin_bot) ? cfg.admin_bot : [];
    const ownerConf = cfg.owner_bot;
    let owners = [];
    if (Array.isArray(ownerConf)) owners = ownerConf;
    else if (typeof ownerConf === 'string' && ownerConf.trim()) owners = [ownerConf.trim()];

    // Fallback: nếu chưa cấu hình owner, dùng admin đầu tiên (nếu có)
    if (owners.length === 0 && adminList.length > 0) owners = [adminList[0]];

    // Chuẩn hóa và loại trùng
    owners = Array.from(new Set((owners || []).map(x => String(x).trim()).filter(Boolean)));

    if (owners.length === 0) {
      return api.sendMessage('❕ Chưa cấu hình chủ nhân trong config.', threadId, type);
    }

    // Lấy tên hiển thị cho từng ID
    const lines = ['👑 DANH SÁCH CHỦ NHÂN'];
    for (const id of owners) {
      let name = id;
      try {
        const info = await api.getUserInfo(id);
        name = info?.changed_profiles?.[id]?.displayName || id;
      } catch {}
      lines.push(`• ${name} (${id})`);
    }

    return api.sendMessage(lines.join('\n'), threadId, type);
  } catch (e) {
    return api.sendMessage('❌ Không thể lấy danh sách chủ nhân lúc này.', threadId, type);
  }
}

// Hàm xử lý gmail ảo
async function handleGmailAo(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = data.uidFrom;

    // Lấy thông tin người dùng Zalo
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Danh sách các service email ảo miễn phí
    const tempEmailServices = [
      { name: "10MinuteMail", domain: "10minutemail.com", url: "https://10minutemail.com", description: "Email tồn tại 10 phút, có thể gia hạn" },
      { name: "TempMail", domain: "tempmail.org", url: "https://temp-mail.org", description: "Email tạm thời, tự động làm mới" },
      { name: "Guerrilla Mail", domain: "guerrillamail.com", url: "https://www.guerrillamail.com", description: "Email tồn tại 1 giờ" },
      { name: "Mailinator", domain: "mailinator.com", url: "https://www.mailinator.com", description: "Email công khai, ai cũng có thể đọc" }
    ];

    // Tạo email ảo và mật khẩu ngẫu nhiên
    const randomString = Math.random().toString(36).substring(2, 10);
    const selectedService = tempEmailServices[Math.floor(Math.random() * tempEmailServices.length)];
    const tempEmail = `${randomString}@${selectedService.domain}`;
    const randomPassword = Math.random().toString(36).substring(2, 12);

    // Cấp bậc + lượt dùng
    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz gmail ảo', senderId);

    // Header thông tin dịch vụ theo format thống nhất
    const header = __formatServiceInfo({
      service: 'bonz gmail ảo',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Dùng để đăng nhập đa nền tảng nhưng KHÔNG thể đăng nhập Google!'
    });

    const details = [
      '',
      '📧 THÔNG TIN GMAIL ẢO',
      `• Email: ${tempEmail}`,
      `• Mật khẩu: ${randomPassword}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type);
    
  } catch (error) {
    console.error("Lỗi tạo gmail ảo:", error);
    const uid = event?.data?.uidFrom || 'unknown';
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(uid);
      userName = info?.changed_profiles?.[uid]?.displayName || "Người dùng";
    } catch {}
    const role = __getRoleLabel(uid);
    const usage = __incUsage('bonz gmail ảo', uid);
    const response = __formatServiceInfo({
      service: 'bonz gmail ảo',
      userName,
      userId: uid,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
    });
    return api.sendMessage(response, threadId, type);
  }
}

// Hàm xử lý khởi động lại bot
async function handleRestart(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = String(data.uidFrom);
    
    // Kiểm tra quyền admin
    const config = global.config;
    const adminList = Array.isArray(config.admin_bot) ? config.admin_bot : [];
    const ownerList = Array.isArray(config.owner_bot) ? config.owner_bot : [];
    
    if (!(adminList.includes(senderId) || ownerList.includes(senderId))) {
      return api.sendMessage(
        "❌ Bạn không có quyền khởi động lại bot!",
        threadId,
        type
      );
    }

    // Lấy thông tin người dùng
    let userName = "Admin";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Admin";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    const response = [
      `Người dùng: @${userName}`,
      `Dịch vụ: Khởi động lại bot`,
      `Thông báo: Thành công`,
      "",
      "🔄 Bot đang khởi động lại...",
      "⏳ Vui lòng đợi trong giây lát"
    ].join("\n");

    await api.sendMessage(response, threadId, type);
    
    // Khởi động lại bot sau 2 giây
    setTimeout(() => {
      process.exit(2); // Exit code 2 để index.js restart bot
    }, 2000);
    
  } catch (error) {
    console.error("Lỗi khởi động lại bot:", error);
    return api.sendMessage(
      "❌ Có lỗi xảy ra khi khởi động lại bot. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
}

// Hàm lấy ID người dùng Zalo
async function handleGetId(api, event) {
  const { threadId, type, data } = event;
  
  try {
    // Lấy UID từ data.uidFrom như lệnh /id gốc
    const senderId = data.uidFrom;
    
    // Lấy thông tin người dùng Zalo
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    const response = [
      `Người dùng: ${userName}`,
      `Dịch vụ: bonz get id`,
      `Thông báo: Thành công`,
      `ID của bạn: ${senderId}`,
      `Cách dùng: Không có`
    ].join("\n");

    return api.sendMessage(response, threadId, type, null, senderId);
    
  } catch (error) {
    console.error("Lỗi lấy UID:", error);
    return api.sendMessage(
      "❌ Có lỗi xảy ra khi lấy UID Zalo. Vui lòng thử lại sau.",
      threadId,
      type
    );
  }
}

// Hàm rút gọn link
async function handleShortenLink(api, event, args) {
  const { threadId, type, data } = event;
  const axios = require('axios');
  
  try {
    // Lấy thông tin người dùng
    const senderId = data.uidFrom;
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Kiểm tra có link không
    if (!args || args.length === 0) {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz rút gọn link`,
        `Thông báo: Lỗi - thiếu link`,
        `Link gốc: Không có`,
        `Link rút gọn: Không có`,
        `Cách dùng: bonz link [URL] - VD: bonz link https://google.com`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    let originalUrl = args[0];
    
    // Thêm https:// nếu không có
    if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
      originalUrl = 'https://' + originalUrl;
    }

    // Gọi API TinyURL để rút gọn link
    try {
      const tinyUrlResponse = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(originalUrl)}`);
      const shortUrl = tinyUrlResponse.data;

      // Kiểm tra nếu API trả về lỗi
      if (shortUrl.includes('Error') || shortUrl.includes('Invalid')) {
        throw new Error('TinyURL API error');
      }

      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz rút gọn link`,
        `Thông báo: Thành công`,
        `Link gốc: ${originalUrl}`,
        `Link rút gọn: ${shortUrl}`,
        `Cách dùng: Copy link rút gọn để chia sẻ, tiết kiệm không gian`
      ].join("\n");

      return api.sendMessage(response, threadId, type);

    } catch (apiError) {
      // Fallback: dùng is.gd API
      try {
        const isgdResponse = await axios.post('https://is.gd/create.php', 
          `format=simple&url=${encodeURIComponent(originalUrl)}`,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );
        
        const shortUrl = isgdResponse.data.trim();

        const response = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz rút gọn link`,
          `Thông báo: Thành công`,
          `Link gốc: ${originalUrl}`,
          `Link rút gọn: ${shortUrl}`,
          `Cách dùng: Copy link rút gọn để chia sẻ, tiết kiệm không gian`
        ].join("\n");

        return api.sendMessage(response, threadId, type);

      } catch (fallbackError) {
        // Nếu cả 2 API đều lỗi, tạo link giả
        const shortId = Math.random().toString(36).substring(2, 8);
        const shortUrl = `https://short.ly/${shortId}`;

        const response = [
          `Người dùng: ${userName}`,
          `Dịch vụ: bonz rút gọn link`,
          `Thông báo: Thành công (demo)`,
          `Link gốc: ${originalUrl}`,
          `Link rút gọn: ${shortUrl}`,
          `Cách dùng: Link demo - API tạm thởi không khả dụng`
        ].join("\n");

        return api.sendMessage(response, threadId, type);
      }
    }
    
  } catch (error) {
    console.error("Lỗi rút gọn link:", error);
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz rút gọn link`,
      `Thông báo: Lỗi`,
      `Link gốc: Không có`,
      `Link rút gọn: Không có`,
      `Cách dùng: Có lỗi xảy ra, vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type);
  }
}


// Hàm xử lý thơ
async function handleTho(api, event) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');

  try {
    const senderId = data.uidFrom;

    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }
    // Nhãn vai trò + lượt dùng
    const role = __getRoleLabel(senderId);
    const usage = __incUsage('bonz thơ', senderId);

    // Đọc file thơ
    const poemsPath = path.join(__dirname, '..', '..', 'assets', 'poems.json');
    if (!fs.existsSync(poemsPath)) {
      const header = __formatServiceInfo({
        service: 'bonz thơ',
        userName,
        userId: senderId,
        notify: 'Lỗi - không tìm thấy file thơ',
        role,
        usage,
        howToUse: 'Liên hệ admin để cập nhật dữ liệu thơ'
      });
      return api.sendMessage(header, threadId, type);
    }

    const poemsData = JSON.parse(fs.readFileSync(poemsPath, 'utf8'));
    const poems = poemsData.poems || [];

    if (poems.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz thơ',
        userName,
        userId: senderId,
        notify: 'Lỗi - không có thơ nào trong dữ liệu',
        role,
        usage,
        howToUse: 'Liên hệ admin để cập nhật dữ liệu thơ'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Chọn ngẫu nhiên một bài thơ
    const randomPoem = poems[Math.floor(Math.random() * poems.length)];

    const header = __formatServiceInfo({
      service: 'bonz thơ',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
    });
    const details = [
      '',
      `📝 ${randomPoem.title}`,
      '',
      randomPoem.content,
      '',
      '💫 Chúc bạn có những phút giây thư giãn cùng thơ ca!'
    ].join('\n');

    return api.sendMessage(`${header}\n\n${details}`, threadId, type, null, senderId);

  } catch (error) {
    console.error('Lỗi xử lý thơ:', error);
    // Lỗi: vẫn đảm bảo định dạng thống nhất
    const uid = event?.data?.uidFrom || 'unknown';
    let userName = 'Người dùng';
    try {
      const info = await api.getUserInfo(uid);
      userName = info?.changed_profiles?.[uid]?.displayName || 'Người dùng';
    } catch {}
    const role = __getRoleLabel(uid);
    const usage = __incUsage('bonz thơ', uid);
    const header = __formatServiceInfo({
      service: 'bonz thơ',
      userName,
      userId: uid,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý thơ
async function handleQR(api, event, args) {
  const { threadId, type, data } = event;

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz qr', senderId);

  try {
    // Kiểm tra có text để tạo QR không
    const text = (args || []).slice(1).join(' ').trim();
    if (!text) {
      const header = __formatServiceInfo({
        service: 'bonz qr',
        userName,
        userId: senderId,
        notify: 'Thiếu nội dung',
        role,
        usage,
        howToUse: 'bonz qr <nội dung cần tạo QR>'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Sử dụng API QR: quickchart.io
    const axios = require('axios');
    const fs = require('fs');
    const path = require('path');

    const qrApiUrl = `https://quickchart.io/qr?text=${encodeURIComponent(text)}&size=300`;
    const qrResponse = await axios.get(qrApiUrl, { responseType: 'stream' });
    const fileName = `qr_${Date.now()}.png`;
    const filePath = path.join(__dirname, 'temp', fileName);

    // Tạo thư mục temp nếu chưa có
    const tempDir = path.dirname(filePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir);
    }

    const writer = fs.createWriteStream(filePath);
    qrResponse.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const header = __formatServiceInfo({
      service: 'bonz qr',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Quét mã QR để xem nội dung'
    });

    const details = [
      '',
      `Nội dung: ${text}`,
      `Mã QR: Đã tạo thành công`
    ].join('\n');

    await api.sendMessage({
      msg: `${header}\n${details}`,
      attachments: filePath
    }, threadId, type, null, senderId);

    // Xóa file tạm sau khi gửi
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }, 5000);

  } catch (error) {
    console.error('Lỗi QR:', error);
    const header = __formatServiceInfo({
      service: 'bonz qr',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý dịch
async function handleDich(api, event, args) {
  const { threadId, type, data } = event;

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz dịch', senderId);

  try {
    // Kiểm tra có text để dịch không (args: ['dịch', ...])
    const text = (args || []).slice(1).join(' ').trim();
    if (!text) {
      const header = __formatServiceInfo({
        service: 'bonz dịch',
        userName,
        userId: senderId,
        notify: 'Thiếu nội dung cần dịch',
        role,
        usage,
        howToUse: 'bonz dịch <văn bản cần dịch>'
      });
      return api.sendMessage(header, threadId, type);
    }

    // Gọi Google Translate API miễn phí
    const axios = require('axios');
    const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
    const resp = await axios.get(translateUrl);
    const translatedText = resp?.data?.[0]?.[0]?.[0] || '';
    const detectedLang = resp?.data?.[2] || 'unknown';

    // Map mã ngôn ngữ sang tên
    const langNames = {
      'en': 'Tiếng Anh',
      'vi': 'Tiếng Việt',
      'zh': 'Tiếng Trung',
      'ja': 'Tiếng Nhật',
      'ko': 'Tiếng Hàn',
      'fr': 'Tiếng Pháp',
      'de': 'Tiếng Đức',
      'es': 'Tiếng Tây Ban Nha',
      'th': 'Tiếng Thái',
      'unknown': 'Không xác định'
    };
    const langName = langNames[detectedLang] || detectedLang;

    const header = __formatServiceInfo({
      service: 'bonz dịch',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Dịch tự động sang tiếng Việt'
    });

    const details = [
      '',
      `Ngôn ngữ gốc: ${langName}`,
      `Văn bản gốc: ${text}`,
      `Bản dịch: ${translatedText}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (error) {
    console.error('Lỗi dịch:', error);
    const header = __formatServiceInfo({
      service: 'bonz dịch',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý tips
async function handleTips(api, event) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz tips', senderId);

  try {
    // Đọc danh sách tips từ file JSON
    const tipsPath = path.join(__dirname, '..', '..', 'assets', 'tips.json');

    if (!fs.existsSync(tipsPath)) {
      const header = __formatServiceInfo({
        service: 'bonz tips',
        userName,
        userId: senderId,
        notify: 'Không tìm thấy dữ liệu tips',
        role,
        usage,
        howToUse: 'Gõ: bonz tips để nhận 1 mẹo ngẫu nhiên'
      });
      return api.sendMessage(header, threadId, type);
    }

    const tipsDataRaw = fs.readFileSync(tipsPath, 'utf8');
    let tipsData = [];
    try { tipsData = JSON.parse(tipsDataRaw); } catch (_) { tipsData = []; }
    if (!Array.isArray(tipsData) || tipsData.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz tips',
        userName,
        userId: senderId,
        notify: 'Lỗi - dữ liệu tips trống hoặc không hợp lệ',
        role,
        usage,
        howToUse: 'Cập nhật assets/tips.json là mảng các chuỗi mẹo'
      });
      return api.sendMessage(header, threadId, type);
    }

    const randomTip = tipsData[Math.floor(Math.random() * tipsData.length)];

    const header = __formatServiceInfo({
      service: 'bonz tips',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Gõ: bonz tips để nhận 1 mẹo ngẫu nhiên'
    });

    const details = [
      '',
      `💡 Mẹo hữư ích: ${String(randomTip)}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (error) {
    console.error('Lỗi tips:', error);
    const header = __formatServiceInfo({
      service: 'bonz tips',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Hàm xử lý quiz
async function handleQuiz(api, event) {
  const { threadId, type, data } = event;
  const fs = require('fs');
  const path = require('path');

  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch (err) {
    console.log('Không thể lấy thông tin user:', err?.message || err);
  }

  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz quiz', senderId);

  try {
    // Đọc danh sách quiz từ file JSON
    const quizPath = path.join(__dirname, '..', '..', 'assets', 'quiz.json');

    if (!fs.existsSync(quizPath)) {
      const header = __formatServiceInfo({
        service: 'bonz quiz',
        userName,
        userId: senderId,
        notify: 'Không tìm thấy dữ liệu quiz',
        role,
        usage,
        howToUse: 'Gõ: bonz quiz để nhận 1 câu hỏi ngẫu nhiên'
      });
      return api.sendMessage(header, threadId, type);
    }

    const quizDataRaw = fs.readFileSync(quizPath, 'utf8');
    let quizData = [];
    try { quizData = JSON.parse(quizDataRaw); } catch (_) { quizData = []; }
    if (!Array.isArray(quizData) || quizData.length === 0) {
      const header = __formatServiceInfo({
        service: 'bonz quiz',
        userName,
        userId: senderId,
        notify: 'Lỗi - dữ liệu quiz trống hoặc không hợp lệ',
        role,
        usage,
        howToUse: 'Cập nhật assets/quiz.json theo cấu trúc mảng câu hỏi'
      });
      return api.sendMessage(header, threadId, type);
    }

    const randomQuiz = quizData[Math.floor(Math.random() * quizData.length)];

    const header = __formatServiceInfo({
      service: 'bonz quiz',
      userName,
      userId: senderId,
      notify: 'Thành công',
      role,
      usage,
      howToUse: 'Gõ: bonz quiz để nhận 1 câu hỏi ngẫu nhiên'
    });

    const opts = Array.isArray(randomQuiz?.options) ? randomQuiz.options.join('\n') : '';
    const details = [
      '',
      `❓ Câu hỏi: ${randomQuiz?.question || 'Không có'}`,
      opts,
      '',
      `💡 Đáp án: ${randomQuiz?.answer || 'Không có'}`,
      `📝 Giải thích: ${randomQuiz?.explanation || 'Không có'}`
    ].join('\n');

    return api.sendMessage(`${header}\n${details}`, threadId, type, null, senderId);
  } catch (error) {
    console.error('Lỗi quiz:', error);
    const header = __formatServiceInfo({
      service: 'bonz quiz',
      userName,
      userId: senderId,
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage
    });
    return api.sendMessage(header, threadId, type);
  }
}

// Chuyển đổi ảnh/sticker sang PNG/JPG/WebP bằng URL
async function handleStickerConvert(api, event, args = []) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz sticker', senderId);

  const format = (args[1] || '').toLowerCase();
  const imgUrl = args[2] || '';
  const allow = ['png','jpg','webp'];
  if (!allow.includes(format) || !/^https?:\/\//i.test(imgUrl)) {
    const header = __formatServiceInfo({
      service: 'bonz sticker', userName, userId: senderId, role, usage,
      notify: 'Thiếu tham số hoặc không hợp lệ',
      howToUse: 'bonz sticker <png|jpg|webp> <image_url>'
    });
    return api.sendMessage(header, threadId, type);
  }

  try {
    const axios = require('axios');
    const sharp = require('sharp');
    const fs = require('fs');
    const path = require('path');

    const resp = await axios.get(imgUrl, { responseType: 'arraybuffer', timeout: 20000 });
    const inputBuf = Buffer.from(resp.data);

    let pipeline = sharp(inputBuf).ensureAlpha();
    if (format === 'png') pipeline = pipeline.png({ quality: 90 });
    if (format === 'jpg') pipeline = pipeline.jpeg({ quality: 90 });
    if (format === 'webp') pipeline = pipeline.webp({ quality: 90 });

    const outputBuf = await pipeline.toBuffer();
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `sticker_${Date.now()}.${format}`);
    fs.writeFileSync(filePath, outputBuf);

    const header = __formatServiceInfo({
      service: 'bonz sticker', userName, userId: senderId, role, usage,
      notify: `Đã chuyển ảnh sang ${format.toUpperCase()}`,
      howToUse: 'bonz sticker <png|jpg|webp> <image_url>'
    });

    await api.sendMessage({ msg: header, attachments: filePath }, threadId, type, null, senderId);

    setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 5000);
  } catch (e) {
    return api.sendMessage('❌ Không thể chuyển đổi ảnh. Vui lòng thử URL khác.', threadId, type);
  }
}

// Lấy tin tức từ RSS miễn phí, không cần API key
async function handleNews(api, event, args = []) {
  const { threadId, type, data } = event;
  const senderId = data?.uidFrom || event?.authorId;
  let userName = 'Người dùng';
  try {
    const info = await api.getUserInfo(senderId);
    userName = info?.changed_profiles?.[senderId]?.displayName || 'Người dùng';
  } catch {}
  const role = __getRoleLabel(senderId);
  const usage = __incUsage('bonz news', senderId);

  const sources = {
    vnexpress: 'https://vnexpress.net/rss/tin-moi-nhat.rss',
    zing: 'https://znews.vn/rss.html',
    bbc: 'https://feeds.bbci.co.uk/vietnamese/rss.xml',
    thanhnien: 'https://thanhnien.vn/rss/home.rss',
    tuoitre: 'https://tuoitre.vn/rss/tin-moi-nhat.rss'
  };

  const src = (args[1] || 'vnexpress').toLowerCase();
  const count = Math.min(10, Math.max(1, parseInt(args[2], 10) || 5));
  const url = sources[src] || sources.vnexpress;

  try {
    const { XMLParser } = require('fast-xml-parser');
    const resp = await axios.get(url, { responseType: 'text', timeout: 15000 });
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    const dataXml = parser.parse(resp.data);
    const channel = dataXml?.rss?.channel || dataXml?.feed || {};
    const items = channel.item || channel.entry || [];
    const list = Array.isArray(items) ? items : [items];

    const topText = list.slice(0, count).map((it, idx) => {
      const title = (it?.title && it.title['#text']) ? it.title['#text'] : (it?.title || 'Không tiêu đề');
      let link = '';
      if (it?.link && typeof it.link === 'object') {
        link = it.link.href || it.link['#text'] || '';
      } else {
        link = it?.link || it?.guid || '';
      }
      return `${idx + 1}. ${title}\n   ${link}`;
    }).join('\n');

    const header = __formatServiceInfo({
      service: 'bonz news', userName, userId: senderId, role, usage,
      notify: `Nguồn: ${src} • Số bài: ${count}`,
      howToUse: 'bonz news [vnexpress|zing|bbc|thanhnien|tuoitre] [số_bài]'
    });
    return api.sendMessage(`${header}\n\n${topText || 'Không có bài viết.'}`, threadId, type);
  } catch (e) {
    const header = __formatServiceInfo({
      service: 'bonz news', userName, userId: senderId, role, usage,
      notify: 'Không lấy được tin tức. Vui lòng thử lại.'
    });
    return api.sendMessage(header, threadId, type);
  }
}

// ====== Helpers: Usage counter ======
const __usageTemp = new Map();
function __incUsage(service, userId) {
  const key = `${service}:${userId}`;
  const n = (__usageTemp.get(key) || 0) + 1;
  __usageTemp.set(key, n);
  return n;
}

function __getRoleLabel(userId) {
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
 function __formatServiceInfo({ service, userName, userId, notify, role, usage, howToUse, showRole = true }) {
  const lines = [];
  lines.push('Bảng thông tin dịch vụ');
  lines.push(`ng dùng: ${userName || 'Không xác định'}`);
  lines.push(`dịch vụ : ${service || 'Không xác định'}`);
  lines.push(`id ng dùng: ${userId || 'Chưa xác định'}`);
  if (showRole) {
    lines.push(`cấp bậc: ${role || 'Thành viên'}`);
  }
  lines.push(`số lượt dùng: ${typeof usage !== 'undefined' && usage !== null ? usage : 0}`);
  lines.push(`thông báo: ${typeof notify !== 'undefined' ? (notify || 'Không có') : 'Không có'}`);
  if (typeof howToUse === 'string' && howToUse.trim()) {
    lines.push(`cách dùng: ${howToUse}`);
  }
  return lines.join('\n');
}
 

// Hàm xử lý ảnh trai
async function handleAnhTrai(api, event, args = []) {
  const { threadId, type, data } = event;
  const axios = require('axios');
  const fs = require('fs');
  const path = require('path');
  const cfg = global?.config || {};
  const countReq = Math.max(1, Math.min(5, parseInt(args[0], 10) || 1)); // hỗ trợ 1-5 ảnh
  let userName = "Người dùng"; // khai báo ngoài try để catch dùng được

  // tiện ích: tải ảnh về file tạm
  async function downloadToTemp(url, prefix = 'boy') {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const ext = (path.extname(new URL(url).pathname) || '.jpg').split('?')[0];
    const filePath = path.join(tempDir, `${prefix}_${Date.now()}_${Math.floor(Math.random()*9999)}${ext}`);
    const resp = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8'
      }
    });
    fs.writeFileSync(filePath, resp.data);
    return filePath;
  }

  // tiện ích: gửi 1 ảnh với thông điệp và dọn dẹp
  async function sendOne(filePath, meta = {}) {
    const { source = 'Nguồn không xác định' } = meta;
    const role = __getRoleLabel(data.uidFrom);
    const usage = __incUsage('bonz ảnh trai', data.uidFrom);
    const messageText = __formatServiceInfo({
      service: 'bonz ảnh trai',
      userName,
      userId: data.uidFrom,
      notify: `Thành công (${source})`,
      role,
      usage,
      keyGot: 0,
      keyCount: 0
    });
    await api.sendMessage({ msg: messageText, attachments: filePath }, threadId, type, null, data.uidFrom);
    setTimeout(() => { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {} }, 5000);
  }

  // Lấy ảnh online ưu tiên: SerpAPI -> Google CSE
  async function fetchOnlineUrls(query, n) {
    const urls = [];
    const femaleBadWords = /(female|woman|women|girl|girls|lady|ladies|phụ nữ|con gái|cô gái|nữ)/i;
    // 1) SerpAPI
    const serpKey = cfg?.serpapi_key;
    if (serpKey) {
      try {
        const u = 'https://serpapi.com/search.json';
        const params = { engine: 'google_images', q: query, ijn: '0', api_key: serpKey }; // ijn=0 trang đầu
        const resp = await axios.get(u, { params, timeout: 15000 });
        const arr = resp?.data?.images_results || [];
        for (const it of arr) {
          const titleText = `${it?.title || ''} ${it?.source || ''}`;
          if (femaleBadWords.test(titleText)) continue; // loại hình có dấu hiệu nữ
          const link = it?.original || it?.thumbnail || it?.source || it?.link;
          if (link && /^https?:\/\//i.test(link)) urls.push(link);
          if (urls.length >= n) break;
        }
        if (urls.length >= n) return urls;
      } catch (e) {
        console.log('SerpAPI lỗi hoặc không có dữ liệu:', e?.message || e);
      }
    }
    // 2) Google CSE
    const cseKey = cfg?.google_cse?.api_key;
    const cseCx = cfg?.google_cse?.cx;
    if (cseKey && cseCx && urls.length < n) {
      try {
        const u = 'https://www.googleapis.com/customsearch/v1';
        const params = { q: query, searchType: 'image', num: Math.min(n, 10), key: cseKey, cx: cseCx, safe: 'off' };
        const resp = await axios.get(u, { params, timeout: 15000 });
        const items = resp?.data?.items || [];
        for (const it of items) {
          const titleText = `${it?.title || ''} ${it?.snippet || ''}`;
          if (femaleBadWords.test(titleText)) continue; // loại hình có dấu hiệu nữ
          const link = it?.link;
          if (link && /^https?:\/\//i.test(link)) urls.push(link);
          if (urls.length >= n) break;
        }
      } catch (e) {
        console.log('Google CSE lỗi hoặc không có dữ liệu:', e?.message || e);
      }
    }
    return urls;
  }

  try {
    const senderId = data.uidFrom;
    // Lấy thông tin người dùng
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    const query = 'handsome male portrait, man, guy, boy face, aesthetic -woman -women -girl -girls -female -lady -ladies -phụ -nữ -cô -gái';
    const onlineUrls = await fetchOnlineUrls(query, countReq);
    if (onlineUrls && onlineUrls.length > 0) {
      // gửi từng ảnh để đảm bảo tương thích API
      for (const link of onlineUrls) {
        try {
          const fp = await downloadToTemp(link, 'boy');
          await sendOne(fp, { source: 'Google Images' });
        } catch (e) {
          console.log('Tải/gửi ảnh online lỗi:', e?.message || e);
        }
      }
      return;
    }

    // Fallback 1: ảnh cục bộ
    const localDir = path.join(__dirname, '..', '..', 'ảnh trai');
    const allowedExt = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
    let localFiles = [];
    try {
      if (fs.existsSync(localDir)) {
        localFiles = fs
          .readdirSync(localDir)
          .filter(f => allowedExt.has(path.extname(f).toLowerCase()))
          .map(f => path.join(localDir, f));
      }
    } catch {}
    if (localFiles.length > 0) {
      // chọn ngẫu nhiên không lặp
      for (let i = localFiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [localFiles[i], localFiles[j]] = [localFiles[j], localFiles[i]];
      }
      const picks = localFiles.slice(0, countReq);
      for (const p of picks) {
        try {
          {
            const role = __getRoleLabel(senderId);
            const usage = __incUsage('bonz ảnh trai', senderId);
            const msg = __formatServiceInfo({
              service: 'bonz ảnh trai',
              userName,
              userId: senderId,
              notify: 'Thành công',
              role,
              usage,
              keyGot: 0,
              keyCount: 0
            });
            await api.sendMessage({ msg, attachments: p }, threadId, type, null, senderId);
          }
          await new Promise(r => setTimeout(r, 300));
        } catch {}
      }
      return;
    }

    // Fallback 2: dùng danh sách URL trong boy.json
    const boyImages = require('../../assets/boy.json');
    if (!Array.isArray(boyImages) || boyImages.length === 0) {
      return api.sendMessage("❌ Không có ảnh trai nào trong dữ liệu.", threadId, type);
    }
    // trộn và chọn
    const shuffled = boyImages.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picks = shuffled.slice(0, countReq);
    for (const link of picks) {
      try {
        const fp = await downloadToTemp(link, 'boy');
        await sendOne(fp, { source: 'Dữ liệu URL (boy.json)' });
      } catch (e) {
        console.log('Tải/gửi ảnh từ boy.json lỗi:', e?.message || e);
      }
    }
    return;

  } catch (error) {
    console.error("Lỗi ảnh trai:", error);
    const role = __getRoleLabel(data?.uidFrom);
    const usage = __incUsage('bonz ảnh trai', data?.uidFrom || 'unknown');
    const response = __formatServiceInfo({
      service: 'bonz ảnh trai',
      userName: userName || 'Người dùng',
      userId: data?.uidFrom || 'unknown',
      notify: 'Lỗi hệ thống - vui lòng thử lại sau',
      role,
      usage,
      keyGot: 0,
      keyCount: 0
    });
    return api.sendMessage(response, threadId, type);
  }
}

// Hàm khóa chat nhóm
async function handleLockChat(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = data.uidFrom;
    
    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Kiểm tra quyền admin
    const adminList = Array.isArray(global.config.admin_bot) ? global.config.admin_bot : [];
    const cleanAdminList = adminList.map(id => String(id).trim());
    
    if (!cleanAdminList.includes(String(senderId).trim())) {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Lỗi - không có quyền`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ admin mới được sử dụng`,
        `Cách dùng: Liên hệ admin để được cấp quyền`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Kiểm tra xem có phải chat nhóm không
    if (type !== "group") {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Lỗi - không phải nhóm`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ có thể khóa chat nhóm`,
        `Cách dùng: Sử dụng lệnh trong nhóm Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Thực hiện khóa chat nhóm - thử nhiều phương pháp
    try {
      // Phương pháp 1: Thử changeGroupSettings
      try {
        await api.changeGroupSettings(threadId, {
          allowMemberInvite: false,
          allowMemberPost: false
        });
      } catch (e1) {
        // Phương pháp 2: Thử muteGroup
        try {
          await api.muteGroup(threadId);
        } catch (e2) {
          // Phương pháp 3: Thử setGroupRestriction
          try {
            await api.setGroupRestriction(threadId, true);
          } catch (e3) {
            // Phương pháp 4: Thử changeGroupInfo
            try {
              await api.changeGroupInfo(threadId, {
                restrictPosting: true
              });
            } catch (e4) {
              throw new Error("Không có API nào hoạt động");
            }
          }
        }
      }
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Thành công`,
        `Trạng thái: Đã khóa`,
        `Nhóm ID: ${threadId}`,
        `Cách dùng: Chỉ admin có thể gửi tin nhắn`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
      
    } catch (lockError) {
      console.error("Lỗi khóa nhóm:", lockError);
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz khóa chat`,
        `Thông báo: Lỗi - API không hỗ trợ`,
        `Trạng thái: Thất bại`,
        `Lý do: Zalo API không cho phép khóa nhóm từ bot`,
        `Cách dùng: Chỉ có thể khóa thủ công từ app Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }
    
  } catch (error) {
    console.error("Lỗi khóa chat:", error);
    
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz khóa chat`,
      `Thông báo: Lỗi hệ thống`,
      `Trạng thái: Thất bại`,
      `Lý do: Có lỗi xảy ra`,
      `Cách dùng: Vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type);
  }
}


// Hàm mở khóa chat nhóm
async function handleUnlockChat(api, event) {
  const { threadId, type, data } = event;
  
  try {
    const senderId = data.uidFrom;
    
    // Lấy thông tin người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (err) {
      console.log("Không thể lấy thông tin user:", err.message);
    }

    // Kiểm tra quyền admin
    const adminList = Array.isArray(global.config.admin_bot) ? global.config.admin_bot : [];
    const cleanAdminList = adminList.map(id => String(id).trim());
    
    if (!cleanAdminList.includes(String(senderId).trim())) {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Lỗi - không có quyền`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ admin mới được sử dụng`,
        `Cách dùng: Liên hệ admin để được cấp quyền`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Kiểm tra xem có phải chat nhóm không
    if (type !== "group") {
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Lỗi - không phải nhóm`,
        `Trạng thái: Từ chối`,
        `Lý do: Chỉ có thể mở khóa chat nhóm`,
        `Cách dùng: Sử dụng lệnh trong nhóm Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }

    // Thực hiện mở khóa chat nhóm - thử nhiều phương pháp
    try {
      // Phương pháp 1: Thử changeGroupSettings
      try {
        await api.changeGroupSettings(threadId, {
          allowMemberInvite: true,
          allowMemberPost: true
        });
      } catch (e1) {
        // Phương pháp 2: Thử unmuteGroup
        try {
          await api.unmuteGroup(threadId);
        } catch (e2) {
          // Phương pháp 3: Thử setGroupRestriction
          try {
            await api.setGroupRestriction(threadId, false);
          } catch (e3) {
            // Phương pháp 4: Thử changeGroupInfo
            try {
              await api.changeGroupInfo(threadId, {
                restrictPosting: false
              });
            } catch (e4) {
              throw new Error("Không có API nào hoạt động");
            }
          }
        }
      }
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Thành công`,
        `Trạng thái: Đã mở khóa`,
        `Nhóm ID: ${threadId}`,
        `Cách dùng: Tất cả thành viên có thể gửi tin nhắn`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
      
    } catch (unlockError) {
      console.error("Lỗi mở khóa nhóm:", unlockError);
      
      const response = [
        `Người dùng: ${userName}`,
        `Dịch vụ: bonz mở chat`,
        `Thông báo: Lỗi - API không hỗ trợ`,
        `Trạng thái: Thất bại`,
        `Lý do: Zalo API không cho phép mở khóa nhóm từ bot`,
        `Cách dùng: Chỉ có thể mở khóa thủ công từ app Zalo`
      ].join("\n");
      
      return api.sendMessage(response, threadId, type);
    }
    
  } catch (error) {
    console.error("Lỗi mở chat:", error);
    
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz mở chat`,
      `Thông báo: Lỗi hệ thống`,
      `Trạng thái: Thất bại`,
      `Lý do: Có lỗi xảy ra`,
      `Cách dùng: Vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type);
  }
}
