import {$,el,notice,setupStatus,status} from '../../assets/js/core.js';
const root=$('#workspace');if(!root)throw Error('Scientific Calculator workspace unavailable.');
let angleMode='DEG',memory=0,lastAnswer=0,history=[];
function finite(n){if(!Number.isFinite(n))throw Error('Result is outside the supported numeric range.');return n}
const format=formatScientific;
const MAXLEN=500,MAXDEPTH=60,MAXFACT=170;
const FUNCTIONS=['asin','acos','atan','sqrt','cbrt','sin','cos','tan','log','ln','abs'];
function factorial(n){if(!Number.isInteger(n)||n<0)throw Error('Factorial requires a non-negative whole number.');if(n>MAXFACT)throw Error('Factorial is limited to 170 to avoid overflow.');let r=1;for(let i=2;i<=n;i++)r*=i;return r}
function tokenize(expression){
 if(typeof expression!=='string'||!expression.trim())throw Error('Enter an expression.');
 if(expression.length>MAXLEN)throw Error('Expression must be 500 characters or fewer.');
 const src=expression.replace(/π/g,'pi').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/√/g,'sqrt');
 const out=[];let p=0;
 while(p<src.length){if(/\s/.test(src[p])){p++;continue}
  const m=src.slice(p).match(/^(?:(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?|([A-Za-z]+)|([+\-*/^()%!,]))/);
  if(!m)throw Error('Unsupported character or malformed number.');
  const raw=m[0],word=m[3]?m[3].toLowerCase():null;
  if(word&&!FUNCTIONS.includes(word)&&!['pi','e','ans'].includes(word))throw Error('Unsupported function or constant: '+word+'.');
  out.push(word||raw);p+=raw.length;
 }return out;
}
function evaluateScientific(expression,mode='DEG',ans=0){
 if(mode!=='DEG'&&mode!=='RAD')throw Error('Angle mode must be DEG or RAD.');
 const tokens=tokenize(expression);let i=0,depth=0;const peek=()=>tokens[i],eat=()=>tokens[i++];
 function sum(){let a=product();while(peek()==='+'||peek()==='-'){const op=eat(),b=product();a=finite(op==='+'?a+b:a-b)}return a}
 function product(){let a=unary();for(;;){if(peek()==='*'||peek()==='/'){const op=eat(),b=unary();if(op==='/'&&b===0)throw Error('Cannot divide by zero.');a=finite(op==='*'?a*b:a/b);continue}const t=peek();if(t==='('||t==='pi'||t==='e'||t==='ans'||FUNCTIONS.includes(t)){a=finite(a*unary());continue}break}return a}
 function unary(){if(peek()==='+'){eat();return unary()}if(peek()==='-'){eat();return -unary()}return power()}
 function power(){let a=postfix();if(peek()==='^'){eat();a=finite(Math.pow(a,unary()))}return a}
 function postfix(){let a=primary();while(peek()==='!'||peek()==='%'){a=eat()==='!'?factorial(a):a/100}return finite(a)}
 function primary(){
  depth++;if(depth>MAXDEPTH)throw Error('Expression is too deeply nested.');
  const t=eat();let v;
  if(t==='('){v=sum();if(eat()!==')')throw Error('Close every parenthesis.')}
  else if(t==='pi')v=Math.PI;else if(t==='e')v=Math.E;else if(t==='ans')v=finite(ans);
  else if(t&&/^(?:\d|\.)/.test(t))v=Number(t);
  else if(FUNCTIONS.includes(t)){
   if(eat()!=='(')throw Error('Functions require parentheses.');
   const x=sum();if(eat()!==')')throw Error('Close every function parenthesis.');
   const rad=mode==='DEG'?x*Math.PI/180:x;
   if(t==='sin')v=Math.sin(rad);else if(t==='cos')v=Math.cos(rad);
   else if(t==='tan'){if(Math.abs(Math.cos(rad))<1e-14)throw Error('Tangent is undefined at this angle.');v=Math.tan(rad)}
   else if(t==='asin'||t==='acos'){if(x<-1||x>1)throw Error(t+' domain is -1 to 1.');const r=t==='asin'?Math.asin(x):Math.acos(x);v=mode==='DEG'?r*180/Math.PI:r}
   else if(t==='atan'){const r=Math.atan(x);v=mode==='DEG'?r*180/Math.PI:r}
   else if(t==='log'){if(x<=0)throw Error('log requires a positive value.');v=Math.log10(x)}
   else if(t==='ln'){if(x<=0)throw Error('ln requires a positive value.');v=Math.log(x)}
   else if(t==='sqrt'){if(x<0)throw Error('Square root requires a non-negative value.');v=Math.sqrt(x)}
   else if(t==='cbrt')v=Math.cbrt(x);else if(t==='abs')v=Math.abs(x);
  }else throw Error('Expected a number, constant, function or parenthesis.');
  depth--;return finite(v);
 }
 const v=sum();if(i!==tokens.length)throw Error('Check the expression and operators.');return finite(v);
}
function formatScientific(n){if(!Number.isFinite(n))throw Error('Result is outside the supported numeric range.');if(Object.is(n,-0)||Math.abs(n)<1e-15)n=0;const a=Math.abs(n);if(a!==0&&(a>=1e15||a<1e-12))return n.toExponential(12).replace(/\.0+e/,'e').replace(/(\.\d*?[1-9])0+e/,'$1e');return n.toLocaleString(undefined,{maximumSignificantDigits:15,useGrouping:false})}

