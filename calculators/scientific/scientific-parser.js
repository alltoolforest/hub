const MAXLEN=500,MAXDEPTH=60,MAXFACT=170;
const FUNCTIONS=['asin','acos','atan','sqrt','cbrt','sin','cos','tan','log','ln','abs'];
function finite(n){if(!Number.isFinite(n))throw Error('Result is outside the supported numeric range.');return n}
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
export function evaluateScientific(expression,mode='DEG',ans=0){
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
export function formatScientific(n){if(!Number.isFinite(n))throw Error('Result is outside the supported numeric range.');if(Object.is(n,-0)||Math.abs(n)<1e-15)n=0;const a=Math.abs(n);if(a!==0&&(a>=1e15||a<1e-12))return n.toExponential(12).replace(/\.0+e/,'e').replace(/(\.\d*?[1-9])0+e/,'$1e');return n.toLocaleString(undefined,{maximumSignificantDigits:15,useGrouping:false})}
