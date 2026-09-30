'use strict';

/* The browser entrypoint is the authority. This loader intentionally parses
 * index.html instead of copying a runtime list into QA. */
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
function entrypointModules(entrypoint=path.join(ROOT,'index.html')){
  const html=fs.readFileSync(entrypoint,'utf8');
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(m=>m[1]).filter(src=>/^runtime\/[^/]+\.js$/.test(src));
}
function loaderModules({omit=[],entrypoint}={}){
  const omissions=new Set(omit), all=entrypointModules(entrypoint);
  return all.filter(x=>!omissions.has(x));
}
function load({omit=[],entrypoint}={}){
  const modules=loaderModules({omit,entrypoint});
  for(const rel of modules)require(path.join(ROOT,rel));
  return modules;
}
module.exports={entrypointModules,loaderModules,load};
