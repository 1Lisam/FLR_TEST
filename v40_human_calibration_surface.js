(function(){'use strict';
  const manifestUrl='QA/v40_human_calibration_manifest.json';
  const forbidden=/^(expected|oracle|automated|judgment|pass|fail|verdict|expectedJudgment)$/i;
  async function mount(){
    const response=await fetch(manifestUrl,{cache:'no-store'}); if(!response.ok)throw new Error('MANIFEST_LOAD_FAILED');
    const manifest=await response.json();
    const cases=(manifest.cases||[]).map(({id,category,scenario,seed,renderable})=>({id,category,scenario,seed,renderable:renderable===true}));
    if(cases.length!==12||cases.some(c=>Object.keys(c).some(k=>forbidden.test(k))))throw new Error('USER_PAYLOAD_POLICY_FAILED');
    const root=document.getElementById('finalMatchTestDock'); if(!root)return;
    const results=[]; const key='FLR_V40_HUMAN_CALIBRATION_RESULTS_1';
    try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))results.push(...saved.filter(x=>cases.some(c=>c.id===x.caseId)));}catch(_){ }
    root.classList.add('human-calibration-dock');
    root.insertAdjacentHTML('beforeend','<section class="human-calibration"><div class="human-calibration__head"><strong>HUMAN CALIBRATION · TEST ONLY</strong><span>12 scenes</span></div><p>Case order is fixed. Play/replay the scene, then record your visual judgment. No logs are required.</p><div class="human-calibration__case-list" data-hc-case-list></div><label>Optional note <input data-hc-note maxlength="240" placeholder="Short note (optional)"></label><div class="human-calibration__actions"><button type="button" data-hc-record="PASS">PASS</button><button type="button" data-hc-record="FAIL">FAIL</button><button type="button" data-hc-record="AMBIGUOUS">AMBIGUOUS</button><button type="button" data-hc-download>Download results</button></div><p data-hc-status aria-live="polite">Choose HC-01 to begin.</p></section>');
    const list=root.querySelector('[data-hc-case-list]'),status=root.querySelector('[data-hc-status]'),note=root.querySelector('[data-hc-note]'),select=root.querySelector('[data-field="scenario"]'),seed=root.querySelector('[data-field="seed"]'),runButton=root.querySelector('[data-action="run"]');
    cases.forEach((c,i)=>{const b=document.createElement('button');b.type='button';b.className='human-calibration__case';b.dataset.caseId=c.id;b.textContent=`${c.id} · ${c.category}`;b.addEventListener('click',()=>{list.querySelectorAll('.is-selected').forEach(x=>x.classList.remove('is-selected'));b.classList.add('is-selected');select.value=c.scenario;seed.value=c.seed;note.value='';runButton.click();status.textContent=`${c.id} · play/replay the deterministic scene, then record PASS / FAIL / AMBIGUOUS.`});list.appendChild(b);if(i===0)b.click()});
    function current(){return cases.find(c=>c.id===list.querySelector('.is-selected')?.dataset.caseId)||cases[0]}
    function persist(){localStorage.setItem(key,JSON.stringify(results));status.textContent=`Saved ${results.length}/${cases.length} judgments.`}
    function record(judgment){const c=current(),row={schemaVersion:'V40_HUMAN_CALIBRATION_RESULT_1.0',caseId:c.id,category:c.category,scenario:c.scenario,seed:c.seed,judgment,note:String(note.value||'').trim(),recordedAt:new Date().toISOString()};const i=results.findIndex(x=>x.caseId===c.id);if(i>=0)results[i]=row;else results.push(row);persist();return row}
    root.querySelectorAll('[data-hc-record]').forEach(b=>b.addEventListener('click',()=>record(b.dataset.hcRecord)));
    root.querySelector('[data-hc-download]').addEventListener('click',()=>{const payload={schemaVersion:'V40_HUMAN_CALIBRATION_RESULTS_1.0',source:'FLR_TEST_ONLY_HUMAN_CALIBRATION_SURFACE',caseOrder:cases.map(c=>c.id),results};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));a.download='v40_human_calibration_results.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
    window.FLR_V40_HUMAN_CALIBRATION={manifest:cases,results,record};
  }
  if(new URLSearchParams(location.search).get('humanCalibration')==='1'){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>mount().catch(e=>console.error(e)),{once:true});else mount().catch(e=>console.error(e));
  }
})();
