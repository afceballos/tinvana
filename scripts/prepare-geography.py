"""Build an offline, partitioned geography snapshot; never runs during requests."""
import gzip, hashlib, json, pathlib, shutil, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
source=root/'.tools/world-geo.json.gz'
data=json.load(gzip.open(source,'rt',encoding='utf-8'))
target=root/'backend/resources/geo/world'
target.mkdir(exist_ok=True)
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
countries=[]
for country in data:
    iso=country['iso2']
    countries.append({'id':iso,'name':country['translations'].get('es') or country['name']})
    if iso=='CO':continue # Colombia remains a separate DANE dataset.
    states=[{'id':str(s['id']),'name':s['name'],'cities':[{'id':str(c['id']),'name':c['name']} for c in s['cities']]} for s in country['states']]
    write(target/(iso+'.json'),states)
write(target/'countries.json',countries)
write(target/'source.json',{'source':'https://github.com/dr5hn/countries-states-cities-database','release':'v4.0-export.51','releaseDate':'2026-10-12','license':'ODbL-1.0','inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'transformation':'Only ISO2 country code, source IDs, Spanish country names and subdivision/city names. CO is served separately from DANE.','countries':len(countries),'citiesExcludingColombia':sum(len(s['cities']) for c in data if c['iso2']!='CO' for s in c['states'])})
shutil.copyfile(root/'.tools/world-geo-LICENSE',target/'LICENSE.txt')
with zipfile.ZipFile(target/'world.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(target.glob('*.json')):archive.write(path,path.name)
    archive.write(target/'LICENSE.txt','LICENSE.txt')
print('Geography snapshot generated:',len(countries),'countries/territories;',sum(p.stat().st_size for p in target.glob('*.json')),'bytes total, split by country.')
