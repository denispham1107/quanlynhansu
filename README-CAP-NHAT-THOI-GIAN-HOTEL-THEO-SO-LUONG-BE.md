# Cập nhật thời gian Hotel theo số lượng bé

- Khi chọn `Hotel` trong form tạo Phiếu, Admin phải nhập `Số lượng bé` ở lần tạo đầu tiên của ngày.
- Tổng thời gian Hotel trong ngày được tính chính xác theo công thức `Số lượng bé × 4 phút 30 giây`.
- Từ Phiếu Hotel tiếp theo trong cùng ngày, số lượng bé được khóa và thời gian Phiếu tự lấy bằng tổng thời gian còn lại sau khi trừ thời gian thực tế của các Phiếu Hotel đã hoàn thành.
- Số giờ, số phút và chức năng `Thêm giờ` của Phiếu Hotel đều bị khóa.
- Mỗi thẻ Hotel hiển thị số lượng bé và thời gian Hotel còn lại trong ngày.
- Khi một Phiếu Hotel hoàn thành quá thời gian được cấp, Cloud Function tự tạo một Phiếu nghỉ trưa đã hoàn thành cho đúng nhân viên, với thời lượng chính xác bằng phần Hotel làm quá.
- Khi Phiếu Hotel cuối cùng của một ngày bị xóa, hệ thống tự xóa số lượng bé, hạn mức thời gian, báo cáo Hotel và dữ liệu cộng dồn của đúng ngày đó để Admin có thể nhập lại từ đầu.
- Khi Admin mở ứng dụng, hệ thống cũng tự phát hiện và dọn các hạn mức Hotel mồ côi còn sót lại từ phiên bản cũ.
- Cài đặt `Admin có quyền chỉnh/thêm giờ cho phiếu Hotel` cho phép Admin cộng thêm thời gian vào Phiếu Hotel đang làm; số phút thêm đồng thời được cộng vào tổng hạn mức Hotel của đúng ngày.
- Khi cài đặt trên được bật, Admin có thể sửa thời gian thực tế của Phiếu Hotel đã hoàn thành theo giờ, phút và giây. Hệ thống tự tính lại thời gian đã dùng, thời gian còn lại và Phiếu nghỉ trưa bù do làm quá giờ.
- Hotel dùng hạn mức ảnh riêng theo ngày với công thức `Số lượng bé + 10 ảnh không gian`; mục `Bắt buộc đăng hình` thông thường bị vô hiệu hóa khi form có Phiếu Hotel.
- Ảnh hợp lệ của mọi Phiếu Hotel cùng ngày được cộng chung. Phiếu sau chỉ hiển thị số ảnh còn thiếu và không ai có thể chỉnh tay hạn mức ảnh Hotel.
- Khi nhân viên báo hoàn thành một Phiếu Hotel có thời gian thực tế đạt/vượt thời gian quy định nhưng tổng ảnh trong ngày vẫn thiếu, hệ thống tự tạo và hoàn thành một Phiếu nghỉ trưa bằng tổng thời gian thực tế của các Phiếu Hotel đã kết thúc trong ngày.
- Toàn hệ thống chỉ cho phép một Phiếu Hotel được giao và chạy tại một thời điểm. Phiếu Hotel tiếp theo chỉ có thể giao sau khi nhân viên của Phiếu trước bấm `Hoàn thành`; lớp bảo vệ máy chủ tự đưa Phiếu giao trùng về `Chờ chọn người` nếu hai thiết bị thao tác đồng thời.
- Hạn mức ngày được lưu tại `hotelDailyBudgets/{YYYY-MM-DD}` và thời gian được tính theo giây để hỗ trợ chính xác mốc 30 giây.
