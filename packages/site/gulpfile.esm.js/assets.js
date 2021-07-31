import { dest, series, src } from "gulp"
import { config } from "."

const modernNormalizeCss = () => {
    return src("node_modules/modern-normalize/modern-normalize.css")
        .pipe( dest(config.destination.styles) );
}

export default series(modernNormalizeCss);