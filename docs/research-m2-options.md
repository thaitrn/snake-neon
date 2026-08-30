# Research: TTS + Lip Sync trên Mac mini M2 (YouTube Faceless — Anime)

> Ngày: 2026-08-19 · Task: t_5ac43402 · Người thực hiện: architect (Goku)
> Mục tiêu: chọn combo TTS tiếng Việt + lip sync + sinh ảnh anime nhất quán, chạy trên Mac mini M2 (MPS, không NVIDIA), cho 3–5 video/tuần.

## TL;DR — Recommendation

| | Combo OPEN-SOURCE (chọn chính) | Combo PAID (khi channel lớn) |
|---|---|---|
| **TTS** | **Kokoro-82M + voicepack tiếng Việt community** (Apache-2.0) — 14 giọng Việt (Diễm Trinh, Mỹ Yến, Thành Đạt, Tuấn Ngọc…), RTF 0.259 (CPU, đo thật trên M2) | **ElevenLabs Creator $22/tháng** (121k credits ≈ 121k chars ≈ 10–12h audio) |
| **Lip sync** | **SadTalker (Apache-2.0) + MPS community mod** — issue #761: 30s video ≈ 20p xử lý trên M-series; Wav2Lip chỉ dùng thử nghiệm (xem rủi ro license) | HeyGen Creator $29/tháng (600 credits, video ≤30p, 1080p) hoặc API theo lượng dùng |
| **Ảnh anime** | ComfyUI (hỗ trợ chính thức Apple Silicon) + SDXL anime checkpoint + IP-Adapter anime hoặc FLUX.1-dev GGUF (city96, 131k downloads) — chạy GGUF Q8 ~8–12p/ảnh 1024px trên M2 | — |
| **Chi phí/tháng (3–5 video/tuần ≈ 20 video)** | **$0** (điện ~30–50k VND) | $22 (TTS) + $29 (HeyGen) = **$51** |

**Lý do chọn Kokoro thay vì Piper/XTTS:** Piper (MIT) RTF 0.177 nhanh nhất nhưng chỉ ~5 giọng Việt (3 dataset: vais1000, vivos, 25hours_single) và chất giọng "robot" hơn (VITS 2021-era); Kokoro (Apache-2.0) chất lượng tự nhiên hơn hẳn (StyleTTS2-base 2024) và có 14 giọng community. XTTS-v2 bị **Coqui Public Model License — KHÔNG dùng thương mại được** → loại cho kênh YT.