const css=el('style',{text:`.sc{max-width:620px;margin:auto}.sc-display{background:var(--surface-2,#f5f7f6);border:1px solid var(--line);border-radius:18px;padding:14px;margin-bottom:12px}.sc-top{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.sc-mode{display:flex;gap:5px}.sc-mode button{min-height:38px;padding:6px 12px}.sc-mode button[aria-pressed="true"]{font-weight:800;outline:2px solid currentColor}.sc-expression{width:100%;font-size:18px;min-height:48px}.sc-result{min-height:44px;text-align:right;font-size:30px;font-weight:700;padding-top:8px;overflow-wrap:anywhere}.sc-tools{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:8px}.sc-tools button{min-height:42px;padding:6px;font-size:14px}.sc-advanced{margin-bottom:10px}.sc-advanced summary{cursor:pointer;font-weight:700;padding:9px 2px}.sc-keypad{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.sc-keypad button{min-height:54px;font-size:18px;padding:8px}.sc-keypad .sc-op{font-weight:800}.sc-keypad .sc-eq{font-weight:900;font-size:24px;background:var(--primary,#145940);color:#fff;border-color:var(--primary,#145940)}.sc-secondary{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0}.sc-secondary button{min-height:38px;padding:5px;font-size:13px}.sc-history{margin-top:12px}.sc-history-list{display:grid;gap:6px;max-height:190px;overflow:auto}.sc-history button{text-align:left;width:100%;white-space:normal}.sc-note{font-size:13px;color:var(--muted);margin-top:10px}@media(max-width:700px){.sc{max-width:100%}.sc-display{padding:12px}.sc-tools{gap:5px}.sc-tools button{font-size:13px;min-height:40px}.sc-keypad{gap:7px}.sc-keypad button{min-height:52px;font-size:18px}.sc-expression,input,button{font-size:16px}.sc-result{font-size:28px}}`});
root.prepend(css);
const expr=el('input',{class:'sc-expression',type:'text',value:'',placeholder:'Enter calculation',autocomplete:'off',spellcheck:'false','aria-label':'Scientific expression'});
const res=el('div',{class:'sc-result','aria-live':'polite',text:'0'});
const deg=el('button',{type:'button',class:'button',text:'DEG','aria-pressed':'true'}),rad=el('button',{type:'button',class:'button',text:'RAD','aria-pressed':'false'});
const memLabel=el('span',{text:'M: 0','aria-live':'polite'});
const display=el('div',{class:'sc-display'},[el('div',{class:'sc-top'},[el('div',{class:'sc-mode'},[deg,rad]),memLabel]),expr,res]);
const quick=el('div',{class:'sc-tools'});
const advancedGrid=el('div',{class:'sc-tools'});
const advanced=el('details',{class:'sc-advanced'},[el('summary',{text:'More scientific functions'}),advancedGrid]);
const keypad=el('div',{class:'sc-keypad'});
const secondary=el('div',{class:'sc-secondary'});
const historyList=el('div',{class:'sc-history-list'}),historyBox=el('details',{class:'sc-history'},[el('summary',{text:'History'}),historyList]);
root.append(el('div',{class:'sc'},[display,keypad,el('details',{class:'sc-advanced'},[el('summary',{text:'Scientific functions'}),quick]),advanced,secondary,historyBox,el('div',{class:'sc-note',text:'Use the main keypad for everyday calculations. Tap = for the result. Scientific functions, memory and history remain available below.'})]));
function insert(s){const a=expr.selectionStart==null?expr.value.length:expr.selectionStart,b=expr.selectionEnd==null?a:expr.selectionEnd;expr.setRangeText(s,a,b,'end');expr.focus()}
function calculate(){try{const raw=expr.value;if(!raw.trim()){res.textContent='0';return null}const v=evaluateScientific(raw,angleMode,lastAnswer);lastAnswer=v;res.textContent=format(v);history.unshift({e:raw,r:format(v),m:angleMode});history=history.slice(0,20);renderHistory();status('Calculated.');return v}catch(e){res.textContent='Error';status(e.message||'Calculation failed.',true);return null}}
function renderHistory(){historyList.replaceChildren(...history.map(h=>el('button',{type:'button',class:'button',text:h.e+' = '+h.r+' ('+h.m+')',onclick:()=>{expr.value=h.e;angleMode=h.m;syncMode();calculate()}})))}
function syncMode(){deg.setAttribute('aria-pressed',String(angleMode==='DEG'));rad.setAttribute('aria-pressed',String(angleMode==='RAD'))}
deg.onclick=()=>{angleMode='DEG';syncMode()};rad.onclick=()=>{angleMode='RAD';syncMode()};
function press(act){
 if(act==='eq')return calculate();
 if(act==='clear'){expr.value='';res.textContent='0';status('Cleared.');return expr.focus()}
 if(act==='back'){const a=expr.selectionStart||0,b=expr.selectionEnd||a;if(a!==b)expr.setRangeText('',a,b,'end');else if(a>0)expr.setRangeText('',a-1,a,'end');return expr.focus()}
 if(act==='recip'){const s=expr.value.trim();expr.value=s?'1/('+s+')':'1/(';return expr.focus()}
 if(act==='mc'){memory=0;memLabel.textContent='M: 0';return}
 if(act==='mr')return insert(format(memory));
 if(act==='mp'||act==='mm'){const v=calculate();if(v!==null){memory=finite(memory+(act==='mp'?v:-v));memLabel.textContent='M: '+format(memory)}return}
 if(act==='exp'){const a=expr.selectionStart==null?expr.value.length:expr.selectionStart,b=expr.selectionEnd==null?a:expr.selectionEnd,before=expr.value.slice(0,a);if(!/(?:\d\.?\d*|\.\d+)$/.test(before))return status('Enter a number before EXP.',true);expr.setRangeText('E',a,b,'end');return expr.focus()}
 insert(act);
}
function addKeys(target,keys){for(const [label,act,cls=''] of keys){const b=el('button',{type:'button',class:'button '+cls,text:label,'aria-label':label});b.onclick=()=>press(act);target.append(b)}}
addKeys(quick,[['sin','sin('],['cos','cos('],['tan','tan('],['log','log('],['ln','ln('],['√','sqrt('],['x²','^2'],['xʸ','^'],['π','pi'],['e','e']]);
addKeys(advancedGrid,[['asin','asin('],['acos','acos('],['atan','atan('],['∛','cbrt('],['abs','abs('],['1/x','recip'],['!','!'],['EXP','exp']]);
addKeys(keypad,[['AC','clear','sc-op'],['⌫','back','sc-op'],['%','%','sc-op'],['÷','/','sc-op'],['×','*','sc-op'],['−','-','sc-op'],['+','+','sc-op'],['.','.'],['(', '('],[')',')'],['Ans','ans'],['=','eq','sc-eq']]);
addKeys(secondary,[['MC','mc'],['MR','mr'],['M+','mp'],['M−','mm']]);
expr.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();calculate()}else if(e.key==='Escape'){e.preventDefault();press('clear')}});
setupStatus(root);notice(root,'Strict scientific parser with DEG/RAD modes. Memory and history stay on this device for the current page session only.');