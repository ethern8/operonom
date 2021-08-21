import { src, dest, series } from "gulp";
import { rollup } from "rollup";
import rollupConfig from "./utils/rollupConfig";
import { config } from "../gulpfile.esm";

const rollupBundle = async () => {
    const bundle = await rollup({
        input: rollupConfig.input,
        plugins: rollupConfig.plugins
    })
    return bundle.write(rollupConfig.output);
}

const js = () => {
    return src(config.rollup.output)
        .pipe( dest( config.destination.scripts ) );
}

export default series(rollupBundle, js);