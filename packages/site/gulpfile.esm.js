import { series } from 'gulp';
import build from './gulp/build.js';
import clean from './gulp/clean.js';
import server from './gulp/server.js';
import watch from './gulp/watch.js';

export const config = {
    server:{
        name:"ethern8",
        baseDir:"dest/"
    },
    rollup: {
		input: 'src/scripts/index.js',
		output: 'dest/scripts/bundle.js',
		bundleFormat: 'iife',
	},
    source:{
        assets:"src/assets/",
        styles:"src/styles/**/*.scss",
        markup:"src/**/*.njk"
    },
    destination:{
        assets:"dest/assets/",
        markup:"dest",
        scripts: "dest/scripts/",
        styles:"dest/styles/",
    }
}

export const dev = series(clean, build, watch, server);
// export const dev = series(clean, build, server);
export default series(clean, build);