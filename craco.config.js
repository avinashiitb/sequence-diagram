module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.resolve = webpackConfig.resolve || {};
      webpackConfig.resolve.alias = webpackConfig.resolve.alias || {};

      // Fix Excalidraw's ESM imports for roughjs when using Webpack 5
      webpackConfig.resolve.alias['roughjs/bin/generator'] =
        'roughjs/bin/generator.js';
      webpackConfig.resolve.alias['roughjs/bin/rough'] =
        'roughjs/bin/rough.js';
      webpackConfig.resolve.alias['roughjs/bin/math'] =
        'roughjs/bin/math.js';

      return webpackConfig;
    },
  },
};
