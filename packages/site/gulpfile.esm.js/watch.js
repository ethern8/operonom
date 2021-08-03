import browserSync from "browser-sync";
import { series, watch } from "gulp";
import { config } from ".";
import { markup } from "./markup";
import { styles } from "./styles";

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

export default series(watchStyles, watchMarkup);