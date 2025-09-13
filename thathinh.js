module.exports.config = {
  name: "thathinh",
  aliases: ["thinh"],
  version: "1.0.0",
  role: 0,
  author: "Cascade",
  description: "Thả thính với câu nói ngọt ngào",
  category: "Giải trí",
  usage: "thathinh",
  cooldowns: 3
}

module.exports.run = async ({ api, event, args }) => {
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

    // Danh sách câu thính vô hạn
    const thinhLines = [
      "Anh có thể làm GPS của em được không? Vì anh luôn dẫn đường cho trái tim em đi đúng hướng 💕",
      "Em có phải là WiFi không? Vì anh muốn kết nối với em suốt đời 📶",
      "Anh có thể mượn một nụ hôn không? Anh hứa sẽ trả lại em 😘",
      "Em có tin vào tình yêu sét đánh không? Hay em muốn anh quay lại lần nữa? ⚡",
      "Anh nghĩ em bị cận thị, vì em không thể nhìn thấy tương lai của chúng ta 👓",
      "Em có phải là Google không? Vì em có tất cả những gì anh đang tìm kiếm 🔍",
      "Anh có thể chụp ảnh em không? Để anh có thể chứng minh với bạn bè rằng thiên thần có thật 📸",
      "Em có phải là ma thuật không? Vì mỗi khi nhìn em, mọi người khác đều biến mất 🪄",
      "Anh có thể theo em về nhà không? Vì bố mẹ anh bảo anh phải theo đuổi ước mơ 🏠",
      "Em có phải là thời tiết không? Vì em làm anh nóng lên từng ngày 🌡️",
      "Anh có thể mượn bản đồ không? Vì anh bị lạc trong đôi mắt em rồi 🗺️",
      "Em có phải là ngân hàng không? Vì em có tất cả sự quan tâm của anh 🏦",
      "Anh nghĩ em là một tên trộm, vì em đã đánh cắp trái tim anh 💔",
      "Em có phải là cà phê không? Vì em làm anh tỉnh táo suốt đêm ☕",
      "Anh có thể là người giao hàng không? Vì anh muốn giao trái tim mình cho em 📦",
      "Em có phải là bài hát không? Vì anh không thể ngừng nghĩ về em 🎵",
      "Anh có thể làm nhiếp ảnh gia không? Vì anh muốn chụp mọi khoảnh khắc với em 📷",
      "Em có phải là mặt trời không? Vì em làm sáng cả thế giới của anh ☀️",
      "Anh có thể mượn cây bút không? Để viết tên em vào trái tim anh ✏️",
      "Em có phải là sách không? Vì anh muốn đọc em suốt đời 📚",
      "Anh có thể làm bác sĩ không? Vì trái tim anh đập nhanh mỗi khi gặp em 💓",
      "Em có phải là kem không? Vì em ngọt ngào và làm anh tan chảy 🍦",
      "Anh có thể làm thầy giáo không? Vì anh muốn dạy em cách yêu 👨‍🏫",
      "Em có phải là điện thoại không? Vì anh muốn cầm em suốt ngày 📱",
      "Anh có thể làm phi công không? Vì anh muốn bay cùng em đến tận cùng thế giới ✈️",
      "Em có phải là chocolate không? Vì em ngọt ngào và gây nghiện 🍫",
      "Anh có thể làm nhạc sĩ không? Vì anh muốn sáng tác bài hát về em 🎼",
      "Em có phải là mưa không? Vì em làm anh muốn ở nhà cả ngày 🌧️",
      "Anh có thể làm đầu bếp không? Vì anh muốn nấu ăn cho em cả đời 👨‍🍳",
      "Em có phải là ngôi sao không? Vì em sáng nhất trong đêm tối của anh ⭐",
      "Anh có thể làm kỹ sư không? Vì anh muốn xây dựng tương lai với em 👷",
      "Em có phải là hoa không? Vì em thơm và đẹp nhất trong vườn của anh 🌸",
      "Anh có thể làm tài xế không? Vì anh muốn chở em đi khắp nơi 🚗",
      "Em có phải là kim cương không? Vì em quý giá và lấp lánh nhất 💎",
      "Anh có thể làm thơ không? Vì anh muốn viết về em cả đời 📝",
      "Em có phải là mật ong không? Vì em ngọt ngào và quý hiếm 🍯",
      "Anh có thể làm thám tử không? Vì anh muốn khám phá trái tim em 🔍",
      "Em có phải là ánh sáng không? Vì em xua tan bóng tối trong lòng anh 💡",
      "Anh có thể làm họa sĩ không? Vì anh muốn vẽ em trong từng giấc mơ 🎨",
      "Em có phải là thuốc không? Vì em chữa lành mọi nỗi đau của anh 💊"
    ];

    // Chọn câu thính ngẫu nhiên
    const randomThinh = thinhLines[Math.floor(Math.random() * thinhLines.length)];

    const response = [
      `Người dùng: ${userName}`,
      `Dịch vụ: bonz thả thính`,
      `Thông báo: Thành công`,
      `Câu thính: ${randomThinh}`,
      `Cách dùng: Sử dụng để tán gái/trai, thả thính crush`
    ].join("\n");

    return api.sendMessage(response, threadId, type, null, senderId);
    
  } catch (error) {
    console.error("Lỗi thả thính:", error);
    
    const response = [
      `Người dùng: ${userName || "Người dùng"}`,
      `Dịch vụ: bonz thả thính`,
      `Thông báo: Lỗi hệ thống`,
      `Câu thính: Không có`,
      `Cách dùng: Có lỗi xảy ra, vui lòng thử lại sau`
    ].join("\n");
    
    return api.sendMessage(response, threadId, type, null, data.uidFrom);
  }
};
