import { series } from 'gulp';
import assets from './assets.js';
import { markup } from './markup.js';
import { styles } from './styles.js';

export default series(
    styles,
    markup,
    assets
)