import {$,el,notice,setupStatus,status} from '../../assets/js/core.js';\nimport {evaluateScientific,formatScientific} from './scientific-parser.js';\nconst root=$('#workspace');if(!root)throw Error('Scientific Calculator workspace unavailable.');\nlet angleMode='DEG',memory=0,lastAnswer=0,history=[];\nfunction finite(n){if(!Number.isFinite(n))throw Error('Result is outside the supported numeric range.');return n}\nconst format=formatScientific;\nconst css=el('style',{text:`.sc{max-width:720px;margin:auto}.sc-display{background:var(--surface-2,#f5f7f6);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px}.sc-expression{width:100%;font-size:20px;min-height:52px}.sc-result{min-height:46px;text-align:right;font-size:30px;font-weight:700;padding-top:10px;overflow-wrap:anywhere}.sc-head{display:flex;gap:8px;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap}.sc-mode{display:flex;gap:6px}.sc-mode button[aria-pressed="true"]{font-weight:800;outline:2px solid currentColor}.sc-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.sc-grid button{min-height:48px;padding:8px;font-size:15px}.sc-eq{grid-column:span 2}.sc-history{margin-top:16px}.sc-history-list{display:grid;gap:7px;max-height:220px;overflow:auto}.sc-history button{text-align:left;width:100%;white-space:normal}.sc-note{font-size:13px;color:var(--muted);margin-top:12px}@media(max-width:700px){.sc-grid{gap:6px}.sc-grid button{font-size:14px;min-height:46px;padding:6px}.sc-expression{font-size:18px}input,button{font-size:16px}}`});
root.prepend(css);
const expr=el('input',{class:'sc-expression',type:'text',value:'sin(30) + sqrt(16)',autocomplete:'off',spellcheck:'false','aria-label':'Scientific expression'});
const res=el('div',{class:'sc-result','aria-live':'polite',text:'4.5'});
const deg=el('button',{type:'button',class:'button',text:'DEG','aria-pressed':'true'}),rad=el('button',{type:'button',class:'button',text:'RAD','aria-pressed':'false'});
const memLabel=el('span',{text:'M: 0','aria-live':'polite'});
const head=el('div',{class:'sc-head'},[el('div',{class:'sc-mode'},[deg,rad]),memLabel]);
const display=el('div',{class:'sc-display'},[head,expr,res]);
const grid=el('div',{class:'sc-grid'});
const historyList=el('div',{class:'sc-history-list'}),historyBox=el('details',{class:'sc-history'},[el('summary',{text:'History'}),historyList]);
root.append(el('div',{class:'sc'},[display,grid,historyBox,el('div',{class:'sc-note',text:'Keyboard: numbers and operators type normally; Enter calculates; Escape clears; Backspace deletes. DEG/RAD affects trigonometric and inverse-trigonometric functions.'})]));
function insert(s,back=0){const a=expr.selectionStart==null?expr.value.length:expr.selectionStart,b=expr.selectionEnd==null?a:expr.selectionEnd;expr.setRangeText(s,a,b,'end');if(back){const p=expr.selectionStart-back;expr.setSelectionRange(p,p)}expr.focus()}
function calculate(){try{const raw=expr.value,v=evaluateScientific(raw,angleMode,lastAnswer);lastAnswer=v;res.textContent=format(v);history.unshift({e:raw,r:format(v),m:angleMode});history=history.slice(0,20);renderHistory();status('Calculated.');return v}catch(e){res.textContent='Error';status(e.message||'Calculation failed.',true);return null}}
function renderHistory(){historyList.replaceChildren(...history.map(h=>el('button',{type:'button',class:'button',text:h.e+' = '+h.r+' ('+h.m+')',onclick:()=>{expr.value=h.e;angleMode=h.m;syncMode();calculate()}})))}
function syncMode(){deg.setAttribute('aria-pressed',String(angleMode==='DEG'));rad.setAttribute('aria-pressed',String(angleMode==='RAD'))}
deg.onclick=()=>{angleMode='DEG';syncMode()};rad.onclick=()=>{angleMode='RAD';syncMode()};
const keys=[
 ['MC','mc'],['MR','mr'],['M+','mp'],['M−','mm'],['AC','clear'],
 ['sin','sin('],['cos','cos('],['tan','tan('],['asin','asin('],['acos','acos('],
 ['atan','atan('],['log','log('],['ln','ln('],['√','sqrt('],['∛','cbrt('],
 ['x²','^2'],['xʸ','^'],['1/x','recip'],['!','!'],['%','%'],
 ['π','pi'],['e','e'],['Ans','ans'],['(', '('],[')',')'],
 ['7','7'],['8','8'],['9','9'],['÷','/'],['⌫','back'],
 ['4','4'],['5','5'],['6','6'],['×','*'],['−','-'],
 ['1','1'],['2','2'],['3','3'],['+','+'],['.','.'],
 ['0','0'],['00','00'],['EXP','E'],['abs','abs('],['=','eq']
];
for(const [label,act] of keys){const b=el('button',{type:'button',class:'button'+(act==='eq'?' sc-eq':''),text:label});b.onclick=()=>{if(act==='eq')calculate();else if(act==='clear'){expr.value='';res.textContent='0';expr.focus()}else if(act==='back'){const a=expr.selectionStart||0,bp=expr.selectionEnd||a;if(a!==bp)expr.setRangeText('',a,bp,'end');else if(a>0)expr.setRangeText('',a-1,a,'end');expr.focus()}else if(act==='recip'){const s=expr.value.trim();expr.value=s?'1/('+s+')':'1/(';expr.focus()}else if(act==='mc'){memory=0;memLabel.textContent='M: 0'}else if(act==='mr')insert(format(memory));else if(act==='mp'||act==='mm'){const v=calculate();if(v!==null){memory=finite(memory+(act==='mp'?v:-v));memLabel.textContent='M: '+format(memory)}}else insert(act,act.endsWith('(')?0:0)};grid.append(b)}
expr.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();calculate()}else if(e.key==='Escape'){e.preventDefault();expr.value='';res.textContent='0'}});
setupStatus(root);notice(root,'Scientific Calculator V2 uses a strict mathematical parser—no eval. Factorial is limited to 170!, history is session-only, and calculations use JavaScript double-precision floating point.');calculate();
