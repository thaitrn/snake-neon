const puppeteer = require('puppeteer');
const path = require('path');
const INDEX = 'file://' + path.resolve(__dirname, '..', 'index.html');
(async () => {
  const b = await puppeteer.launch({headless:'new',args:['--no-sandbox','--mute-audio']});
  const p = await b.newPage();
  await p.setViewport({width:390,height:844,hasTouch:true,isMobile:true});
  const errs=[];
  p.on('pageerror',(e)=>errs.push(String(e&&e.message?e.message:e)));
  p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE:'+m.text());});
  await p.evaluateOnNewDocument(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});});
  await p.goto(INDEX,{waitUntil:'load',timeout:15000});
  await new Promise(r=>setTimeout(r,2000));
  const info = await p.evaluate(()=>{
    const c=document.querySelector('canvas');
    const r=c?c.getBoundingClientRect():null;
    return {
      hasCanvas:!!c,
      internalW:c?c.width:0,internalH:c?c.height:0,
      cssW:r?r.width:0,cssH:r?r.height:0,cssLeft:r?r.left:0,cssTop:r?r.top:0,
      canvasWVar:typeof canvasW!=='undefined'?canvasW:null,
      canvasHVar:typeof canvasH!=='undefined'?canvasH:null,
      cell:typeof cellSize!=='undefined'?cellSize:null,
      state:typeof currentState!=='undefined'?currentState:null,
      snakeBody:typeof snake!=='undefined'&&snake.body?snake.body.length:0,
      orient:typeof currentOrientation!=='undefined'?currentOrientation:null,
    };
  });
  console.log('INFO:',JSON.stringify(info,null,2));
  console.log('ERRORS:',JSON.stringify(errs,null,2));
  await b.close();
})().catch(e=>{console.error('FATAL',e);process.exit(2);});
