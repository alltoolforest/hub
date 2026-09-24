export class History{
  constructor(limit=50){this.limit=limit;this.undoStack=[];this.redoStack=[];}
  push(entry){this.undoStack.push(entry);if(this.undoStack.length>this.limit)this.undoStack.shift();this.redoStack=[];}
  undo(){const e=this.undoStack.pop();if(!e)return false;e.undo();this.redoStack.push(e);return true;}
  redo(){const e=this.redoStack.pop();if(!e)return false;e.redo();this.undoStack.push(e);return true;}
  get state(){return {canUndo:this.undoStack.length>0,canRedo:this.redoStack.length>0};}
}
