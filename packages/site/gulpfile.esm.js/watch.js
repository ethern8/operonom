import browserSync from "browser-sync";
import { series, watch } from "gulp";
import { config } from ".";
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

export default series(watchStyles);