# Cập nhật trạng thái Ship

- Công việc được chọn loại `Ship` sẽ lưu cờ `isShip: true`.
- Khi công việc Ship đang chạy, nhãn hiển thị là `Đang ship`.
- Bộ lọc trạng thái có thêm `Đang ship`.
- Trong nhóm `Đã hoàn thành`, bộ lọc phụ có thêm `Đã ship`.
- Công việc Ship hoàn thành được nhận diện bằng cờ `isShip`, không thay đổi cấu trúc trạng thái nghiệp vụ nền nhằm giữ nguyên các luồng đếm ngược, hoàn thành, duyệt và quá hạn hiện có.
