// 解析 EMF 并打印所有 record 类型
const fs=require('fs');
const path=require('path');
global.window={};
require('../out/metafileParser.browser.js');
const MetafileParser=window.MetafileParser;
const fn=process.argv[2];
const data=new Uint8Array(fs.readFileSync(fn));
const p=new MetafileParser(data);
const r=p.parse();
console.log('fileType:',p.fileType,'totalRecords:',r.records.length);
const cnt={};
for(const rec of r.records){
  const t=rec.type||rec.recordType||'?';
  cnt[t]=(cnt[t]||0)+1;
}
const entries=Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
for(const [t,c] of entries) console.log(c.toString().padStart(4),t);
