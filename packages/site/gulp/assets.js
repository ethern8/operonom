import { dest, series, src } from "gulp"
import { config } from "../gulpfile.esm.js"

const modernNormalizeCss = () => {
    return src("node_modules/modern-normalize/modern-normalize.css")
        .pipe( dest(config.destination.styles) );
}

const images = () => {
    return src(config.source.assets)
        .pipe( dest(config.destination.assets) );
}

export default series(modernNormalizeCss, images);