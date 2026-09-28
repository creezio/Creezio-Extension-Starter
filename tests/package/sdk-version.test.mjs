import test from 'node:test';
import assert from 'node:assert/strict';
import {assertSupportedSdk,sdkArchiveName} from '../../scripts/sdk-version.mjs';

const sdk=(version,exports={})=>({name:'@creezio/sdk',version,exports});
const delivery={
  './delivery/context':{types:'./dist/types/sdk/delivery/context.d.ts',
    import:'./dist/esm/delivery/context.js'},
  './delivery/transport':{types:'./dist/types/sdk/delivery/transport.d.ts',
    import:'./dist/esm/delivery/transport.js'},
};

test('SDK 1.2 requires the public command journal alongside delivery entries',()=>{
  assert.equal(assertSupportedSdk(sdk('1.0.0')), '1.0.0');
  assert.equal(assertSupportedSdk(sdk('1.1.0',delivery)), '1.1.0');
  assert.throws(()=>assertSupportedSdk(sdk('1.1.0',{'./delivery/context':delivery['./delivery/context']})),
    /delivery\/transport/);
  const journal={'./operations/command-journal':{
    types:'./dist/types/sdk/operations/command-journal.d.ts',
    import:'./dist/esm/operations/command-journal.js'}};
  assert.equal(assertSupportedSdk(sdk('1.2.0',{...delivery,...journal})),'1.2.0');
  assert.throws(()=>assertSupportedSdk(sdk('1.2.0',delivery)),/command journal/);
  assert.equal(sdkArchiveName('1.1.0'),'creezio-sdk-1.1.0.tgz');
  assert.equal(sdkArchiveName('1.2.0'),'creezio-sdk-1.2.0.tgz');
});
