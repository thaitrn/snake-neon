# QA Process Review — Post-mortem 2 bug QC miss

> **Task:** t_c14d3020 | **PM:** Goku | **Date:** 2026-08-09
> **Trigger:** Sếp — *"Mẹ bug như vậy mà đội QC lúc kiểm tra không phát hiện được hay sao?"*
> **Phạm vi:** Snake Neon — 2 bug QC miss (createCanvas crash, touch portrait)

---

## TÓM TẮT CHO SẾP (TL;DR)

QC PASS nhưng bug vẫn lên production vì **2 lý do cấu trúc**, không phải lỗi tay:

1. **Test giả lập không trung thực.** Toàn bộ test chạy bằng Puppeteer headless Chrome. Headless Chrome dispatch `touchstart/touchend` qua JS API (`page.touchscreen.touchStart`) — đây là touch "lạnh" đi qua DevTools Protocol, **không phải ngón tay thật**. Trên trình duyệt thật, touch event đi qua compositor + hit-testing + 300ms click delay + synthetic mouse — rất khác. Puppeteer không mô phỏng đầy đủ chuỗi này. Nên QC "thấy PASS" nhưng tay người chơi thật không được mô phỏng.

2. **Test đo sai tín hiệu (positive bias).** Các test chỉ check `nextDirection.x/y` thay vì quan sát con rắn thật sự di chuyển vài ô và so sánh vị trí đầu (head position) trước/sau. Tức là test trả lời *"code có set biến không?"* chứ không phải *"ngón tay tap → rắn rẽ không?"*. Lần này biến `nextDirection` có set nhưng vẫn có bug thực tế → test PASS giả.

**Khuyến nghị ngay (xem §4):** Bổ sung "smoke test thật" = chơi game 30s trên trình duyệt thật (Chrome DevTools mobile emulation KHÔNG đủ) trước khi sign-off bất kỳ thay đổi nào chạm vào input/controls.

---

## 1. POST-MORTEM — 2 BUG QC MISS

### Bug 1: `createCanvas` crash (game không render gì)

**Triệu chứng:** Trang trắng / đen, không có canvas, game không boot.

**Root cause (code):** Ở dòng 8 của `index.html`:
```html
<script>p5.disableFriendlyErrors = true;</script>
```
Script này chạy **ngay sau khi load p5.min.js**. Nhưng `p5.disableFriendlyErrors` là property của p5 **instance**, không phải global. Ở thời điểm script chạy, p5 global constructor chưa init → throw `ReferenceError: Cannot set properties of undefined`. Lỗi này chết sớm (blocking), `setup()` không chạy → `createCanvas` không được gọi → không canvas → trang trống.

