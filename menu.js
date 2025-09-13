const moment = require("moment-timezone");
const stringSimilarity = require('string-similarity');

module.exports.config = {
    name: "menu",
    aliases: ['help'],
    version: "1.0.0",
    role: 0,
    author: "July",
    description: "Xem danh sách lệnh và info",
    category: "Tiện ích",
    usage: "[tên lệnh/all]",
    cooldowns: 2,
    dependencies: {
        "string-similarity": "",
        "moment-timezone": ""
    }
};

function getDayVN() {
    const days = {
        'Sunday': 'Chủ Nhật',
        'Monday': 'Thứ Hai',
        'Tuesday': 'Thứ Ba',
        'Wednesday': 'Thứ Tư',
        'Thursday': 'Thứ Năm',
        'Friday': 'Thứ Sáu',
        'Saturday': 'Thứ Bảy'
    };
    const thu = moment.tz('Asia/Ho_Chi_Minh').format('dddd');
    return days[thu] || thu;
}

function TextPr(permission) {
    return permission == 0 ? "Thành Viên" : permission == 1 ? "Support Bot" : permission == 2 ? "Admin Bot" : "Toàn Quyền";
}

function sortByLengthDesc(arr, key) {
    return arr.sort((a, b) => b[key].length - a[key].length);
}

