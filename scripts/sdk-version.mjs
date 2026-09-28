export const supportedSdkVersions=Object.freeze(['1.0.0','1.1.0','1.2.0']);

export function assertSupportedSdk(sdk){
  if(sdk?.name!=='@creezio/sdk'||!supportedSdkVersions.includes(sdk.version))
    throw new Error('Install a supported, verified Creezio SDK package.');
  if(sdk.version==='1.1.0'||sdk.version==='1.2.0'){
    for(const [name,stem] of [['./delivery/context','context'],['./delivery/transport','transport']]){
      const entry=sdk.exports?.[name];
      if(entry?.types!==`./dist/types/sdk/delivery/${stem}.d.ts`
        ||entry?.import!==`./dist/esm/delivery/${stem}.js`)
        throw new Error(`SDK 1.1.0 lacks the public ${name} export.`);
    }
  }
  if(sdk.version==='1.2.0'){
    const entry=sdk.exports?.['./operations/command-journal'];
    if(entry?.types!=='./dist/types/sdk/operations/command-journal.d.ts'
      ||entry?.import!=='./dist/esm/operations/command-journal.js')
      throw new Error('SDK 1.2.0 lacks the public command journal export.');
  }
  return sdk.version;
}

export function sdkArchiveName(version){
  if(!supportedSdkVersions.includes(version))throw new Error('Unsupported Creezio SDK version.');
  return `creezio-sdk-${version}.tgz`;
}
