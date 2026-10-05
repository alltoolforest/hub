import { STARTER_STATE } from "./rework-task2-starter-pack.js";

export function confirmedTargetRoleItems(pack){
  return Object.freeze(
    Object.values(pack?.sections||{}).flat().filter(item=>
      item.state===STARTER_STATE.CONFIRMED&&item.source==="target_role"
    )
  );
}

export function assessTargetRoleChange(state,nextRole){
  const previous=state?.roleSelection||null;
  if(!previous||!nextRole||previous.id===nextRole.id){
    return Object.freeze({
      changesRole:false,
      requiresConfirmation:false,
      affected:Object.freeze([]),
    });
  }
  const affected=confirmedTargetRoleItems(state?.starterPack);
  return Object.freeze({
    changesRole:true,
    requiresConfirmation:affected.length>0,
    affected,
  });
}
