const puppeteer = require('puppeteer');
const INDEX = 'http://localhost:8765/index.html';
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));
(async () => {
  const b = await puppeteer.launch({headless:'new',args:['--no-sandbox','--mute-audio']});
  const p = await b.newPage();
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  const errs=[];
  p.on('pageerror',(e)=>errs.push(String(e&&e.message?e.message:e)));
  await p.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
  await p.goto(INDEX,{waitUntil:'networkidle0',timeout:15000});
  await p.waitForFunction(()=>typeof snake!=='undefined'&&snake.body&&snake.body.length>0&&!!document.querySelector('canvas'),{timeout:10000});
  await sleep(300);
  const info = await p.evaluate(()=>{
    const c=document.querySelector('canvas');
    const r=c.getBoundingClientRect();
    return {internalW:c.width,internalH:c.height,cssW:r.width,cssH:r.height,cssLeft:r.left,cssTop:r.top,canvasWVar:canvasW,canvasHVar:canvasH,cell:cellSize,state:currentState};
  });
  console.log('CANVAS INFO:',JSON.stringify(info,null,2));

  // Start game
  await p.evaluate(()=>{if(typeof handleAction==='function')handleAction();});
  await p.waitForFunction(()=>currentState==='PLAYING',{timeout:4000});
  await sleep(200);

  // Test touch DOWN zone: tap below center
  const box = await p.evaluate(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{left:r.left,top:r.top};});
  const cx = info.canvasWVar/2;
  const cy = info.canvasHVar/2;
  const off = Math.floor(info.cell*3);
  const sx = Math.round(box.left + cx);
  const sy_down = Math.round(box.top + cy + off);
  console.log(`Tapping DOWN zone: screen(${sx},${sy_down}) canvas-local would be (${cx},${cy+off})`);
  await p.touchscreen.touchStart(sx, sy_down);
  await sleep(60);
  const s = await p.evaluate(()=>({next:snake.nextDirection,cur:snake.direction}));
  await p.touchscreen.touchEnd();
  console.log('After DOWN tap:', JSON.stringify(s));

  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
