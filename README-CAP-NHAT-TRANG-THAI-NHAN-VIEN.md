# Cập nhật trạng thái nhân viên

## Chức năng mới
- Nhân viên có 2 trạng thái: `Đang làm` và `Đang Off`.
- Admin bấm vào dòng nhân viên trong trang Danh sách nhân viên để mở popup đổi trạng thái.
- Tài khoản cũ chưa có trạng thái được mặc định là `Đang làm`.
- Nhân viên `Đang Off` không xuất hiện trong các danh sách giao việc hoặc đổi nhân viên.
- Phiếu đã giao trước đó vẫn được giữ nguyên.
- Trang tài khoản nhân viên hiển thị trạng thái realtime.
- Khu vực tổng quan trạng thái có thêm ô `Đang Off`; người Đang Off không bị tính trùng vào Chưa có việc/Đã có việc/Hotel/Nghỉ trưa.
- Mỗi lần thay đổi được lưu lịch sử trong hồ sơ user.

## File thay đổi
- `app.js`
- `index.html`

## Firebase
- Không đổi Cloud Functions.
- Không đổi Firestore Rules vì rules hiện tại đã cho phép Admin cập nhật hồ sơ user.
- Không đổi Storage Rules.
