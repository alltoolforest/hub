import { replanDependentInsertions } from '../src/dependent-insert-replan.js';

function assert(condition,message){
  if(!condition)throw new Error(message||'Assertion failed');
}
function same(actual,expected,message){
  const a=JSON.stringify(actual),b=JSON.stringify(expected);
  if(a!==b)throw new Error(`${message||'Values differ'}\nexpected ${b}\nactual   ${a}`);
}
function insert(id,pageIndex=0){
  return {id,kind:'INSERT_TEXT',pageIndex,x:100,y:600,maxWidth:250,fontSize:12,reflowPlan:{seed:id},replacementUnicode:id};
}

export async function runDependentInsertReplanRegression(){
  const cases=[];
  const record=async(name,fn)=>{await fn();cases.push({name,ok:true});};

  await record('earlier insert replans each later same-page insert in order',async()=>{
    const a=insert('a'),b=insert('b'),other=insert('other',1),c=insert('c');
    const plannerCalls=[];
    const previewTransactions=async list=>({
      bytes:new Uint8Array([1,2,3]),
      reflowMetrics:list.map((tx,index)=>({transactionId:tx.id,pageIndex:tx.pageIndex,sequenceIndex:index,delta:tx.pageIndex===0?10:5})),
    });
    const result=await replanDependentInsertions({
      transactions:[a,b,other,c],targetId:'a',patch:{x:150,y:550,maxWidth:220},blocks:[],
      geometryForPage:()=>({width:595,height:842,rotation:0}),previewTransactions,
      planner:input=>{plannerCalls.push(input.existingMetrics.map(metric=>metric.transactionId));return {enabled:true,prior:input.existingMetrics.map(metric=>metric.transactionId)};},
    });
    assert(result.replannedCount===3,'Expected target plus two same-page dependents to be replanned');
    same(plannerCalls,[[],['a'],['a','b']],'Dependent metric order changed');
    assert(result.transactions[0].x===150&&result.transactions[0].y===550&&result.transactions[0].maxWidth===220,'Moved geometry was not preserved');
    same(a.reflowPlan,{seed:'a'},'Source transaction was mutated');
    same(result.transactions[2].reflowPlan,{seed:'other'},'Other-page insert should remain unchanged');
  });

  await record('intervening non-insert flow metrics are included before next dependent',async()=>{
    const a=insert('a'),b=insert('b');
    const replace={id:'replace',kind:'REPLACE_TEXT',pageIndex:0,blockId:'block-1'};
    const calls=[];
    await replanDependentInsertions({
      transactions:[a,replace,b],targetId:'a',patch:{x:151},blocks:[],
      geometryForPage:()=>({width:595,height:842,rotation:0}),
      previewTransactions:async list=>({
        bytes:new Uint8Array([9]),
        reflowMetrics:list.map((tx,index)=>({transactionId:tx.id,pageIndex:tx.pageIndex,sequenceIndex:index,delta:tx.kind==='REPLACE_TEXT'?7:10})),
      }),
      planner:input=>{calls.push(input.existingMetrics.map(metric=>metric.transactionId));return {enabled:true};},
    });
    same(calls,[[],['a','replace']],'A later insert did not see intervening flow metrics');
  });

  await record('later deletion dependency fails closed before move replanning',async()=>{
    const a=insert('a');
    const deletion={id:'delete',kind:'REPLACE_TEXT',pageIndex:0,originalUnicode:'old line',replacementUnicode:'',block:{text:'old line'}};
    let code='';
    try{
      await replanDependentInsertions({
        transactions:[a,deletion],targetId:'a',patch:{x:145},blocks:[],
        geometryForPage:()=>({width:595,height:842,rotation:0}),
        previewTransactions:async()=>({bytes:new Uint8Array([1]),reflowMetrics:[]}),
        planner:()=>({enabled:true}),
      });
    }catch(error){code=error?.code||'';}
    assert(code==='MOVE_DEPENDENCY_CONTRACTION_UNSAFE','Later deletion should block geometry-changing move');
  });

  await record('generated expansion insert cannot be moved independently',async()=>{
    const generated={...insert('generated'),expandedFromBlockId:'block-1'};
    let code='';
    try{
      await replanDependentInsertions({transactions:[generated],targetId:'generated',geometryForPage:()=>({}),previewTransactions:async()=>({bytes:new Uint8Array([1]),reflowMetrics:[]})});
    }catch(error){code=error?.code||'';}
    assert(code==='MOVE_TRANSACTION_UNSAFE','Generated expansion insert should fail closed');
  });

  await record('later generated expansion dependency fails closed',async()=>{
    const a=insert('a');
    const generated={...insert('generated'),expandedFromBlockId:'block-1'};
    let code='';
    try{
      await replanDependentInsertions({
        transactions:[a,generated],targetId:'a',patch:{x:130},blocks:[],
        geometryForPage:()=>({width:595,height:842,rotation:0}),
        previewTransactions:async list=>({bytes:new Uint8Array([1]),reflowMetrics:list.map((tx,index)=>({transactionId:tx.id,pageIndex:tx.pageIndex,sequenceIndex:index,delta:10}))}),
        planner:()=>({enabled:true}),
      });
    }catch(error){code=error?.code||'';}
    assert(code==='MOVE_DEPENDENCY_EXPANDED_INSERT_UNSAFE','Later generated paragraph should block dependency move');
  });

  await record('cross-page cascade through another added page fails closed',async()=>{
    const a=insert('a'),b=insert('b'),page2=insert('page2',1);
    let code='';
    try{
      await replanDependentInsertions({
        transactions:[a,b,page2],targetId:'a',patch:{x:140},blocks:[],
        geometryForPage:()=>({width:595,height:842,rotation:0}),
        previewTransactions:async list=>({
          bytes:new Uint8Array([1]),
          reflowMetrics:list.filter(tx=>tx.pageIndex===0).map((tx,index)=>({transactionId:tx.id,pageIndex:0,sequenceIndex:index,delta:10,cascadedPageCount:tx.id==='a'?1:0,appendedPageCount:0})),
        }),
        planner:()=>({enabled:true,cascadePages:[{pageIndex:1}]}),
      });
    }catch(error){code=error?.code||'';}
    assert(code==='MOVE_CROSS_PAGE_DEPENDENCY_UNSAFE','Cross-page added-text dependency should fail closed');
  });

  await record('preview safety failure aborts without mutating originals',async()=>{
    const a=insert('a'),b=insert('b');
    const before=JSON.stringify([a,b]);
    let code='';
    try{
      await replanDependentInsertions({
        transactions:[a,b],targetId:'a',patch:{x:175},blocks:[],geometryForPage:()=>({width:595,height:842,rotation:0}),
        previewTransactions:async list=>{if(list.length===2)throw Object.assign(new Error('unsafe'),{code:'STRUCTURED_VECTOR_REFLOW_UNSAFE'});return {bytes:new Uint8Array([1]),reflowMetrics:[]};},
        planner:()=>({enabled:true}),
      });
    }catch(error){code=error?.code||'';}
    assert(code==='STRUCTURED_VECTOR_REFLOW_UNSAFE','Expected existing safety error to propagate');
    assert(JSON.stringify([a,b])===before,'Failed replan mutated live transactions');
  });

  return cases;
}

if(typeof document!=='undefined'){
  runDependentInsertReplanRegression().then(cases=>{
    document.dispatchEvent(new CustomEvent('task7-regression-complete',{detail:{ok:true,cases}}));
  }).catch(error=>{
    document.dispatchEvent(new CustomEvent('task7-regression-complete',{detail:{ok:false,error:String(error?.stack||error)}}));
  });
}
