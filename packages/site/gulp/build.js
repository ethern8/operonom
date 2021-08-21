import { series } from 'gulp';
import assets from './assets.js';
import { markup } from './markup.js';
import { styles } from './styles.js';
import scripts from './scripts.js';

export default series(
    styles,
    scripts,
    markup,
    assets
)