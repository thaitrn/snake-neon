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
  // What element is at the center of #pauseBtn?
  const overlap = await p.evaluate(()=>{
    const btn = document.querySelector('#pauseBtn');
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width/2;
    const cy = r.top + r.height/2;
    const el = document.elementFromPoint(cx, cy);
    return {
      btnRect:{left:r.left,top:r.top,w:r.width,h:r.height,center:{x:cx,y:cy}},
      topElAtPoint: el ? {tag:el.tagName,id:el.id,cls:el.className} : null,
      isBtnOnTop: el === btn,
    };
  });
  console.log('OVERLAP:',JSON.stringify(overlap,null,2));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
