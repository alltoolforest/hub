export function scalarBudget(PDF,fail){
  let total=0;
  return value=>{
    if(value instanceof PDF.PDFName){
      if(value.sizeInBytes()>4096)fail('scalar-resource-limit');
    }else if(value instanceof PDF.PDFString||value instanceof PDF.PDFHexString){
      const length=value.sizeInBytes();
      if(length>(value instanceof PDF.PDFHexString?2000002:1000002))fail('scalar-resource-limit');
      total+=length;if(total>32000000)fail('scalar-resource-limit');
    }
  };
}
