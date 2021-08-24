import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { config } from '../../gulpfile.esm';

const rollupConfig = {
	input: 'src/scripts/index.js',
	output: {
		file: 'dest/scripts/bundle.js',
		format: 'iife',
		sourcemap: true,
	},
	plugins: [
		resolve(),
		commonjs({
			include:['node_modules/@ethern8/**']
		}),
		// babel({
		// 	// exclude: 'node_modules/**',
		// 	babelHelpers: 'runtime',
		// 	presets: [
		// 		[
		// 			'@babel/preset-env',
		// 			{
		// 				debug: false,
		// 				useBuiltIns: 'usage',
		// 				corejs: { version: 3, proposals: true },
		// 			},
		// 		],
		// 	],
		// }),
	],
};

export default rollupConfig;