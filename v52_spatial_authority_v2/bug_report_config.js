window.FLR_BUG_REPORT_ENDPOINT = 'https://flr-bug-reporter.sikarops.workers.dev/report'; // current anonymous D1 endpoint
(function(){
  function loadFinalMatchBugUi(){
    if(document.querySelector('script[data-flr-final-bug-ui]'))return;
    const s=document.createElement('script');
    s.src='final_match_bug_report_ui.js';
    s.dataset.flrFinalBugUi='1';
    s.defer=true;
    document.body.appendChild(s);
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',loadFinalMatchBugUi,{once:true});
  else loadFinalMatchBugUi();
})();
