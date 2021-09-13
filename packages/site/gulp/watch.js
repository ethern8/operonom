import browserSync from "browser-sync";
import { series, watch } from "gulp";
import { config } from "../gulpfile.esm.js";
import assets from "./assets.js";
import { markup } from "./markup.js";
import { styles } from "./styles.js";

const getBrowserSyncAndReload = (cb) => {
    const bSyncInstance = browserSync.get(config.server.name);
    bSyncInstance.reload();
    cb();
}

const watchStyles = (cb) => {
    watch(config.source.styles, series(styles, getBrowserSyncAndReload));
    cb();
}

const watchMarkup = (cb) => {
    watch(config.source.markup, series(markup, getBrowserSyncAndReload));
    cb();
}

const watchAssets = (cb) => {
    watch(config.source.assets, series(assets, markup, getBrowserSyncAndReload));
    cb();
}

export default series(watchStyles, watchMarkup, watchAssets);