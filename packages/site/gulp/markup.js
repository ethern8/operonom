import { src, dest } from "gulp";
import fs from 'fs';
import data from 'gulp-data';
import { Transform } from "stream";
import njkEnv from './utils/nunjucksEnv.js';
import nunjucksRender from 'gulp-nunjucks-render';
import { config } from "../gulpfile.esm.js";
import relativeRoot from "./utils/relativeRoot.js";

function getTemplateData(){
    const file = fs.readFileSync('node_modules/@ethern8/tokens/build/json/icons.json');
    const data = JSON.parse(file);
    return data;
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