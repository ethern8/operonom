/**
 * RELATIVE ROOT 
 * Regexes file paths to make them relative to the root of the static site
 */
import { Transform } from 'stream';
import path from 'path';
// import slash from 'slash';
import { config } from '../../gulpfile.esm.js';
 
function computeRelativePath(from, to) {
    return (path.relative(from, to) || '.') + '/';
}
 
 function fixSourceSet(source, relativeRoot){
     let srcsetRegex = /srcset=["']?\s*((?:.(?!["']?\s+(?:\S+)=|\s*\/?[>"']))+\s)?.*\s?.*["']?\s*/g;
     let imagePathRegex = /[^,"'=\s]+\.(jpe?g|png|gif)/g;
     let firstSlashRegex = /^(.*?)\//g;
     let srcSetMatch = source.match(srcsetRegex);
     if(!srcSetMatch || srcSetMatch.length < 1){
         return source;
     } else {
         let replacements = {};
         srcSetMatch.forEach(srcset => {
             let matches = srcset.match(imagePathRegex)
             if(matches){
                 matches.forEach(imgPath => {
                     let newPath = imgPath.replace(firstSlashRegex, relativeRoot);
                     replacements[`${imgPath}`] = newPath;
                 }); 
             }
         });
         
         var re = new RegExp(Object.keys(replacements).join('|'),'g');
         return source.replace(re, function(matched){
             return replacements[matched];
         });
     }
 }
 
 function relativize(source, relativeRoot){
     let src = fixSourceSet(source, relativeRoot);
 
     return src
         .replace(/(href=["'])\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(["']href["']:\s?["'])\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(poster=["'])\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(src=["'])\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(assetpath=["'])\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(url=["'])\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(url\(['"]?)\/(?!\/)/g, '$1' + relativeRoot)
         .replace(/(content=["']0;url=)\/(?!\/)/g, '$1' + relativeRoot);
 }
 
 export default function relativeRoot(){
     let transform = new Transform({objectMode:true});
     transform._transform = function(file, enc, cb){
         const relativeRoot = computeRelativePath(file.dirname, `${process.cwd()}/${config.server.baseDir}/`);
         const replacedFilepathsStr = relativize( file.contents.toString(), relativeRoot);
         file.contents = Buffer.from(replacedFilepathsStr, 'utf8');
         this.push(file);
         cb();
     };
     return transform;
 }
 