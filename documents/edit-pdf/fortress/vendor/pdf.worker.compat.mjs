function ensurePdfjsRuntimeCompat(){
  if(typeof Map.prototype.getOrInsert!=='function'){
    Object.defineProperty(Map.prototype,'getOrInsert',{configurable:true,writable:true,value:function(key,defaultValue){
      if(this.has(key))return this.get(key);
      this.set(key,defaultValue);
      return defaultValue;
    }});
  }
  if(typeof Map.prototype.getOrInsertComputed!=='function'){
    Object.defineProperty(Map.prototype,'getOrInsertComputed',{configurable:true,writable:true,value:function(key,callback){
      if(typeof callback!=='function')throw new TypeError('callback must be a function');
      if(this.has(key))return this.get(key);
      const value=callback(key);
      this.set(key,value);
      return value;
    }});
  }
  if(typeof Math.sumPrecise!=='function'){
    Object.defineProperty(Math,'sumPrecise',{configurable:true,writable:true,value:function(numbers){
      if(numbers==null||typeof numbers[Symbol.iterator]!=='function')throw new TypeError('numbers must be iterable');
      const partials=[];
      let count=0,positiveInfinity=false,negativeInfinity=false;
      for(const value of numbers){
        if(typeof value!=='number')throw new TypeError('Math.sumPrecise accepts numbers only');
        count++;
        if(Number.isNaN(value))return NaN;
        if(value===Infinity){positiveInfinity=true;continue;}
        if(value===-Infinity){negativeInfinity=true;continue;}
        let x=value,i=0;
        for(let j=0;j<partials.length;j++){
          let y=partials[j];
          if(Math.abs(x)<Math.abs(y)){const tmp=x;x=y;y=tmp;}
          const hi=x+y;
          const lo=y-(hi-x);
          if(lo!==0)partials[i++]=lo;
          x=hi;
        }
        partials.length=i;
        partials.push(x);
      }
      if(positiveInfinity&&negativeInfinity)return NaN;
      if(positiveInfinity)return Infinity;
      if(negativeInfinity)return -Infinity;
      if(count===0)return -0;
      let total=0;
      for(let i=partials.length-1;i>=0;i--)total+=partials[i];
      return total;
    }});
  }
}

ensurePdfjsRuntimeCompat();
await import('./pdf.worker.mjs');
