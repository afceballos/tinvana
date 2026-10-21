import {mkdir,copyFile} from 'node:fs/promises';
const destination=new URL('../backend/public/brand/phone/',import.meta.url);await mkdir(destination,{recursive:true});
for(const file of ['flags.webp','flags@2x.webp'])await copyFile(new URL('../node_modules/intl-tel-input/dist/img/'+file,import.meta.url),new URL(file,destination));
await copyFile(new URL('../node_modules/intl-tel-input/LICENSE',import.meta.url),new URL('LICENSE.txt',destination));
