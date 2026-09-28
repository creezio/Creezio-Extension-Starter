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

test('published SDK 1.1 must expose both delivery entries; 1.0 remains supported',()=>{
  assert.equal(assertSupportedSdk(sdk('1.0.0')), '1.0.0');
  assert.equal(assertSupportedSdk(sdk('1.1.0',delivery)), '1.1.0');
  assert.throws(()=>assertSupportedSdk(sdk('1.1.0',{'./delivery/context':delivery['./delivery/context']})),
    /delivery\/transport/);
  assert.throws(()=>assertSupportedSdk(sdk('1.2.0',delivery)),/supported/);
  assert.equal(sdkArchiveName('1.1.0'),'creezio-sdk-1.1.0.tgz');
});
