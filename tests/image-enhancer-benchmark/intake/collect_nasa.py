"""Collect review candidates only; never admit/lock or fabricate photo labels."""
import argparse, concurrent.futures, hashlib, io, json, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image, ImageOps

POLICY='https://www.nasa.gov/nasa-brand-center/images-and-media/'
QUERIES=[('portrait',50),('crew portrait',15),('laboratory',15),('aircraft',15),('historic facility',15),('landscape',15)]

def safe_url(url):
    u=urllib.parse.urlsplit(url)
    if u.scheme!='https' or u.hostname not in {'images-api.nasa.gov','images-assets.nasa.gov'} or u.username or u.password:
        raise ValueError('Only official HTTPS NASA image hosts allowed')
    return url

class RedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        safe_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def fetch(url,limit):
    request=urllib.request.Request(safe_url(url),headers={'User-Agent':'AllToolForest-benchmark-intake/1.0'})
    with urllib.request.build_opener(RedirectHandler()).open(request,timeout=45) as r:
        data=r.read(limit+1)
    if len(data)>limit:raise ValueError('Download size limit exceeded')
    return data

def sha(data):return hashlib.sha256(data).hexdigest()

def fingerprint(image):
    gray=ImageOps.grayscale(image).resize((9,8));p=list(gray.get_flattened_data() if hasattr(gray,'get_flattened_data') else gray.getdata())
    return f'{sum((p[y*9+x]>p[y*9+x+1]) << (y*8+x) for y in range(8) for x in range(8)):016x}'

def collect_one(job,root):
    index,item,query=job;meta=item['data'][0];asset=next(x['href'] for x in item.get('links',[]) if x.get('rel')=='preview')
    raw=fetch(asset,12_000_000)
    Image.MAX_IMAGE_PIXELS=32_000_000
    with Image.open(io.BytesIO(raw)) as im:
        im.load()
        if im.width<256 or im.height<256:raise ValueError('Candidate preview too small')
        if im.format not in {'JPEG','PNG'}:raise ValueError('Unsupported source type')
        ext='jpg' if im.format=='JPEG' else 'png';dims=[im.width,im.height];phash=fingerprint(im)
        thumb=ImageOps.exif_transpose(im).convert('RGB');thumb.thumbnail((224,224))
        buffer=io.BytesIO();thumb.save(buffer,format='JPEG',quality=85)
    ident=f'nasa-{index:03d}';path=f'images/{ident}.{ext}'
    (root/path).write_bytes(raw);(root/'thumbnails'/f'{ident}.jpg').write_bytes(buffer.getvalue())
    return {'id':ident,'sourceGroup':meta['nasa_id'],'sourcePage':'https://images.nasa.gov/details/'+urllib.parse.quote(meta['nasa_id'],safe=''),'assetUrl':asset,'query':query,'path':path,'sha256':sha(raw),'bytes':len(raw),'dimensions':dims,'dhash':phash,'metadata':meta,'intakeStatus':'pending-human-review','rights':{'status':'pending','basis':'NASA public imagery policy; item-level credit and restrictions require review','evidence':POLICY,'visibility':'private'},'labels':{'cohort':None,'severity':None,'recoverability':None,'tags':[],'split':None},'sourceNote':'NASA API preview bytes, not necessarily camera original; pre-existing compression/resizing must be assessed.'}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--out',required=True);ap.add_argument('--target',type=int,default=100);args=ap.parse_args()
    root=Path(args.out).resolve()
    repo=Path(__file__).resolve().parents[3]
    if root==repo or repo in root.parents: raise ValueError('Photo intake must stay outside the repository')
    if args.target<1 or args.target>100: raise ValueError('Target must be 1–100')
    root.mkdir(parents=True,exist_ok=True)
    if (root/'intake.json').exists():raise ValueError('Refusing to overwrite an existing intake')
    for d in ['images','thumbnails','search-records']:(root/d).mkdir(exist_ok=True)
    items=[];seen=set();searches=[]
    for query,count in QUERIES:
        url='https://images-api.nasa.gov/search?'+urllib.parse.urlencode({'q':query,'media_type':'image','page_size':100})
        content=fetch(url,8_000_000);filename=query.replace(' ','-')+'.json';(root/'search-records'/filename).write_bytes(content)
        selected=0
        for item in json.loads(content).get('collection',{}).get('items',[]):
            m=(item.get('data') or [{}])[0];ident=m.get('nasa_id');title=m.get('title','').lower()
            if not ident or ident in seen or not any(x.get('rel')=='preview' for x in item.get('links',[])):continue
            if any(x in title for x in ['illustration','artist concept','artist’s concept','artist\'s concept','logo','rendering','infographic']):continue
            seen.add(ident);items.append((len(items)+1,item,query));selected+=1
            if selected>=count:break
        searches.append({'query':query,'url':url,'metadataSha256':sha(content),'selected':selected})
    records=[];failures=[];hashes=set()
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for job,result in zip(items,pool.map(lambda j: attempt(j,root),items)):
            if result.get('error'):failures.append(result);continue
            if result['sha256'] in hashes:failures.append({'id':result['id'],'error':'Exact duplicate bytes'});continue
            hashes.add(result['sha256']);records.append(result)
    # Stable order; surplus remains documented, not silently counted as admitted.
    chosen=records[:args.target]
    near=[]
    for i,a in enumerate(chosen):
        for b in chosen[i+1:]:
            distance=(int(a['dhash'],16)^int(b['dhash'],16)).bit_count()
            if distance<=6:near.append({'a':a['id'],'b':b['id'],'distance':distance,'review':'pending; not proof of duplicate'})
    report={'version':1,'state':'candidate-intake-only','admittedSources':0,'targetCandidates':args.target,'candidates':chosen,'searches':searches,'failedOrDuplicateDownloads':failures,'surplusIds':[r['id'] for r in records[args.target:]],'nearDuplicateReview':near,'humanDiversityReview':'pending','acceptanceCorpusLocked':False,'limitations':['Single institutional source pool; not population representative','Not a substitute for real damaged old photos','No demographic classification inferred','No split/quality/permission review fabricated','Preview downloads may already be processed or compressed']}
    (root/'intake.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'downloaded':len(records),'candidateCount':len(chosen),'admitted':0,'failures':len(failures),'nearDuplicatePairs':len(near)}),flush=True)

def attempt(job,root):
    try:
        result=collect_one(job,root);print('downloaded '+result['id'],flush=True);return result
    except Exception as e:return {'index':job[0],'error':str(e)}

if __name__=='__main__':main()
