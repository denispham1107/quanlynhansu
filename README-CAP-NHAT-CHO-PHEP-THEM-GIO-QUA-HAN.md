# Cập nhật: Cho phép thêm giờ cho công việc quá hạn

## Chức năng mới
Trong **Cài đặt Phiếu công việc** có thêm tùy chọn:

- **Cho phép Thêm giờ cho cả công việc quá hạn**

Khi bật:
- Tài khoản quản lý có quyền **Thêm giờ công việc** có thể mở và xác nhận thêm giờ cho công việc đã quá hạn.
- Nếu hạn mới sau khi cộng giờ nằm trong tương lai, trạng thái công việc được chuyển từ `overdue` về `doing` như logic hiện có.
- Nếu số phút cộng chưa đủ đưa hạn mới về tương lai, công việc vẫn giữ trạng thái quá hạn và có thể tiếp tục thêm giờ nếu chưa hết giới hạn được cấu hình.

Khi tắt:
- Giữ nguyên hành vi cũ.
- Công việc quá hạn bị chặn với thông báo: **Quá hạn thời gian không thể thêm giờ**.

## Các file thay đổi
- `index.html`
- `app.js`
- `functions/index.js`

## Triển khai
Cần deploy lại Cloud Function lưu Cài đặt:

```powershell
firebase.cmd deploy --only functions:saveWorkOrderControlSettings --project quanlynhansu-6e63b
```

Không cần deploy lại Firestore Rules hoặc Storage Rules.
