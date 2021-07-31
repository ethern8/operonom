import { series } from 'gulp';
import assets from './assets';
import { markup } from './markup';
import { styles } from './styles';

export default series(
    styles,
    markup,
    assets
)