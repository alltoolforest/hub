"""Rebuild candidate records from captured metadata/bytes, with explicit exclusions."""
import argparse,io,json
from pathlib import Path
from PIL import Image
from collect_nasa import QUERIES,POLICY,sha,fingerprint

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--intake',required=True);ap.add_argument('--exclusions',required=True);args=ap.parse_args()
    root=Path(args.intake);ex=json.loads(Path(args.exclusions).read_text())
    excluded={r['id']:r['reason'] for r in ex['excluded']};seen=set();jobs=[]
    # Reproduce the exact recorded query selection; never redownload or relabel damage.
    for query,count in QUERIES:
        content=json.loads((root/'search-records'/(query.replace(' ','-')+'.json')).read_text());selected=0
        for item in content['collection']['items']:
            m=(item.get('data') or [{}])[0];ident=m.get('nasa_id');title=m.get('title','').lower()
            if not ident or ident in seen or not any(x.get('rel')=='preview' for x in item.get('links',[])):continue
            if any(x in title for x in ['illustration','artist concept','artist’s concept','artist\'s concept','logo','rendering','infographic']):continue
            seen.add(ident);jobs.append((len(jobs)+1,item,query));selected+=1
            if selected>=count:break
    previous=json.loads((root/'intake.json').read_text()) if (root/'intake.json').exists() else {
        'version':1,'state':'candidate-intake-only','admittedSources':0,
        'recoveredInterruptedDownload':True,'acceptanceCorpusLocked':False,
        'humanDiversityReview':'pending',
        'limitations':['Single institutional source pool; not population representative',
        'Not a substitute for genuinely damaged old photos',
        'No labels, split, permission clearance or human review inferred']}
    records=[];hashes=set();missing=[]
    for index,item,query in jobs:
        ident=f'nasa-{index:03d}';paths=list((root/'images').glob(ident+'.*'))
        if len(paths)!=1:missing.append(ident);continue
        path=paths[0];raw=path.read_bytes();digest=sha(raw)
        if ident in excluded:continue
        if digest in hashes:excluded[ident]='Exact duplicate bytes';continue
        hashes.add(digest);m=item['data'][0]
        with Image.open(io.BytesIO(raw)) as im:dims=[im.width,im.height];dh=fingerprint(im)
        import urllib.parse
        records.append({'id':ident,'sourceGroup':m['nasa_id'],'sourcePage':'https://images.nasa.gov/details/'+urllib.parse.quote(m['nasa_id'],safe=''),'assetUrl':next(x['href'] for x in item['links'] if x.get('rel')=='preview'),'query':query,'path':'images/'+path.name,'sha256':digest,'bytes':len(raw),'dimensions':dims,'dhash':dh,'metadata':m,'intakeStatus':'pending-human-review','rights':{'status':'pending','basis':'NASA public imagery policy; item-level credit and restrictions require review','evidence':POLICY,'visibility':'private'},'labels':{'cohort':None,'severity':None,'recoverability':None,'tags':[],'split':None},'sourceNote':'NASA preview; not necessarily original camera bytes.'})
    chosen=records[:100];near=[]
    for i,a in enumerate(chosen):
        for b in chosen[i+1:]:
            distance=(int(a['dhash'],16)^int(b['dhash'],16)).bit_count()
            if distance<=6:near.append({'a':a['id'],'b':b['id'],'distance':distance,'review':'pending; not proof of duplicate'})
    prior=root/'intake-unscreened.json'
    if prior.exists():raise ValueError('Screening already applied; do not overwrite prior evidence')
    (root/'intake-unscreened.json').write_text(json.dumps(previous,indent=2))
    previous.update({'candidates':chosen,'nearDuplicateReview':near,'surplusIds':[r['id'] for r in records[100:]],'visualScreening':{'reviewer':'assistant visual inspection; NOT human acceptance','excluded':excluded,'evidence':ex.get('evidence'),'missingDownloads':missing},'candidateCount':len(chosen)})
    (root/'intake.json').write_text(json.dumps(previous,indent=2));print(json.dumps({'candidates':len(chosen),'excluded':len(excluded),'nearDuplicatePairs':len(near),'missing':missing}))
if __name__=='__main__':main()
