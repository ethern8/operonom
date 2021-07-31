import { src, dest } from "gulp";
import data from 'gulp-data';
import { Transform } from "stream";
import njkEnv from './utils/nunjucksEnv';
import nunjucksRender from 'gulp-nunjucks-render';
import { config } from ".";
import relativeRoot from "./utils/relativeRoot";

function getTemplateData(){
    return {};
}

function injectPageData(){
    let transformStream = new Transform({objectMode: true});
    transformStream._transform = function(file, enc, cb){
        file.data.file = file;
        this.push(file);
        cb();
    };
    return transformStream;
}

export function markup(){
    return src(config.source.markup)
        .pipe( data( getTemplateData() ) )
        .pipe( injectPageData() )
        .pipe( nunjucksRender( njkEnv ) )
        .pipe( dest(config.destination.markup) )
        .pipe( relativeRoot() ) // fix relative paths
        .pipe( dest(config.destination.markup) )
}