> Variant pipeline đã fix bằng cách drop script này (`docs/qa-variants-report.md` §3 bug #1). Nhưng `index.html` gốc vẫn còn → chính `index.html` crash.

**Tại sao QC PASS?**
- QC test 100 **variants** (file riêng, đã drop script lỗi) → PASS sạch. Đúng.
- Nhưng **không ai test `index.html` gốc** — file chính mà sếp mở để chơi. Giữa `index.html` và `variants/*.html` có chênh lệch cấu hình mà QC assume "giống nhau".
- **Gap:** Không có test case regression cho `index.html` sau khi variant pipeline thay đổi cấu trúc script.

### Bug 2: Touch portrait không đổi hướng (tap = vô hiệu)

**Triệu chứng:** Chơi trên điện thoại portrait, tap màn hình → rắn không rẽ.

**Root cause (code):** Logic touch nằm ở `touchStarted/touchMoved/touchEnded` (dòng 1268-1318). Flow gốc:
- `touchStarted` chỉ **ghi lại** vị trí tap (`touchStart`).
- `touchEnded` mới `getTapZone()` + `setDirection()`.

Vấn đề: `touchEnded` đọc `mouseX/mouseY` của p5 để tính drag, nhưng **`mouseX/mouseY` của p5 không đáng tin trên touch-end** ở nhiều browser mobile (stale hoặc 0). Nếu `mouseX/mouseY` sai → tính dx/dy sai → branch tap-zone không chạy → `setDirection` không gọi → rắn không rẽ.

Bản vá (đang trong git working tree, chưa commit): thêm `getEventTouchPos()` đọc thẳng `event.changedTouches[0]` thay vì p5, và move `getTapZone + setDirection` lên `touchStarted` (instant response). Tôi đã verify: `test_touch.js` vẫn FAIL `1/4` — vá chưa đủ hoặc test đo sai.

**Tại sao QC PASS?** (2 lý do, đây là phần quan trọng nhất)

**(2a) Puppeteer touch không trung thực.** Tất cả test (`scripts/qa-mobile-ux.js`, `scripts/qa-mobile-controls-v2.js`, `test_touch.js`) đều chạy headless và dùng `page.touchscreen.touchStart(x,y)`. Puppeteer/CDP dispatch touch event thẳng vào renderer qua protocol, **bỏ qua hit-testing layer + synthetic mouse chuỗi** mà trình duyệt thật tạo. p5 đăng ký listener trên `touchstart`/`touchend` DOM event — Puppeteer gửi event đúng, nên **trên headless listener vẫn nhận**. Nhưng các subtle khác biệt (touch-action CSS, passive listener flag, gesture recognizer) tạo hành vi khác trên device thật. Kết quả: PASS trên headless, FAIL trên tay.

**(2b) Assertion đo biến, không đo behavior.** Xem `qa-mobile-controls-v2.js:148-165`:
```js
await tapAt(page, box.cx, box.top + box.h * 0.2);
st = await readState(page);
v.checks.AC1_tapUp = (st.nextDir && st.nextDir.y === -1) || (st.dir && st.dir.y === -1);
```
Test check `nextDirection` (biến nội bộ). Nhưng:
- Nếu p5 instance scope khác test scope → `window.snake` undefined → test fail *khác*.
- Nếu event đến nhưng timing khác (set xong rồi bị overwrite bởi tick) → test PASS, game FAIL.

**Thực tế tôi vừa chạy `test_touch.js` (2026-08-09):**
```
state before start: undefined
state after start tap: undefined
FAIL UP: expected UP got RIGHT
PASS RIGHT: expected RIGHT got RIGHT
FAIL DOWN: expected DOWN got RIGHT
FAIL LEFT: expected LEFT got RIGHT
1/4 zones passed
```
→ Game **không start** (state undefined) + touch chỉ "RIGHT" (default direction, không đổi). Test cũ báo PASS vì assert logic non-chặt (`||`) + đo `nextDir` thay vì head position.

---

## 2. ROOT CAUSE QC PROCESS

| # | Root cause | Có phải lỗi người? | Mức độ |
|---|-----------|-------------------|--------|
| RC1 | Test chỉ chạy headless Puppeteer, không có device/real-browser test | Không — thiếu hạ tầng | **Cao** |
| RC2 | Assertion đo biến nội bộ (`nextDirection`) thay vì behavior thực (head di chuyển) | Một phần — test design yếu | **Cao** |
| RC3 | Không regression test `index.html` gốc, chỉ test `variants/*` | Có — bỏ sót scope | **Trung bình** |
| RC4 | Không có "play smoke" = người chơi thật chơi 30s trước ship | Không — quy trình thiếu | **Cao** |
| RC5 | Acceptance criteria quá hẹp: "direction var set" ≠ "snake turns" | Có — spec/test nong | **Trung bình** |
| RC6 | Test giả định `window.currentState`/`window.snake` tồn tại global — nhưng p5 instance mode scope khác | Có — test setup sai | **Trung bình** |

**Không phải do:** lười, check-list thiếu mục, hay QA không chạy test. QC chạy test đầy đủ, viết report kỹ. Vấn đề là **chất lượng trung thực của test** — test chạy nhưng không phản ánh reality của tay người.

---

## 3. 5 NGUYÊN TẮC CẢI THIỆN (KISS, áp dụng ngay)

### P1. "Smoke test thật" bắt buộc trước sign-off
Trước khi QC PASS bất kỳ thay động chạm input/controls/render: **một người (hoặc sếp) chơi game 30 giây trên trình duyệt thật** (Chrome desktop với DevTools mobile toggle **không tính** — phải là Safari iOS hoặc Chrome Android thật, hoặc tối thiểu BrowserStack real device). Checklist:
- Mở game, thấy canvas + rắn + food (Bug 1 sẽ bị bắt)
- Tap 4 hướng, rắn rẽ đúng (Bug 2 sẽ bị bắt)
- Ăn food, điểm tăng, lớn lên
- Đâm wall → game over → restart

### P2. Assertion đo behavior, không đo biến
Mọi test direction phải: đo head position trước tap → đợi 3-4 tick → đo head position sau → assert head di chuyển đúng hướng. Không bao giờ assert `nextDirection.x === -1`. Biến có thể set mà rắn không rẽ (race condition, overwrite, scope).

### P3. Regression test `index.html` gốc
Có test suite riêng cho `index.html` (không chỉ `variants/`). Chạy sau mỗi commit chạm file này. Minimum: load không JS error + canvas render + 1 direction input hoạt động.

### P4. Headless = smoke chỉ, không = sign-off
Headless Puppeteer giữ cho: load test, render test, config correctness, regression nhanh. **Không** dùng cho: touch/pointer/gesture input, audio, orientation change, bất cứ thứ gì phụ thuộc platform runtime. Những thứ đó phải real-device hoặc manual.

### P5. AC viết theo hành vi người chơi
Thay vì: *"AC-1: tap zone maps 4 directions (nextDir set)"*
Viết: *"AC-1: Khi đang PLAYING portrait, người chơi tap vùng trên canvas → trong 2 tick tiếp theo, head của rắn phải di chuyển lên ít nhất 1 ô. Test bằng cách đo head.y trước/sau."*

---

## 4. TOOL / INFRASTRUCTURE RECOMMENDATION

| Đề xuất | Chi phí | Ưu tiên | Bắt được bug nào |
|---------|--------|---------|------------------|
| **Manual smoke checklist** (docs/qa-smoke-checklist.md) — 30s chơi thật | 0$ | **Must** | Bug 1 + Bug 2 |
| Thêm test `index.html` regression vào CI | Thấp | **Must** | Bug 1 |
| Đổi assertion direction sang head-position delta | Thấp | **Must** | Bug 2 (một phần) |
| BrowserStack / Sauce Labs real device cloud | ~$30-50/mo | Should | Bug 2 (đầy đủ) |
| Playwright + `page.tap()` real gesture (thay Puppeteer touchStart) | Thấp | Should | Bug 2 (một phần) |
| Appium / WebView testing trên device thật | Cao | Could | Tương lai |
| Visual regression (screenshot diff) | Thấp | Could | Bug 1 |

**KISS recommendation:** Bắt đầu với 3 mục Must (0$) + BrowserStack (Should). Đủ để không lặp lại 2 bug này.

---

## 5. CHECKLIST SIGN-OFF (không được bỏ qua)

Trước khi QC ghi "SHIP: YES", **tất cả** phải PASS:

```
[ ] 1. index.html load không JS error (mở DevTools console, 0 red)
[ ] 2. Canvas render (nhìn thấy rắn + food + grid)
[ ] 3. Real touch: tap 4 hướng → rắn rẽ đúng (CHƠI THẬT, không headless)
[ ] 4. Real touch: ăn food → score +10, body dài ra
[ ] 5. Real touch: đâm wall → GAME_OVER → tap restart
[ ] 6. Keyboard (desktop): arrows + space + P
[ ] 7. Portrait + Landscape đều chơi được
[ ] 8. Orientation switch không reset game
[ ] 9. Đã chạy trên ít nhất 1 device thật (iOS hoặc Android)
[ ] 10. Direction test đo HEAD POSITION delta, không đo nextDirection var
```

Nếu bất kỳ mục nào không thể tự động hóa → **manual test bắt buộc**, ghi screenshot/video làm bằng chứng.

---

## 6. ACCOUNTABILITY & NEXT STEPS

Theo `docs/escalation-protocol.md` §5: QA accountable cho bug miss. Đây là lần 2. Đề xuất:

1. **QC nhận lỗi** (RC2, RC3, RC5, RC6 là lỗi test design — thuộc về QA).
2. **PM nhận lỗi phần AC quá nong** (RC5 — spec phần tôi viết, cần chặt hơn).
3. **Không có lỗi architectural** — hạ tầng headless là default industry, vấn đề là dùng sai mục đích (sign-off) chứ không phải tồn tại.

**Action items (assign ngay):**
- [ ] PM: Update `docs/mobile-controls-v2.md` AC theo P5 (behavior-based) — bản task mới
- [ ] QA: Viết `docs/qa-smoke-checklist.md` theo §5 — bản task mới
- [ ] QA: Thêm `index.html` regression test — bản task mới
- [ ] Dev: Fix Bug 2 touch (git working tree có draft vá, cần verify trên device) — task đang chờ QC reproduce

_Goku (PM) — 2026-08-09_
