const puppeteer = require('puppeteer');
const URL = 'http://localhost:8765/index.html';
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
(async () => {
  const b = await puppeteer.launch({headless:'new',args:['--no-sandbox','--mute-audio']});
  const p = await b.newPage();
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  await p.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
  await p.goto(URL,{waitUntil:'networkidle0',timeout:15000});
  await sleep(1000);
  const btnInfo = await p.evaluate(()=>{
    const btn = document.querySelector('#pauseBtn');
    if(!btn) return {found:false};
    const r = btn.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    return {
      found:true,
      text:btn.textContent,
      left:r.left,top:r.top,w:r.width,h:r.height,
      display:cs.display,visibility:cs.visibility,opacity:cs.opacity,
      disabled:btn.disabled,
      pointerEvents:cs.pointerEvents,
    };
  });
  console.log('PAUSE BTN:',JSON.stringify(btnInfo,null,2));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
