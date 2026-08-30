import time, wave, contextlib, subprocess
TXT = ("Xin chào các bạn, hôm nay chúng ta sẽ cùng nhau khám phá câu chuyện lịch sử "
       "vô cùng thú vị về chiếc áo dài Việt Nam qua từng giai đoạn.")
t0=time.time()
r = subprocess.run(["python3","-m","piper","-m","/private/tmp/piper-test/vi.onnx","-f","/private/tmp/piper-test/bench2_out.wav"],
                   input=TXT.encode(), capture_output=True, timeout=180)
gen=time.time()-t0
if r.returncode==0:
    with contextlib.closing(wave.open("/private/tmp/piper-test/bench2_out.wav")) as w:
        dur = w.getnframes()/w.getframerate()
    print(f"Piper vi_VN-vais1000-medium: {gen:.2f}s gen | {dur:.2f}s audio | RTF {gen/dur:.3f}")
else:
    print("FAIL", r.stderr.decode()[:300])
