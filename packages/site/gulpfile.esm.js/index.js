import { series } from 'gulp';
import build from './build';
import clean from './clean';
import { server } from './server';
import watch from './watch';

export const config = {
    server:{
        name:"ethern8",
        baseDir:"dest/"
    },
    source:{
        assets:"src/assets/",
        styles:"src/styles/**/*.scss",
        markup:"src/**/*.njk"
    },
    destination:{
        assets:"dest/assets/",
        markup:"dest",
        styles:"dest/styles/",
    }
}

export default series(clean, build, watch, server);