**Lý do chọn SadTalker làm lip sync local thay vì Wav2Lip/LatentSync:** SadTalker đã đổi license sang **Apache 2.0 và gỡ bỏ hạn chế non-commercial** (README chính thức), chạy trên M2 qua MPS mod (issue #761). Wav2Lip chạy CPU nhẹ nhưng **repo gốc cấm thương mại hoàn toàn** (disclaimer: "any form of commercial use is strictly prohibited" — model train trên LRS2) → chỉ dùng test, không dùng cho kênh monetized. LatentSync đẹp nhất nhưng NVIDIA-only (issue #359 MPS vẫn open).

---

## 1. TTS tiếng Việt — kết quả đo THẬT trên M2

Máy test: Mac mini M2, Python 3.11.15, piper-tts 1.7.0, kokoro 0.9.4, torch 2.13.0.
Câu benchmark (43 chữ): "Xin chào các bạn, hôm nay chúng ta sẽ cùng nhau khám phá câu chuyện lịch sử vô cùng thú vị về chiếc áo dài Việt Nam qua từng giai đoạn."

### 1.1 Bảng so sánh

| Option | Giá | Chất lượng tiếng Việt | Tốc độ M2 (đo thật) | License | Verdict |
|---|---|---|---|---|---|
| **Piper vi_VN-vais1000-medium** | $0 | Trung bình — rõ chữ, hơi robot, giọng fairly flat (VITS) | **RTF 0.177** (1.14s gen / 6.43s audio) | MIT | ✅ Dùng được, backup |
| **Kokoro-82M + kokoro-vietnamese voicepack** | $0 | **Tốt nhất trong open-source** — tự nhiên, 14 giọng (Diễm Trinh, Mỹ Yến, Ngọc Huyền, Thành Đạt…) | **RTF 0.259** (1.78s / 6.88s audio) | Apache-2.0 (voicepack: community) | ✅ **CHỌN** |
| XTTS-v2 (coqui) | $0 | Tốt (voice cloning) | Không test được (disk full — model 1.8GB) | **Coqui Public Model License: NON-COMMERCIAL** | ❌ Loại (YT monetized = thương mại) |
| **ElevenLabs** Creator | **$22/tháng** (121k credits), Starter $6 (30k), Pro $99 (600k) | Rất tốt, multilingual v2 hỗ trợ Việt ổn | Cloud API (không cần M2) | Thương mại được | ✅ Combo paid |
| **Azure TTS** | Free F0: **0.5M chars/tháng**; pay-as-you-go neural ~$15/1M chars | Tốt — giọng vi-VN nam/minh, female/hoaimy... | Cloud | OK | ✅ Free tier cực rộng — lựa chọn "free cloud" tốt nhất |
| Google Cloud TTS | Free 1M chars/tháng (Standard), WaveNet $16/1M sau đó | Tốt (vi-VN-Standard/Neural2) | Cloud | OK | Backup |

Note ElevenLabs: 1 credit ≈ 1 ký tự. 20 video × 1.500 chars = 30k chars/tháng → Starter $6 đủ dư. Nhưng giọng Việt ElevenLabs ở mức "ổn", chưa nổi trội so với giá.
Note Azure: 0.5M ký tự free/tháng = ~500 phút audio → dư dả cho 20 video dài 10p. Đây là **cửa ngách free cực mạnh** nếu chấp nhận giọng chuẩn "máy đọc".

### 1.2 Chi tiết môi trường đã verify

- Piper model: `vi_VN-vais1000-medium` (63MB .onnx, 22050 Hz) — nằm tại `/private/tmp/piper-test/vi.onnx` (sau reboot /tmp sạch, tải lại từ `rhasspy/piper-voices` HF).
- Kokoro voicepack Việt: 14 giọng (list đầy đủ trong `scripts/tts-research/kokoro_vi_voices.json`): diem_trinh, hung_thinh, mai_linh, mai_loan, manh_dung, my_yen, ngoc_huyen, phat_tai, thanh_dat, thuc_trinh, tuan_ngoc, storyvert, duc_an, duc_duy.
- Cách chạy Kokoro vi: `LANG_CODES["v"]="vi"` patch + `KModel(config, model)` + `KPipeline(lang_code="v")` + voice=voicepack.pt. Script benchmark: `scripts/tts-research/bench_kokoro_vi.py`.
- Sample audio nghe thử: `docs/samples/tts_piper_vi_bench2.wav`, `docs/samples/tts_kokoro_vi_bench2.wav` (cùng 1 câu để so sánh trực tiếp).

---

## 2. Lip sync trên M2 (không NVIDIA)

| Option | Chạy trên M2? | Chất lượng anime | License | Chi phí | Verdict |
|---|---|---|---|---|---|
| **SadTalker** (14.0k★) | ⚠️ Qua MPS community mod — issue #761: torch nightly + patch basicsr; 30s video ≈ 20p (M-series, gồm enhance) | Tốt với ảnh người thật; anime cần điều chỉnh | **Apache-2.0, đã gỡ non-commercial** ✅ | $0 | ✅ **CHỌN chính (local)** |
| **Wav2Lip** (13.2k★) | ✅ **CPU thuần — chắc chắn chạy M2**; weights 416MB (wav2lip_gan.pth) | Ổn — học trên LRS2 (người), anime mouth region vẫn track được (fork anime-dub proof-of-concept) | ❌ **Cấm thương mại** (train trên LRS2 — "any form of commercial use is strictly prohibited") | $0 | ⚠️ Chỉ dùng thử nghiệm/tham khảo |
| **LatentSync 1.5** (ByteDance, 6k★) | ❌ NVIDIA-only — issue #359 "Add Apple Silicon (MPS) support" vẫn OPEN; inference cần CUDA, training 20–30GB VRAM | Đẹp nhất (diffusion) | Apache-2.0 | $0 | ❌ Chờ thêm |
| **MusePose** (TMElyralab, 2.7k★) | ⚠️ Viết cho CUDA; MPS chưa verify | Đẹp (pose-driven, anime tốt) | NOASSERTION — cần review | $0 | Watchlist |
| **ComfyUI_Sonic** (1.1k★, active 5/2026) | ⚠️ Sonic = portrait animation; MPS chưa verify | Tốt cho talking head | Cần review | $0 | Watchlist |
| **HeyGen** | ✅ Cloud, không cần M2 | Photo avatar nói — anime style qua "talking photo" | Thương mại | Free 3 video/tháng (≤1p); Creator $29/600 credits (1080p, ≤30p/video); Pro $49/1000 credits | ✅ Combo paid |

### 2.1 Ghi chú quan trọng

- **Wav2Lip chất lượng anime**: model gốc train trên người thật (LRS2) → với anime, face-detect đôi khi lệch do tỷ lệ mặt anime khác người (mắt to, miệng nhỏ). Cộng đồng anime-dubbing thường phải finetune nhẹ trên dữ liệu anime. Expect chất lượng "đủ dùng", không hoàn hảo như LatentSync.
- **SadTalker MPS mod** (issue #761, đo bởi maintainer của mod): 3s video → 2m18s (512×512); 30s → ~20p. Với 20 video/tháng × 10 phút audio: ~400p render/tháng → chấp nhận được nếu chạy batch đêm. Nhưng lưu ý: repo chính frozen 6/2024, mod là patch thủ công torch nightly (2023!) — rủi ro maintenance.
- **HeyGen anime**: HeyGen chủ yếu là avatar người thật/photo avatar. Anime character qua photo avatar hoạt động (lớp "digital twin" từ ảnh), nhưng style anime thuần có thể lệch "uncanny". Nên test bằng chính ảnh nhân vật anime của kênh trước khi trả tiền.
- Với faceless anime channel, một kỹ thuật phổ biến là **không lip sync toàn bộ video** — chỉ dùng 1-2 cảnh talking-head làm hook, phần còn lại là cinematic b-roll + phụ đề. SadTalker chỉ cần xử lý 10-30% thời lượng video → giảm tải lớn cho M2.

---

## 3. Anime character consistency trên M2

| Option | MPS? | Ghi chú |
|---|---|---|
| **ComfyUI** | ✅ Hỗ trợ chính thức macOS/Apple Silicon (README chính thức + desktop app) | Nền tảng vững nhất trên Mac |
| SDXL anime checkpoint (animagineXL, Pony Diffusion) | ✅ (MPS) | Nhanh hơn FLUX trên M2 (~30-60s/ảnh) |
| IP-Adapter anime | ✅ (chạy được qua ComfyUI) | Giữ face/outfit nhất quán giữa các shot |
| **FLUX.1-dev GGUF** (city96, 131k downloads) | ✅ qua ComfyUI-GGUF node | Chất lượng cao nhất; Q8 ~8-12p/ảnh 1024 trên M2; license "other" = FLUX.1-dev Non-Commercial → **cần kiểm tra trước khi monetize**; có license trả phí |
| InstantID | ⚠️ Chủ yếu cho face người thật | Anime: dùng IP-Adapter anime thay thế |

**Khuyến nghị pipeline ảnh:** ComfyUI + SDXL anime + IP-Adapter anime (miễn phí, chạy tốt M2, không vướng license) cho 90% ảnh; FLUX GGUF chỉ khi cần hero shot (và kiểm tra license nếu monetize).

---

## 4. Chi phí/tháng — 3–5 video/tuần (~20 video, mỗi video ~10p, script ~1.500 chars)

| Hạng mục | Open-source combo | Paid combo |
|---|---|---|
| TTS | $0 (Kokoro/Piper local) | ElevenLabs Starter $6 (30k credits đủ 20×1.5k) hoặc Creator $22 (dư sức) |
| Lip sync | $0 (SadTalker MPS mod) | HeyGen Creator $29 |
| Ảnh anime | $0 (ComfyUI SDXL+IP-Adapter) | — |
| Điện + wear M2 | ~50.000đ/tháng | — |
| **Tổng** | **≈ 50k VND (~$2)** | **$35–51/tháng** |

**Đề xuất lộ trình:** Bắt đầu open-source (Kokoro + SadTalker MPS mod + ComfyUI). Khi channel ≥1k subs và cần giọng đọc "premium" cho retention → thêm ElevenLabs Starter $6/tháng. HeyGen chỉ đáng khi cần talking-head avatar đẹp cho hook.

---

## 5. Rủi ro & việc cần làm tiếp

1. **License XTTS-v2 và FLUX.1-dev đều non-commercial** → tuyệt đối không dùng cho kênh monetized. Kokoro (Apache-2.0) + Piper (MIT) + SDXL an toàn.
2. **Voicepack Kokoro Việt là community-built** — kiểm tra license repo voicepack (thường MIT/Apache, nhưng cần confirm trước khi dùng chính thức).
3. **Wav2Lip cấm thương mại** (đã confirm từ README gốc: model train trên LRS2, "any form of commercial use is strictly prohibited") → KHÔNG dùng cho kênh monetized. SadTalker Apache-2.0 an toàn, nhưng third-party components trong LICENSE cần rà lại 1 lần khi triển khai chính thức.
4. Test thực tế SadTalker MPS mod trên ảnh anime cụ thể của kênh (1 buổi, theo hướng dẫn issue #761) trước khi chốt pipeline.
5. Disk máy đang 99% full (chỉ ~1GB free sau cleanup) — cần dọn thêm ~20GB trước khi cài ComfyUI + models.

## Phụ lục: nguồn dữ liệu

- Benchmark Piper/Kokoro: tự đo trên máy (scripts `scripts/tts-research/bench_kokoro_vi.py`, `scripts/tts-research/bench_piper_vi.py`, WAV outputs trong `docs/samples/`).
- GitHub API (19/8/2026): stars/last-push/license của Rudrabha/Wav2Lip, OpenTalker/SadTalker, bytedance/LatentSync, TMElyralab/MusePose, smthemex/ComfyUI_Sonic.
- SadTalker MPS mod: issue OpenTalker/SadTalker#761 (số liệu 2m18s/3s và 20p/30s do tác giả mod đo).
- LatentSync MPS: issue bytedance/LatentSync#359 (open).
- Pricing ElevenLabs / HeyGen / Azure: scrape trực tiếp từ trang pricing chính thức (19/8/2026).
- HF API: license của coqui/XTTS-v2, hexgrad/Kokoro-82M, rhasspy/piper-voices, city96/FLUX.1-dev-gguf.
