import del from 'del';
import { config } from '../gulpfile.esm.js';

export default function(){
    return del([config.server.baseDir]);
}
