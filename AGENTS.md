# Quy tắc bảo trì dự án

## Giao diện mobile và iOS

- Mọi giao diện mới hoặc chỉnh sửa phải được kiểm tra ở chiều rộng 320px, 375px, 390px, 430px và chế độ ngang trước khi triển khai.
- Với CSS Grid/Flex, luôn đặt `min-width: 0` cho phần tử con có input, select, nút hoặc nội dung dài; cột co giãn phải dùng `minmax(0, 1fr)`.
- Các `input[type="date"]`, `input[type="time"]` và `select` native trên iOS không được tự làm viền ngoài của ô khi nằm trong Grid/Flex. Phải đặt chúng trong một lớp vỏ có `width: 100%`, `min-width: 0`, `overflow: hidden` và `box-sizing: border-box`; lớp vỏ chịu trách nhiệm vẽ viền và trạng thái focus.
- Không đặt hai control native cạnh nhau trên màn hình từ 640px trở xuống. Ở chiều ngang iPhone và tablet nhỏ đến 1024px chỉ dùng tối đa hai cột, trường còn lại phải xuống hàng.
- Không được để nội dung, nút hoặc ô nhập tràn khỏi card, chồng lên nhau hay tạo cuộn ngang. Khi thiếu chỗ, ưu tiên xuống hàng hoặc chuyển thành một cột.
- Sau thay đổi giao diện, phải tăng phiên bản cache của service worker để thiết bị iOS nhận CSS mới.
- Trước khi commit, kiểm tra ít nhất cú pháp, `git diff --check`, rà soát các media query có thể ghi đè quy tắc mobile ở cuối stylesheet và chạy kiểm tra kích thước thực tế của từng ô so với card cha. Chỉ nhìn mã CSS là chưa đủ để kết luận không tràn.
