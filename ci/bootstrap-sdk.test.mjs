import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fetchVerifiedArchive,validatePin} from './bootstrap-sdk.mjs';

const url='https://github.com/creezio/Creezio-D1R2/releases/download/sdk-v1.0.0/creezio-sdk-1.0.0.tgz';
const bytes=Buffer.from('synthetic SDK archive');
const pin={schemaVersion:1,url,integrity:`sha256-${createHash('sha256').update(bytes).digest('hex')}`};
const response=(body,headers={})=>{
  const result=new Response(body,{status:200,headers});
  Object.defineProperty(result,'url',{value:url});
  return result;
};

test('SDK pin accepts only the versioned public asset and full SHA-256',()=>{
  assert.deepEqual(validatePin(pin),pin);
  assert.throws(()=>validatePin({...pin,url:'https://github.com/creezio/Creezio-D1R2/releases/latest/download/creezio-sdk-1.0.0.tgz'}));
  assert.throws(()=>validatePin({...pin,integrity:'sha256-short'}));
  assert.throws(()=>validatePin({...pin,token:'not-allowed'}));
});

test('SDK download checks bytes and rejects both declared and streamed oversize',async()=>{
  assert.deepEqual(await fetchVerifiedArchive(pin,async()=>response(bytes),bytes.length),bytes);
  await assert.rejects(fetchVerifiedArchive(pin,async()=>response(Buffer.from('wrong')),bytes.length));
  await assert.rejects(fetchVerifiedArchive(pin,async()=>response(bytes,
    {'content-length':String(bytes.length+1)}),bytes.length));
  await assert.rejects(fetchVerifiedArchive(pin,async()=>response(bytes),bytes.length-1));
});
