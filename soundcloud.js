// Hàm xử lý tìm kiếm nhạc SoundCloud
async function handleMusic(api, event, args = []) {
  const { threadId, type } = event;
  const senderId = event?.data?.uidFrom || event?.authorId;
  const Threads = require('../../core/controller/controllerThreads');
  const soundcloud = require('./soundcloud.js');

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
    return api.sendMessage('🎵 Sử dụng: bonz nhạc <tên bài hát>\nVí dụ: bonz nhạc despacito', threadId, type);
  }
  
  const query = args.join(' ');
  
  try {
    // Lấy tên người dùng
    let userName = "Người dùng";
    try {
      const info = await api.getUserInfo(senderId);
      userName = info?.changed_profiles?.[senderId]?.displayName || "Người dùng";
    } catch (_) {}
    
    await api.sendMessage(`🔍 Đang tìm kiếm "${query}" trên SoundCloud...`, threadId, type);
    const songs = await soundcloud.searchSongs(query);
    
    if (songs.length === 0) {
      return api.sendMessage('❌ Không tìm thấy bài hát nào. Thử từ khóa khác.', threadId, type);
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
      const messagePayload = {
        msg: [
          `🎵 Kết quả tìm kiếm cho: ${query}`,
          `👤 Người dùng: ${userName}`,
          `📊 Tìm thấy ${songs.length} bài hát`,
          ``,
          `💡 Để tải nhạc, reply số thứ tự (1-${Math.min(songs.length, 5)})`,
          `💡 Để tải: reply số (1-${Math.min(songs.length, 5)}) hoặc gõ: bonz nhạc chọn <số>`,
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
      let resultText = `🎵 Kết quả tìm kiếm cho: ${query}\n👤 Người dùng: ${userName}\n\n`;
      songs.slice(0, 5).forEach((song, index) => {
        resultText += `${index + 1}. ${song.title}\n👤 ${song.username}\n▶️ ${song.playCount} | ❤️ ${song.likeCount}\n\n`;
      });
      resultText += `💡 Để tải: reply số (1-${Math.min(songs.length, 5)}) hoặc gõ: bonz nhạc chọn <số>`;
      
      await api.sendMessage(resultText, threadId, type);
    }
    
  } catch (error) {
    console.error('Lỗi tìm kiếm nhạc:', error.message);
    await api.sendMessage('❌ Có lỗi xảy ra khi tìm kiếm nhạc. Vui lòng thử lại.', threadId, type);
  }
} 