module.exports.run = async function({ api, event, args, Threads }) {
    const { threadId, type, data } = event;
    const senderId = data.uidFrom;
    const cmds = global.client.commands;
    // Fix: safely get threadData
    const TIDdata = (global.data && global.data.threadData && global.data.threadData.get)
        ? global.data.threadData.get(threadId) || {}
        : {};
    const config = global.config;
    const admin = Array.isArray(config.admin_bot) ? config.admin_bot : [];
    const NameBot = config.name_bot;
    const version = config.version;
    const prefix = (typeof TIDdata.PREFIX === "string" && TIDdata.PREFIX.length > 0)
        ? TIDdata.PREFIX
        : config.PREFIX;
    const argType = args[0] ? args[0].toLowerCase() : "";
    let msg = `👋 Chào mừng tới ${NameBot}!\n`;

    // Custom menu khi không truyền tham số: hiển thị theo mẫu yêu cầu của user
    if (!argType) {
        const threadData = await Threads.getData(event.threadId);
        const threadInfo = threadData?.data || {};
        const currentPrefix = threadInfo.prefix ? threadInfo.prefix : global.config.prefix;
        const uid = senderId;
        let displayName = 'Bạn';
        try {
            const info = await api.getUserInfo(uid);
            displayName = info?.changed_profiles?.[uid]?.displayName || displayName;
        } catch {}

        const roleLabel = (Array.isArray(admin) && admin.includes(uid)) ? 'Quản trị' : 'Thành viên';
        const versionLabel = '1.1.0';
        const today = moment.tz('Asia/Ho_Chi_Minh').format('D/M/YYYY');

        const headerBox = [
            '╔══════════════════════════════════╗',
            '║           📜 BONZ MENU           ║',
            '╠══════════════════════════════════╣',
            `║ 👤 Người dùng : ${displayName.padEnd(18, ' ')}║`,
            `║ 🆔 ID : ${String(uid).padEnd(22, ' ')}║`,
            '║ 👑 ADMIN : Bonz                  ║',
            `║ ⚡ VERSION : ${versionLabel.padEnd(16, ' ')}║`,
            `║ 📅 Ngày cập nhật : ${today.padEnd(12, ' ')}     ║`,
            `║ 💠 Cấp bậc : ${roleLabel.padEnd(16, ' ')}     ║`,
            '║  ✨ Chúc bạn sử dụng bot vui vẻ!  ║',
            '╚══════════════════════════════════╝',
            ''
        ].join('\n');

        const body = [
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
            '📅 bonz lịch',
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
            '👋 bonz cút'
        ].join('\n');

        return api.sendMessage(`${headerBox}\n${body}`, threadId, type);
    }

    // Show all commands
    if (argType === "all") {
        const commandsList = Array.from(cmds.values()).map((cmd, idx) =>
            `${idx + 1}. ${cmd.config.name}\n📝 Mô tả: ${cmd.config.description}\n`
        ).join('\n');
        return api.sendMessage(commandsList, threadId, type);
    }

    // Show specific command info or fuzzy search
    if (argType) {
        let command = Array.from(cmds.values()).find(cmd => cmd.config.name.toLowerCase() === argType);
        if (!command) {
            const commandNames = Array.from(cmds.keys());
            const checker = stringSimilarity.findBestMatch(argType, commandNames);
            if (checker.bestMatch.rating >= 0.5) {
                command = cmds.get(checker.bestMatch.target);
                msg = `⚠️ Không tìm thấy lệnh '${argType}' trong hệ thống.\n📌 Lệnh gần giống được tìm thấy '${checker.bestMatch.target}'\n`;
            } else {
                msg = `⚠️ Không tìm thấy lệnh '${argType}' trong hệ thống.`;
                return api.sendMessage(msg, threadId, type);
            }
        }
        const cmd = command.config;
        msg += `[ HƯỚNG DẪN SỬ DỤNG ]\n\n📜 Tên lệnh: ${cmd.name}\n🕹️ Phiên bản: ${cmd.version}\n🔑 Quyền Hạn: ${TextPr(cmd.role)}\n👥 Tác giả: ${cmd.author}\n📝 Mô Tả: ${cmd.description}\n🏘️ Nhóm: ${cmd.category}\n📌 Cách Dùng: ${cmd.usage}\n⏳ Cooldowns: ${cmd.cooldowns}s`;
        return api.sendMessage(msg, threadId, type);
    }

    // Show grouped commands by category
    const commandsArray = Array.from(cmds.values()).map(cmd => cmd.config);
    const grouped = [];
    commandsArray.forEach(cmd => {
        const { category, name } = cmd;
        let group = grouped.find(g => g.cmdCategory === category);
        if (!group) {
            grouped.push({ cmdCategory: category, nameModule: [name] });
        } else {
            group.nameModule.push(name);
        }
    });
    sortByLengthDesc(grouped, "nameModule");
    grouped.forEach(cmd => {
        // Fix: check cmd.cmdCategory before using toUpperCase
        if (
            cmd.cmdCategory &&
            ['NO PREFIX'].includes(cmd.cmdCategory.toUpperCase()) &&
            !admin.includes(senderId)
        ) return;
        msg += `[ ${cmd.cmdCategory ? cmd.cmdCategory.toUpperCase() : "KHÁC"} ]\n📝 Tổng lệnh: ${cmd.nameModule.length} lệnh\n${cmd.nameModule.join(", ")}\n\n`;
    });
    // Thêm mục BONZ vào menu chính
    msg += `[ BONZ ]\n📝 Tùy chọn: 6\nbonz sms, bonz video, bonz sách, bonz tâm sự, bonz girltt, bonz thất tình\n\n`;
    const threadData = await Threads.getData(event.threadId);
    const threadInfo = threadData?.data || {};
    const currentPrefix = threadInfo.prefix ? threadInfo.prefix : global.config.prefix;
    msg += `📝 Tổng số lệnh: ${cmds.size} lệnh\n👤 Tổng số admin bot: ${admin.length}\n👾 Tên Bot: ${NameBot}\n⏰ Hôm nay là: ${getDayVN()}\n⏱️ Thời gian: ${moment.tz("Asia/Ho_Chi_Minh").format("HH:mm:ss | DD/MM/YYYY")}\n${currentPrefix}help + tên lệnh để xem chi tiết\n${currentPrefix}help + all để xem tất cả lệnh`;
    return api.sendMessage(msg, threadId, type);
}