const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const RULE = '# whisper.rn\n-keep class com.rnwhisper.** { *; }\n';

/** Keeps whisper.rn’s JNI classes when Android minifies the release build. */
function withWhisperProguard(config) {
  return withDangerousMod(config, [
    'android',
    (next) => {
      const file = path.join(next.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes('com.rnwhisper')) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `${current.trimEnd()}\n\n${RULE}`);
      }
      return next;
    },
  ]);
}

module.exports = withWhisperProguard;
