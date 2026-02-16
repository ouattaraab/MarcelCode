//@ts-check
'use strict';

const path = require('path');

/** @type {import('webpack').Configuration[]} */
const configs = [
  // Extension Host bundle
  {
    name: 'extension',
    target: 'node',
    mode: 'none',
    entry: './src/extension.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'extension.js',
      libraryTarget: 'commonjs2',
    },
    externals: {
      vscode: 'commonjs vscode',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [{ loader: 'ts-loader' }],
        },
      ],
    },
    devtool: 'nosources-source-map',
  },
  // Webview bundle
  {
    name: 'webview',
    target: 'web',
    mode: 'none',
    entry: './src/views/chat/webview.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'webview.js',
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [{ loader: 'ts-loader' }],
        },
      ],
    },
    devtool: 'nosources-source-map',
  },
];

module.exports = configs;
