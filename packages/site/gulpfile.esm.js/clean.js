import del from 'del';
import { config } from '.';

export default function(){
    return del([config.server.baseDir]);
}
