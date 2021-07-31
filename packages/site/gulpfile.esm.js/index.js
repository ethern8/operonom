import { series } from 'gulp';
import build from './build';
import { server } from './server';

export const config = {
    server:{
        name:"ethern8",
        baseDir:"dest/"
    },
    source:{
        styles:"src/styles/**/*.scss",
        markup:"src/**/*.njk"
    },
    destination:{
        assets:"dest/assets/",
        markup:"dest",
        styles:"dest/styles/",
    }
}

export default series(build, server);