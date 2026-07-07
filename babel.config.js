module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // NB : aucun plugin worklets/reanimated requis ici car nous n'utilisons PAS
    // les Frame Processors. Si vous ajoutez un jour un traitement temps réel
    // (overlay GPU, ML, composition PiP live), ajoutez alors :
    //   plugins: ['react-native-worklets-core/plugin']
  };
};
