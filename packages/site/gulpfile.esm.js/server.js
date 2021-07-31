import browserSync from "browser-sync";
import { config } from ".";

export function server(){
    const bSync = browserSync.create(config.server.name);
    bSync.init({
        open: false,
        server:{
            baseDir:config.server.baseDir
        }
    });
}