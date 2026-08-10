# QA Smoke Checklist — Snake Neon (30 giây chơi thật)

> **Mục đích:** Bắt bug mà headless test không bắt được.
> Dựa trên post-mortem `docs/qa-process-review.md` §5 (10 mục bắt buộc).
> **Quy tắc:** CHƠI THẬT trên trình duyệt thật. Chrome DevTools mobile toggle **KHÔNG tính**.

---

## KHI NÀO CHẠY CHECKLIST NÀY?

Trước khi ghi "SHIP: YES" cho **bất kỳ thay đổi nào** chạm vào:
- Input / controls (touch, keyboard, joystick)
- Canvas / render
- Game state transitions (start, pause, game over, restart)
- `index.html` gốc (không chỉ `variants/`)

---

## CHUẨN BỊ

| Yêu cầu | Chi tiết |
|---------|----------|
| Device | Ít nhất 1 device thật (iPhone Safari HOẶC Android Chrome). Desktop Chrome + DevTools mobile **KHÔNG ĐỦ**. |
| File | Mở `index.html` trực tiếp (file:// hoặc localhost) |
| Thời gian | 30 giây chơi + 2 phút ghi kết quả |
| Bằng chứng | Screenshot/video cho bất kỳ mục FAIL |

---

## CHECKLIST 10 MỤC

### Block A — Boot & Render (Bug 1: createCanvas crash)

```
[ ] 1. Trang load → KHÔNG JS error
       Mở DevTools Console (hoặc giữ bất kỳ lỗi nào trên mobile).
       Kỳ vọng: 0 dòng đỏ / không trang trắng.

[ ] 2. Canvas render — thấy rắn + food + grid
       Kỳ vọng: nền tối, rắn neon, food nhấp nháy. KHÔNG phải màn hình đen/trắng.
```

### Block B — Input (Bug 2: touch không đổi hướng)

```
[ ] 3. Real touch: tap 4 hướng → rắn rẽ đúng
       Tap vùng TRÊN canvas → rắn đi lên (head.y giảm)
       Tap vùng DƯỚI → rắn đi xuống (head.y tăng)
       Tap vùng TRÁI → rắn đi trái (head.x giảm)
       Tap vùng PHẢI → rắn đi phải (head.x tăng)
       → CHƠI THẬT, không headless. Mỗi hướng phải thấy rắn QUAY.

[ ] 4. Real touch: ăn food → score +10, body dài ra
       Cho rắn đi vào food. Kỳ vọng: điểm tăng, thân dài thêm 1 đoạn.

[ ] 5. Real touch: đâm wall → GAME_OVER → tap restart
       Cho rắn đâm tường. Kỳ vọng: hiệu ứng chết → GAME_OVER → tap → chơi lại.
```

### Block C — Keyboard (desktop)

```
[ ] 6. Keyboard: arrows + space + P
       ↑↓←→ đổi hướng. Space/Enter = start/pause. P = pause/resume.
```

### Block D — Responsive

```
[ ] 7. Portrait + Landscape đều chơi được
       Xoay device. Rắn vẫn đi được ở cả 2 hướng.

[ ] 8. Orientation switch không reset game
       Đang chơi → xoay → game tiếp tục (không về MENU).
```

### Block E — Process Gate

```
[ ] 9. Đã chạy trên ít nhất 1 device thật
       Ghi rõ: model thiết bị + trình duyệt + phiên bản.

[ ] 10. Direction test đo HEAD POSITION delta
        → Mục này tự động bởi scripts/qa-index-regression.js.
        Nếu script chưa chạy: chưa được sign-off.
```

---

## KẾT QUẢ

```
Ngày test:     ___________
Tester:        ___________
Device:        ___________ (model + browser + version)
index.html:    commit hash ___________

PASS / FAIL:
  [ ] 1. No JS error          [ ] 6. Keyboard
  [ ] 2. Canvas render        [ ] 7. Portrait + Landscape
  [ ] 3. Touch 4 hướng        [ ] 8. Orientation no-reset
  [ ] 4. Eat food             [ ] 9. Device thật
  [ ] 5. Wall → game over     [ ] 10. Head delta test

Verdict:  [ ] SHIP: YES (10/10 PASS)   [ ] SHIP: NO (có FAIL)

Ghi chú / bug mô tả:
  _______________________________________________
  _______________________________________________
```

---

## NẾU CÓ MỤC FAIL

1. **Dừng sign-off ngay.** Không "cho qua" — post-mortem đã chứng minh chi phí.
2. Ghi bug: triệu chứng + steps to reproduce + screenshot/video.
3. Tạo task fix → assign đúng specialist (Frontend cho input/render, BA cho spec).
4. Chạy lại checklist sau khi fix. Không skip.

---

## TẠI SAO CHECKLIST NÀY TỒN TẠI

2 bug lọt production vì:
- **Bug 1** (createCanvas crash): không ai test `index.html` gốc, chỉ test `variants/`.
- **Bug 2** (touch vô hiệu): headless Puppeteer dispatch touch qua DevTools Protocol, không giống ngón tay thật. Test đo `nextDirection` var thay vì head position.

Checklist này ép người chơi thật xác nhận hành vi thật. Headless = smoke chỉ (P4), **không** = sign-off.

_Tài liệu tham khảo: `docs/qa-process-review.md` §3 (5 nguyên tắc) + §5 (checklist nguồn)_
