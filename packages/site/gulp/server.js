import browserSync from "browser-sync";
import { config } from "../gulpfile.esm.js";

export default function server(cb){
    const bSync = browserSync.create(config.server.name);
    bSync.init({
        open: false,
        server:{
            baseDir:config.server.baseDir
        }
    });
    cb();
}