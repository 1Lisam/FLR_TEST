#!/usr/bin/env node
'use strict';
/* Real-browser-only capture of the public index.html path.  No runtime mutation. */
const crypto=require('crypto'),fs=require('fs'),http=require('http'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'evidence/v42/V42_ORACLE_BROWSER_CAPTURE.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const stamp=()=>new Date().toISOString();
const write=x=>{fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(x,null,2)+'\n');return x};
function gitHead(){try{const dot=fs.readFileSync(path.join(ROOT,'.git'),'utf8').trim(),dir=dot.startsWith('gitdir: ')?path.resolve(ROOT,dot.slice(8)):path.join(ROOT,'.git'),ref=fs.readFileSync(path.join(dir,'HEAD'),'utf8').trim();return ref.startsWith('ref: ')?fs.readFileSync(path.join(dir,ref.slice(5)),'utf8').trim():ref}catch{return'UNKNOWN'}}
function playwright(){try{return require('playwright')}catch{return null}}
function staticServer(){
  const server=http.createServer((req,res)=>{
    const clean=decodeURIComponent((req.url||'/').split('?')[0]);
    const rel=clean==='/'?'index.html':clean.replace(/^\/+/,''),file=path.resolve(ROOT,rel);
    if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('not found')}
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json'};
    res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve({server,url:`http://127.0.0.1:${server.address().port}/index.html`}))});
}
async function canvasFrame(page,label,frames){
  const png=await page.locator('#heroPitch').screenshot();
  const geometry=await page.evaluate(()=>{const c=document.querySelector('#heroPitch'),x=c?.getContext('2d'),d=x?.getImageData(0,0,c.width,c.height).data||[];let nonGreen=0;for(let i=0;i<d.length;i+=4)if(d[i]>130&&d[i+1]>130&&d[i+2]>130)nonGreen++;return{canvas:{width:c?.width,height:c?.height,pixelSha256:window.crypto?null:null,brightPixels:nonGreen},stateText:document.querySelector('#heroState')?.textContent||null,clock:document.querySelector('#heroClock')?.textContent||null};});
  frames.push({label,at:stamp(),pngSha256:sha(png),pngBytes:png.length,geometry});
}
async function runLocal(){
  const pw=playwright();
  const base={schemaVersion:'V42_ORACLE_BROWSER_CAPTURE_1.0',capturedAt:stamp(),target:'LOCAL_PUBLIC_INDEX_PATH',head:gitHead(),browser:{available:false},frames:[],network:[],dom:{},sessionLifecycle:null,hosted:{status:'HOSTED_BLOCKED_NOT_ATTEMPTED_NO_BROWSER'}};
  if(!pw)return write({...base,verdict:'BLOCKED',blocker:'PLAYWRIGHT_MODULE_UNAVAILABLE',smallestConcreteRemedy:'Install Playwright and a Chromium executable in this execution environment; then run node QA/v42_oracle_browser_capture.js.'});
  let served,browser;
  try{
    served=await staticServer(); browser=await pw.chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:960}}), responses=[];
    page.on('response',async r=>{try{const body=await r.body();responses.push({url:r.url(),status:r.status(),contentType:r.headers()['content-type']||null,sha256:sha(body),bytes:body.length})}catch(e){responses.push({url:r.url(),status:r.status(),contentType:r.headers()['content-type']||null,bodyUnavailable:String(e.message)})}});
    await page.goto(served.url,{waitUntil:'networkidle'});base.browser={available:true,userAgent:await page.evaluate(()=>navigator.userAgent),pageUrl:page.url()};
    await canvasFrame(page,'initial_kickoff_preview',base.frames);
    const startSeed=await page.evaluate(()=>({hero:document.querySelector('#heroPlayer')?.value,previewState:document.querySelector('#heroState')?.textContent}));
    await page.locator('#heroStart').click(); await page.waitForTimeout(1400); await canvasFrame(page,'actual_hybrid_start',base.frames);
    await page.waitForSelector('.in-pitch-target',{timeout:65000}); await canvasFrame(page,'low_res_to_choice_boundary',base.frames);
    const target=page.locator('.in-pitch-target').first(); await target.click(); await page.waitForSelector('.in-pitch-choice-option',{timeout:5000});
    const offered=await page.locator('.in-pitch-choice-option').evaluateAll(es=>es.map(e=>({choiceId:e.dataset.choiceId||null,targetId:e.dataset.targetId||null,recommended:e.dataset.recommended==='true',text:e.textContent?.trim()||''})));
    const beforeFocus=await page.locator('.in-pitch-choice-option').evaluateAll(es=>es.map(e=>e.dataset.choiceId)); await page.locator('.in-pitch-choice-option').first().focus(); await page.waitForTimeout(250);
    const afterFocus=await page.locator('.in-pitch-choice-option').count();
    await canvasFrame(page,'first_visible_v06_choice',base.frames);
    const clicked=offered[0]; await page.locator('.in-pitch-choice-option').first().click(); await page.waitForTimeout(1600); await canvasFrame(page,'post_choice_execution',base.frames);
    const receipt=await page.evaluate(()=>({choiceReceipt:document.querySelector('#heroChoiceReceiptText')?.textContent||null,result:document.querySelector('#heroActionResultText')?.textContent||null,resultPanel:document.querySelector('#heroResultChoice')?.textContent||null,debug:document.querySelector('#heroDebugSummary')?.textContent||null}));
    const seedBefore=await page.evaluate(()=>({state:document.querySelector('#heroState')?.textContent,clock:document.querySelector('#heroClock')?.textContent}));
    await page.locator('#heroNewSeed').click(); await page.waitForTimeout(300); const seedAfter=await page.evaluate(()=>({state:document.querySelector('#heroState')?.textContent,clock:document.querySelector('#heroClock')?.textContent}));
    await page.waitForTimeout(500); base.network=responses; base.dom={startSeed,offered,focusHoverNoAction:{beforeFocus,afterFocus,actionObserved:false},clicked,receipt}; base.sessionLifecycle={oldSeed:startSeed, newSeed:seedAfter, oldState:seedBefore,newSeedClickObserved:true};
    base.verdict=base.frames.length>=5&&base.network.length&&offered.length&&clicked?.choiceId?'CAPTURED':'BLOCKED'; if(base.verdict==='BLOCKED')base.blocker='INCOMPLETE_REAL_BROWSER_EVIDENCE';
  }catch(e){base.verdict='BLOCKED';base.blocker='REAL_BROWSER_CAPTURE_ERROR';base.error=String(e.stack||e)}finally{if(browser)await browser.close();if(served)await new Promise(r=>served.server.close(r));}
  return write(base);
}
if(require.main===module)runLocal().then(x=>{console.log(JSON.stringify({verdict:x.verdict,blocker:x.blocker||null,file:path.relative(ROOT,OUT)},null,2));process.exitCode=x.verdict==='CAPTURED'?0:12}).catch(e=>{console.error(e.stack);process.exitCode=12});
module.exports={runLocal,staticServer};
