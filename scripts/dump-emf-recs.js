// 解析 EMF 并打印所有 record 的关键内容
const fs=require('fs');
const path=require('path');
global.window={};
require('../out/metafileParser.browser.js');
const MetafileParser=window.MetafileParser;
const fn=process.argv[2];
const data=new Uint8Array(fs.readFileSync(fn));
const p=new MetafileParser(data);
const r=p.parse();
const only=process.argv[3];
for(let i=0;i<r.records.length;i++){
  const rec=r.records[i];
  if(!rec||!rec.data)continue;
  const t=rec.type||rec.recordType||rec.recordTypeNumber;
  if(only && !only.split(',').includes(String(t)))continue;
  const d=rec.data;
  // 提取前 8 个 dword
  const dwords=[];
  for(let k=0;k<Math.min(8,d.length/4);k++){
    const v=(d[k*4]|(d[k*4+1]<<8)|(d[k*4+2]<<16)|(d[k*4+3]<<24))>>>0;
    dwords.push(v);
  }
  console.log(i, 'type='+t, 'size='+rec.size, 'dwords=',dwords.join(' '));
}
