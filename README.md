# SONORA

Một vũ trụ nghe nhạc cá nhân lấy cảm hứng từ Spotify, chạy hoàn toàn cục bộ bằng HTML, CSS và JavaScript thuần. Không cần cài dependency, không cần build.

## Chạy ứng dụng

```bash
cd sonora
npm start
```

Hoặc nhấp đúp `start.bat` trên Windows. Sau đó mở [http://localhost:4173](http://localhost:4173).

> Cần chạy qua máy chủ cục bộ để YouTube IFrame API, metadata proxy và lời bài hát LRCLIB hoạt động.

## Tính năng chính

- Giao diện tối cao cấp, responsive, có vinyl quay, phổ nhạc sống động, cinema mode và bảng "Đang phát".
- Thêm nhạc từ YouTube / YouTube Music, Spotify, SoundCloud, Suno, Bandcamp, Audiomack, Vimeo, tệp MP3/MP4 trực tiếp hoặc liên kết bất kỳ.
- Kéo thả tệp âm thanh, video từ máy. Tệp chỉ tồn tại trong phiên nghe hiện tại và không được tải lên máy chủ.
- Lời đồng bộ LRC: lời mẫu có sẵn, tự động tra LRCLIB, dán LRC thủ công và chỉnh lệch ±0,5 giây.
- Hàng đợi, phát tiếp theo, trộn bài, ba chế độ lặp, điều khiển âm lượng, tốc độ phát và hẹn giờ ngủ.
- Quản lý playlist, yêu thích, radio theo cảm xúc, tìm kiếm nhanh bằng `Ctrl + K`, phím tắt và menu ngữ cảnh.
- Dữ liệu được lưu bằng `localStorage`; có thể xuất bản sao lưu JSON hoặc đặt lại toàn bộ.

## Cấu trúc

```
sonora/
├─ index.html
├─ server.js          # máy chủ tĩnh + proxy metadata/LRCLIB
├─ start.bat
├─ css/styles.css
├─ js/
│  ├─ app.js          # bộ điều khiển giao diện
│  ├─ data.js         # danh mục demo, mood, nền tảng
│  ├─ store.js        # trạng thái, hàng đợi, playlist
│  ├─ media.js        # audio/video/YouTube/embed
│  ├─ lyrics.js       # LRC, LRCLIB
│  ├─ views.js        # các trang
│  ├─ components.js   # component dùng lại
│  └─ utils.js
└─ assets/            # 6 bản nhạc và bìa demo nguyên bản
```

## Ghi chú

- Âm thanh và ảnh bìa demo trong `assets/` là nội dung gốc được tạo cho dự án.
- Spotify thường chỉ cung cấp đoạn nghe thử 30 giây; khi không có preview, SONORA dùng trình nhúng chính thức.
- Một số nền tảng chặn iframe hoặc yêu cầu đăng nhập. Khi đó bài hát vẫn được lưu kèm nút mở nguồn gốc.
- Nếu cổng `4173` bận, đặt biến môi trường `PORT`, ví dụ: `set PORT=5000 && npm start`.
