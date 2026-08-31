(function(){
'use strict';
const $=id=>document.getElementById(id);
const endpoint=()=>String(window.FLR_BUG_REPORT_ENDPOINT||'').trim();
function fallbackUrl(desc,category,priority){
  const short=String(desc||'').replace(/\s+/g,' ').trim().slice(0,64)||'bug report';
  const title=`[FINAL-MATCH][P${priority}][${category}] ${short}`;
  const body=`### 사용자 설명\n${desc}\n\n### 자동 첨부\n- 단계: FINAL MATCH USER CONFIRMATION\n- 분류: ${category}\n- 중요도: P${priority}\n- 경기 상황 JSON: 첨부 없음 또는 자동 전송 실패\n\n> 익명 자동 등록이 실패했을 때 사용하는 수동 fallback입니다.`;
  return `https://github.com/1Lisam/FLR_TEST/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
function install(){
  const report=$('heroBugReport'),submit=$('heroBugOpenIssue')||$('heroBugSubmit'),modal=$('heroBugModal'),desc=$('heroBugDescription'),attach=$('heroBugAttachJson'),playback=$('heroPlayback');
  if(!report||!submit||!modal||!desc)return;
  const originalReport=report.onclick,originalSubmit=submit.onclick;
  let uiOnly=false;
  function hasSceneDebug(){
    const download=$('heroDownloadScene'),copy=$('heroCopyDebug');
    return !!((download&&!download.disabled)||(copy&&!copy.disabled));
  }
  function fallbackLink(){
    let link=$('heroBugFallbackLink');
    if(link)return link;
    link=document.createElement('a');
    link.id='heroBugFallbackLink';
    link.className='secondary';
    link.target='_blank';
    link.rel='noopener';
    link.hidden=true;
    link.textContent='GitHub 수동 등록 열기';
    link.style.display='inline-flex';
    link.style.alignItems='center';
    link.style.textDecoration='none';
    const actions=modal.querySelector('.bug-actions');
    actions?.insertBefore(link,actions.firstChild);
    return link;
  }
  function hideFallback(){
    const link=fallbackLink();
    link.hidden=true;
    link.removeAttribute('href');
  }
  function showFallback(){
    const category=$('heroBugCategory')?.value||'기타',priority=$('heroBugPriority')?.value||'3',link=fallbackLink();
    link.href=fallbackUrl(desc.value.trim(),category,priority);
    link.hidden=false;
  }
  function prepareUiOnly(){
    uiOnly=true;
    hideFallback();
    desc.value='';
    if(attach){attach.checked=false;attach.disabled=true;}
    modal.hidden=false;
    setTimeout(()=>desc.focus(),0);
  }
  function keepButtonAvailable(){if(report.disabled)report.disabled=false;}
  keepButtonAvailable();
  new MutationObserver(keepButtonAvailable).observe(report,{attributes:true,attributeFilter:['disabled']});
  report.onclick=function(ev){
    hideFallback();
    if(hasSceneDebug()){
      uiOnly=false;
      if(attach)attach.disabled=false;
      return originalReport?.call(this,ev);
    }
    prepareUiOnly();
  };
  submit.onclick=async function(ev){
    if(!uiOnly){
      if(attach)attach.disabled=false;
      const result=originalSubmit?.call(this,ev);
      if(result&&typeof result.then==='function')await result;
      if(!modal.hidden&&String(playback?.textContent||'').startsWith('자동 등록 실패'))showFallback();
      return;
    }
    const description=desc.value.trim();
    if(!description){desc.focus();return;}
    const category=$('heroBugCategory')?.value||'기타',priority=Number($('heroBugPriority')?.value||3),url=endpoint();
    const rid=`umt-final-ui-${crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    submit.disabled=true;submit.textContent=url?'버그 등록 중…':'등록 서버 확인 중…';
    try{
      if(!url)throw new Error('BUG_REPORT_ENDPOINT_MISSING');
      const payload={reportId:rid,build:'FINAL-MATCH-UI-REPORT',step:78,category,priority,description,summary:null,debug:null,client:{userAgent:navigator.userAgent,href:location.href,uiOnly:true}};
      const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),json=await response.json().catch(()=>({}));
      if(!response.ok||!json.ok)throw new Error(json.error||`HTTP ${response.status}`);
      modal.hidden=true;uiOnly=false;
      if(attach){attach.disabled=false;attach.checked=true;}
      const msg=`버그 등록 완료 · ${json.reportId||rid} · UI 리포트 저장됨 · GitHub 로그인 불필요`;
      if(playback)playback.textContent=msg;
    }catch(err){
      console.warn('FLR UI-only bug report failed',err);
      showFallback();
      if(playback)playback.textContent='자동 등록 실패 · 아래 GitHub 수동 등록 링크를 눌러주세요.';
    }finally{
      submit.disabled=false;submit.textContent='버그 등록';
    }
  };
  const cancel=$('heroBugClose')||$('heroBugCancel');
  cancel?.addEventListener('click',()=>{uiOnly=false;hideFallback();if(attach){attach.disabled=false;attach.checked=true;}});
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',install,{once:true});else setTimeout(install,0);
})();
