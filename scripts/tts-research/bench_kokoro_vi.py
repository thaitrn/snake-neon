import os, time
os.environ["PHONEMIZER_ESPEAK_LIBRARY"] = "/opt/homebrew/lib/libespeak-ng.1.dylib"
import numpy as np, soundfile as sf

MODEL_DIR = "/tmp/kokoro-vi"
TXT = ("Xin chào các bạn, hôm nay chúng ta sẽ cùng nhau khám phá câu chuyện lịch sử "
       "vô cùng thú vị về chiếc áo dài Việt Nam qua từng giai đoạn.")

from kokoro import KModel, KPipeline
from kokoro.pipeline import LANG_CODES
LANG_CODES["v"] = "vi"
t0=time.time()
model = KModel(config=f"{MODEL_DIR}/config.json", model=f"{MODEL_DIR}/kokoro_vi.pth")
pipe = KPipeline(lang_code="v", model=model)
print(f"load: {time.time()-t0:.2f}s | device: {next(model.parameters()).device}")

t0=time.time()
res = list(pipe(TXT, voice=f"{MODEL_DIR}/kokoro_vi_voicepack.pt", speed=1.0))
gen = time.time()-t0
full = np.concatenate([r.audio for r in res if r.audio is not None])
sf.write("/tmp/kokoro-vi/bench2_out.wav", full, 24000)
dur = len(full)/24000
print(f"synth: {gen:.2f}s | audio: {dur:.2f}s | RTF {gen/dur:.3f} | chunks {len(res)}")

# peak / clipping check
peak = np.abs(full).max()
print(f"peak: {peak:.3f} ({20*np.log10(max(peak,1e-9)):.1f} dBFS), clipping: {peak>=0.999}")
