// CSV Task 3: bounded page window, without copying or changing source rows.
export const PAGE_SIZE=50;
export function pageWindow(totalRows,hasHeader,page){
 const first=hasHeader?1:0;
 const count=Math.max(0,totalRows-first);
 const pages=Math.max(1,Math.ceil(count/PAGE_SIZE));
 const current=Math.min(Math.max(0,Number.isFinite(page)?Math.floor(page):0),pages-1);
 const from=first+current*PAGE_SIZE;
 const to=Math.min(totalRows,from+PAGE_SIZE);
 return {first,count,pages,page:current,from,to};
}
