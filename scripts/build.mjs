import {readFileSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import {validateModule} from '@creezio/sdk/contracts/node';
import {assertSupportedSdk} from './sdk-version.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
if(git('status','--porcelain','--untracked-files=all').toString().trim())throw new Error('Commit the reviewed source before building its distributable manifest.');
const revision=git('rev-parse','HEAD').toString().trim();
const sourceIntegrity='sha256-'+createHash('sha256').update(git('archive','--format=tar',revision)).digest('hex');
const sdk=JSON.parse(readFileSync(fileURLToPath(import.meta.resolve('@creezio/sdk/package.json')),'utf8'));
if(assertSupportedSdk(sdk)!=='1.2.0')throw new Error('Module 0.1.4 requires SDK 1.2.0.');
for(const name of ['dist','.quality']){
 const target=path.join(root,name);const stat=lstatSync(target,{throwIfNoEntry:false});
 if(stat&&(!stat.isDirectory()||stat.isSymbolicLink()))throw new Error('Invalid build directory.');
 mkdirSync(target,{recursive:true});
}
const configPath=path.join(root,'tsconfig.json');
const raw=ts.readConfigFile(configPath,ts.sys.readFile);
if(raw.error)throw new Error(ts.flattenDiagnosticMessageText(raw.error.messageText,'\n'));
const config=ts.parseJsonConfigFileContent(raw.config,ts.sys,root,undefined,configPath);
const program=ts.createProgram(config.fileNames,config.options);
const diagnostics=[...config.errors,...ts.getPreEmitDiagnostics(program)];
if(diagnostics.length){
 process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>root,getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));
 process.exitCode=1;
}else{
 const emitted=program.emit();if(emitted.emitSkipped||emitted.diagnostics.length)throw new Error('Compilation did not complete.');
 execFileSync(process.execPath,['module/generate-manifest.mjs'],{cwd:root,windowsHide:true,stdio:'inherit',
   env:{...process.env,CREEZIO_SOURCE_REVISION:revision,CREEZIO_SOURCE_INTEGRITY:sourceIntegrity}});
 const manifest=JSON.parse(readFileSync(path.join(root,'module/manifest.json'),'utf8'));
 const checked=validateModule(manifest);
 if(checked.errors.length)throw new Error(JSON.stringify(checked.errors,null,2));
 const output={schemaVersion:1,sourceRevision:revision,sourceIntegrity,sdk:{name:sdk.name,version:sdk.version},
  runtimeFiles:manifest.packaging.runtime.files,validation:checked.metrics};
 writeFileSync(path.join(root,'.quality/build.json'),JSON.stringify(output,null,2)+'\n');
 console.log(JSON.stringify({status:'built',sourceRevision:revision,sourceIntegrity,sdk:sdk.version,metrics:checked.metrics}));
}
