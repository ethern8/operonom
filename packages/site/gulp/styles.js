import { dest, src } from 'gulp';
import sass from 'gulp-dart-sass';
import postcss from 'gulp-postcss';
import autoprefixer from 'autoprefixer';
import { config } from '../gulpfile.esm.js';

const plugins = [
    autoprefixer
];
export function styles() {
    return src(config.source.styles)
        .pipe( sass( ))
        .pipe( postcss( plugins ) )
        .pipe( dest(config.destination.styles));
}