# Quy tắc bảo trì dự án

## Giao diện mobile và iOS

- Mọi giao diện mới hoặc chỉnh sửa phải được kiểm tra ở chiều rộng 320px, 375px, 390px, 430px và chế độ ngang trước khi triển khai.
- Với CSS Grid/Flex, luôn đặt `min-width: 0` cho phần tử con có input, select, nút hoặc nội dung dài; cột co giãn phải dùng `minmax(0, 1fr)`.
- Các `input[type="date"]`, `input[type="time"]` và `select` native trên iOS không được tự làm viền ngoài của ô khi nằm trong Grid/Flex. Phải đặt chúng trong một lớp vỏ có `width: 100%`, `min-width: 0`, `overflow: hidden` và `box-sizing: border-box`; lớp vỏ chịu trách nhiệm vẽ viền và trạng thái focus.
- Không đặt hai control native cạnh nhau trên màn hình từ 640px trở xuống. Ở chiều ngang iPhone và tablet nhỏ đến 1024px chỉ dùng tối đa hai cột, trường còn lại phải xuống hàng.
- Không được để nội dung, nút hoặc ô nhập tràn khỏi card, chồng lên nhau hay tạo cuộn ngang. Khi thiếu chỗ, ưu tiên xuống hàng hoặc chuyển thành một cột.
- Sau thay đổi giao diện, phải tăng phiên bản cache của service worker để thiết bị iOS nhận CSS mới.
- Trước khi commit, kiểm tra ít nhất cú pháp, `git diff --check`, rà soát các media query có thể ghi đè quy tắc mobile ở cuối stylesheet và chạy kiểm tra kích thước thực tế của từng ô so với card cha. Chỉ nhìn mã CSS là chưa đủ để kết luận không tràn.

## Nhập thời gian

- Mọi ô nhập thời gian mới hoặc được chỉnh sửa phải hiển thị và nhận theo khung giờ 24 giờ (`HH:mm` hoặc `HH:mm:ss` khi có giây), không phụ thuộc cách hiển thị AM/PM của trình duyệt hay thiết bị. Kiểm tra giá trị trước khi lưu và giữ đúng định dạng này khi mở lại để sửa.

## Modal và vùng cuộn

- Không được hiển thị hai modal chồng lên nhau. Khi chuyển từ một modal sang màn hình/modal con, phải ẩn modal nguồn, giữ nguyên dữ liệu đang nhập và cung cấp nút “Quay lại” để khôi phục đúng trạng thái trước đó.
- Thanh cuộn của modal phải nằm trong phần nội dung của card, không nằm ngoài viền hoặc góc bo. Card phải có giới hạn chiều cao và `overflow: hidden`; vùng nội dung cuộn phải có `min-height: 0`, `overflow-y: auto` và `overflow-x: hidden`.
- Sau khi sửa modal, phải kiểm tra hình học thực tế để bảo đảm card nằm trong viewport, vùng cuộn nằm trong card và trang phía sau không tạo thêm thanh cuộn.
- Mọi nút xóa vĩnh viễn trong danh sách phải hỏi xác nhận trước khi gọi máy chủ; phía máy chủ vẫn phải kiểm tra quyền Admin và quyền sở hữu dữ liệu, không chỉ dựa vào giao diện.

## Hoàn tất thay đổi mã

- Khi hoàn tất một yêu cầu sửa mã trong dự án này và các kiểm tra liên quan đã đạt, tự tạo commit Git tại máy rồi đẩy commit đó lên GitHub; không cần chờ yêu cầu “đẩy lên github” riêng.
- Trong câu trả lời cuối, báo rõ các tệp đã commit, mã commit và kết quả đẩy lên GitHub.
- Không tự commit/đẩy khi người dùng chỉ yêu cầu kiểm tra, giải thích, hoặc dặn chờ phê duyệt trước khi sửa. Không đưa các thay đổi không thuộc yêu cầu hoặc của người dùng vào commit; nếu không thể tách an toàn thì hỏi trước.
