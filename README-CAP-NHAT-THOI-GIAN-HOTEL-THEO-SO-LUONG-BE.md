# Cập nhật thời gian Hotel theo số lượng bé

- Khi chọn `Hotel` trong form tạo Phiếu, Admin phải nhập `Số lượng bé` ở lần tạo đầu tiên của ngày.
- Tổng thời gian Hotel trong ngày được tính chính xác theo công thức `Số lượng bé × 4 phút 30 giây`.
- Từ Phiếu Hotel tiếp theo trong cùng ngày, số lượng bé được khóa và thời gian Phiếu tự lấy bằng tổng thời gian còn lại sau khi trừ thời gian thực tế của các Phiếu Hotel đã hoàn thành.
- Số giờ, số phút và chức năng `Thêm giờ` của Phiếu Hotel đều bị khóa.
- Mỗi thẻ Hotel hiển thị số lượng bé và thời gian Hotel còn lại trong ngày.
- Khi một Phiếu Hotel hoàn thành quá thời gian được cấp, Cloud Function tự tạo một Phiếu nghỉ trưa đã hoàn thành cho đúng nhân viên, với thời lượng chính xác bằng phần Hotel làm quá.
- Hạn mức ngày được lưu tại `hotelDailyBudgets/{YYYY-MM-DD}` và thời gian được tính theo giây để hỗ trợ chính xác mốc 30 giây.
