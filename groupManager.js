const fs = require('fs').promises;
const path = require('path');

// Đường dẫn file cấu hình
const OT_FILE = path.join(__dirname, '..', '..', 'assets', 'ot.txt');
const STICKER_FILE = path.join(__dirname, '..', '..', 'assets', 'sticker.json');

/**
 * Join group từ link Zalo
 */
async function joinGroup(api, groupUrl) {
    try {
        if (!groupUrl.startsWith('https://zalo.me/')) {
            return { success: false, message: 'Link không hợp lệ! Phải bắt đầu bằng https://zalo.me/' };
        }

        // Trích xuất group ID từ URL
        const groupIdMatch = groupUrl.match(/https:\/\/zalo\.me\/g\/([a-zA-Z0-9]+)/);
        if (!groupIdMatch) {
            return { success: false, message: 'Không thể trích xuất Group ID từ link' };
        }
        
        const groupId = groupIdMatch[1];
        
        try {
            // Thử lấy thông tin group trước
            const groupInfo = await api.getThreadInfo(groupId);
            if (groupInfo && groupInfo.threadID) {
                return { 
                    success: true, 
                    groupId: groupInfo.threadID, 
                    message: 'Đã có trong group',
                    groupInfo: groupInfo
                };
            }
        } catch (_) {
            // Nếu không lấy được info, có thể chưa join
        }
        
        // Thử join group bằng cách gửi tin nhắn vào group ID
        try {
            await api.sendMessage('', groupId, 'GROUP');
            return { 
                success: true, 
                groupId: groupId, 
                message: 'Join group thành công'
            };
        } catch (joinError) {
            return { success: false, message: 'Không thể tham gia nhóm' };
        }
        
    } catch (error) {
        console.error('Lỗi join group:', error);
        return { success: false, message: `Lỗi: ${error.message}` };
    }
}

/**
 * Lấy danh sách tin nhắn từ file ot.txt
 */
async function getRandomMessage() {
    try {
        const content = await fs.readFile(OT_FILE, 'utf-8');
        const messages = content.split('\n').filter(line => line.trim());
        
        if (messages.length === 0) {
            return 'Xin chào mọi người! 👋';
        }
        
        return messages[Math.floor(Math.random() * messages.length)];
    } catch (error) {
        console.log('Không đọc được file ot.txt, dùng tin nhắn mặc định');
        return 'Xin chào mọi người! 👋';
    }
}

/**
 * Lấy sticker ngẫu nhiên từ file sticker.json
 */
async function getRandomSticker() {
    try {
        const content = await fs.readFile(STICKER_FILE, 'utf-8');
        const stickers = JSON.parse(content);
        
        if (!Array.isArray(stickers) || stickers.length === 0) {
            return null;
        }
        
        return stickers[Math.floor(Math.random() * stickers.length)];
    } catch (error) {
        console.log('Không đọc được file sticker.json');
        return null;
    }
}

/**
 * Lấy danh sách thành viên nhóm để tạo mentions
 */
async function getGroupMembers(api, groupId) {
    try {
        const groupInfo = await api.getThreadInfo(groupId);
        
        if (!groupInfo || !groupInfo.participantIDs) {
            return [];
        }
        
        return groupInfo.participantIDs;
    } catch (error) {
        console.error('Lỗi lấy danh sách thành viên:', error);
        return [];
    }
}

/**
 * Gửi tin nhắn với mentions tất cả thành viên
 */
async function sendMessageWithMentions(api, groupId, message, memberIds) {
    try {
        if (!memberIds || memberIds.length === 0) {
            // Gửi tin nhắn thường nếu không có members
            await api.sendMessage(message, groupId, 'GROUP');
            return true;
        }
        
        // Gửi tin nhắn đơn giản với @all hoặc chỉ tin nhắn thường
        const finalMessage = message + '\n@all';
        await api.sendMessage(finalMessage, groupId, 'GROUP');
        
        return true;
    } catch (error) {
        console.error('Lỗi gửi tin nhắn:', error);
        // Fallback: gửi tin nhắn thường
        try {
            await api.sendMessage(message, groupId, 'GROUP');
            return true;
        } catch (_) {
            return false;
        }
    }
}

/**
 * Gửi sticker
 */
async function sendSticker(api, groupId, sticker) {
    try {
        if (!sticker) return false;
        
        // Sử dụng API sendSticker của ZCA-JS
        await api.sendSticker(
            sticker.stickerType,
            sticker.stickerId, 
            sticker.cateId,
            groupId,
            'GROUP'
        );
        
        return true;
    } catch (error) {
        console.error('Lỗi gửi sticker:', error);
        return false;
    }
}

/**
 * Spam tin nhắn và sticker vào group
 */
async function spamGroup(api, groupId, spamCount, progressCallback) {
    try {
        const members = await getGroupMembers(api, groupId);
        let successCount = 0;
        
        for (let i = 0; i < spamCount; i++) {
            try {
                // Gửi tin nhắn với mentions
                const message = await getRandomMessage();
                const messageSent = await sendMessageWithMentions(api, groupId, message, members);
                
                if (messageSent) {
                    // Gửi sticker
                    const sticker = await getRandomSticker();
                    await sendSticker(api, groupId, sticker);
                    
                    successCount++;
                }
                
                // Callback để báo tiến độ
                if (progressCallback) {
                    progressCallback(i + 1, spamCount, successCount);
                }
                
                // Delay để tránh spam quá nhanh
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                console.error(`Lỗi spam lần ${i + 1}:`, error);
                // Tiếp tục với lần tiếp theo
            }
        }
        
        return { success: true, successCount, totalCount: spamCount };
    } catch (error) {
        console.error('Lỗi spam group:', error);
        return { success: false, message: error.message };
    }
}

module.exports = {
    joinGroup,
    spamGroup,
    getRandomMessage,
    getRandomSticker,
    getGroupMembers
};

// Thêm metadata để tránh báo "không hợp lệ" khi loader quét commands
module.exports.config = {
  name: '_group_manager_helper',
  aliases: [],
  version: '1.0.0',
  role: 2,
  author: 'Cascade',
  description: 'Helper quản lý nhóm (không phải lệnh cho người dùng).',
  category: 'Hệ thống',
  usage: '',
  cooldowns: 0,
  dependencies: {}
};

// No-op run để tương thích giao diện lệnh
module.exports.run = async () => { return; };
