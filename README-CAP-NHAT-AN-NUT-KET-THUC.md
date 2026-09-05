# Cập nhật: Ẩn nút Kết thúc trong Phiếu công việc

## Chức năng mới

Trong **Cài đặt Phiếu công việc** có thêm lựa chọn:

- **Không cho xuất hiện nút Kết thúc trong phiếu công việc**.

Khi bật:

- Nút **Kết thúc** không được render trong các thẻ công việc của Admin/Giám sát.
- Nếu giao diện cũ vẫn còn nút trên màn hình, hàm xử lý cũng từ chối thao tác.
- Nút **Hoàn thành** của nhân viên và **Xác nhận hoàn thành** của quản lý không bị ảnh hưởng.
- Cơ chế tự kết thúc Phiếu nghỉ trưa khi giao việc mới vẫn hoạt động.

Khi tắt, nút **Kết thúc** hiển thị lại theo quyền và trạng thái công việc như trước.

## Các file thay đổi

- `index.html`
- `app.js`
- `functions/index.js`
- `sw.js`

## Triển khai

```powershell
firebase.cmd deploy --only functions:saveWorkOrderControlSettings --project quanlynhansu-6e63b
```
