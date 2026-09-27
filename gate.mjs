import {runSuite,SUITES} from './ci/run-suite.mjs';
const results=SUITES.map(runSuite);
console.log(JSON.stringify({profile:'extension-starter',results,
  limits:['These suites do not replace the independent installed-package, browser, Sites or Cloudflare recipes.']},null,2));
