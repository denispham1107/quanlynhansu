# Cập nhật: Khóa chỉnh số Ảnh báo cáo sau khi giao Phiếu

## Chức năng mới

Trong **Cài đặt Phiếu công việc** có thêm lựa chọn:

- **Không cho chỉnh số Ảnh báo cáo**.

Khi bật:

- Phiếu chưa giao (`draft`) vẫn được thiết lập số ảnh báo cáo bắt buộc.
- Sau khi Phiếu được bấm **Giao việc**, nút **Chỉnh số ảnh** bị ẩn.
- Trường hợp **Chờ chọn người** cũng bị khóa vì Phiếu đã được giao.
- Firestore Rules từ chối thay đổi các field yêu cầu ảnh của task đã giao.

Khi tắt, hành vi chỉnh số ảnh giữ nguyên như trước.

## Các file thay đổi

- `index.html`
- `app.js`
- `functions/index.js`
- `firestore.rules`
- `sw.js`

## Triển khai

```powershell
firebase.cmd deploy --only functions:saveWorkOrderControlSettings,firestore:rules --project quanlynhansu-6e63b
```
