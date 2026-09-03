# Cập nhật giao diện và thống kê nhân viên Ship

- Desktop hiển thị đủ 6 ô trạng thái trên cùng một hàng, cùng kích thước.
- Ô Đang Off không còn rơi xuống hàng dưới.
- Nhân viên có công việc Đang ship được tính là Đã được giao việc.
- Vì vậy họ không còn xuất hiện trong ô Chưa được giao việc trong thời gian đang ship.
- Ô Đang ship vẫn hiển thị riêng để theo dõi chuyên biệt.
- Không thay đổi cấu trúc Firestore, Rules hoặc Cloud Functions.
